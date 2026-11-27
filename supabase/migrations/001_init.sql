-- ============================================================================
-- Datédex Public App & Shared Supabase Migration: 001_init.sql
-- Versioned schema for consumer PWA (datedex-app) + non-exposed aggregate
-- analytics views for companion private admin app (datedex-admin).
--
-- SECURITY MODEL:
-- - Strict RLS enabled on every public table.
-- - (select auth.uid()) wrapper used for cached per-statement evaluation.
-- - Explicit TO authenticated / TO anon roles (never deprecated auth.role()).
-- - UPDATE policies include both USING and WITH CHECK.
-- - subscriptions is read-only for clients; written strictly by service_role
--   inside verified /api/stripe-webhook.
-- - pin-photos storage bucket is private; accessed via short-lived signed URLs.
-- - admin_analytics schema is NOT exposed to PostgREST/public roles.
-- ============================================================================

create extension if not exists pgcrypto;

-- ----------------------------------------------------------------------------
-- 1. Shared updated_at trigger helper (SECURITY INVOKER, pinned search_path)
-- ----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ----------------------------------------------------------------------------
-- 2. user_profiles (consumer preferences & sync opt-in)
-- ----------------------------------------------------------------------------
create table if not exists public.user_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text check (display_name is null or char_length(display_name) between 1 and 80),
  home_country text check (home_country is null or char_length(home_country) = 2),
  sync_photos boolean not null default false,
  vault_enabled boolean not null default false,
  onboarding_completed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_user_profiles_updated_at on public.user_profiles;
create trigger trg_user_profiles_updated_at
  before update on public.user_profiles
  for each row execute function public.set_updated_at();

alter table public.user_profiles enable row level security;

create policy "user_profiles_select_own"
  on public.user_profiles
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "user_profiles_insert_own"
  on public.user_profiles
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "user_profiles_update_own"
  on public.user_profiles
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "user_profiles_delete_own"
  on public.user_profiles
  for delete
  to authenticated
  using ((select auth.uid()) = user_id);

-- ----------------------------------------------------------------------------
-- 3. pins (encrypted sensitive payload in encrypted_sensitive jsonb)
-- ----------------------------------------------------------------------------
create table if not exists public.pins (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  age smallint check (age is null or (age between 18 and 120)),
  nationality_code text not null check (char_length(nationality_code) = 2),
  city text not null check (char_length(city) between 1 and 120),
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  rating numeric(3,1) not null check (rating between 1.0 and 5.0),
  relationship_status text not null check (
    relationship_status in ('talking', 'first_date', 'dating', 'situationship', 'exclusive', 'archived')
  ),
  met_channel text not null check (
    met_channel in ('Tinder', 'Hinge', 'Bumble', 'Instagram', 'IRL', 'Friends', 'Travel', 'Other')
  ),
  date_met date not null,
  vault_locked boolean not null default false,
  photo_storage_path text,
  -- AES-GCM envelope encrypted client-side: { version, iv, salt, ciphertext }
  encrypted_sensitive jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists pins_user_updated_idx
  on public.pins (user_id, updated_at desc);

create index if not exists pins_user_nationality_active_idx
  on public.pins (user_id, nationality_code)
  where deleted_at is null;

drop trigger if exists trg_pins_updated_at on public.pins;
create trigger trg_pins_updated_at
  before update on public.pins
  for each row execute function public.set_updated_at();

alter table public.pins enable row level security;

create policy "pins_select_own"
  on public.pins
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "pins_insert_own"
  on public.pins
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "pins_update_own"
  on public.pins
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "pins_delete_own"
  on public.pins
  for delete
  to authenticated
  using ((select auth.uid()) = user_id);

-- ----------------------------------------------------------------------------
-- 4. subscriptions (server-managed via Stripe Webhooks; client read-only)
-- ----------------------------------------------------------------------------
create table if not exists public.subscriptions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  status text not null default 'inactive' check (
    status in ('inactive', 'trialing', 'active', 'past_due', 'canceled', 'unpaid')
  ),
  price_id text,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  updated_at timestamptz not null default now()
);

create index if not exists subscriptions_status_idx
  on public.subscriptions (status);

drop trigger if exists trg_subscriptions_updated_at on public.subscriptions;
create trigger trg_subscriptions_updated_at
  before update on public.subscriptions
  for each row execute function public.set_updated_at();

alter table public.subscriptions enable row level security;

create policy "subscriptions_select_own"
  on public.subscriptions
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

-- ----------------------------------------------------------------------------
-- 5. affiliate_offers (managed by private datedex-admin; public read-only active rows)
-- ----------------------------------------------------------------------------
create table if not exists public.affiliate_offers (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 100),
  subtitle text check (subtitle is null or char_length(subtitle) <= 200),
  cta_label text not null check (char_length(cta_label) between 1 and 40),
  target_url text not null check (target_url ~* '^https://'),
  badge text check (badge is null or char_length(badge) <= 32),
  placement text not null check (placement in ('pokedex_feed', 'rizz_footer', 'map_drawer')),
  priority smallint not null default 0,
  is_active boolean not null default false,
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists affiliate_offers_active_placement_idx
  on public.affiliate_offers (placement, priority desc)
  where is_active = true;

drop trigger if exists trg_affiliate_offers_updated_at on public.affiliate_offers;
create trigger trg_affiliate_offers_updated_at
  before update on public.affiliate_offers
  for each row execute function public.set_updated_at();

alter table public.affiliate_offers enable row level security;

create policy "affiliate_offers_read_active"
  on public.affiliate_offers
  for select
  to anon, authenticated
  using (
    is_active = true
    and (starts_at is null or starts_at <= now())
    and (ends_at is null or ends_at >= now())
  );

-- ----------------------------------------------------------------------------
-- 6. monetization_events (anonymous event counters; insert-only from public app)
-- ----------------------------------------------------------------------------
create table if not exists public.monetization_events (
  id bigint generated always as identity primary key,
  event_type text not null check (
    event_type in ('ad_impression', 'ad_click', 'affiliate_impression', 'affiliate_click')
  ),
  slot text not null check (char_length(slot) between 1 and 64),
  offer_id uuid references public.affiliate_offers(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists monetization_events_type_created_idx
  on public.monetization_events (event_type, created_at desc);

alter table public.monetization_events enable row level security;

create policy "monetization_events_insert_anon_auth"
  on public.monetization_events
  for insert
  to anon, authenticated
  with check (
    event_type in ('ad_impression', 'ad_click', 'affiliate_impression', 'affiliate_click')
    and char_length(slot) between 1 and 64
  );

-- Public RPC helper for clean telemetry submission without returning PII
create or replace function public.record_monetization_event(
  p_event_type text,
  p_slot text,
  p_offer_id uuid default null
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  insert into public.monetization_events (event_type, slot, offer_id)
  values (p_event_type, left(trim(p_slot), 64), p_offer_id);
end;
$$;

grant execute on function public.record_monetization_event(text, text, uuid) to anon, authenticated;

-- ----------------------------------------------------------------------------
-- 7. ai_usage_logs (server-written audit trail for Pro Rizz Coach usage)
-- ----------------------------------------------------------------------------
create table if not exists public.ai_usage_logs (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  model text not null,
  created_at timestamptz not null default now()
);

create index if not exists ai_usage_logs_user_created_idx
  on public.ai_usage_logs (user_id, created_at desc);

alter table public.ai_usage_logs enable row level security;

create policy "ai_usage_logs_select_own"
  on public.ai_usage_logs
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

-- ----------------------------------------------------------------------------
-- 8. Private Storage Bucket: pin-photos
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'pin-photos',
  'pin-photos',
  false,
  5242880,
  array['image/webp', 'image/jpeg']
)
on conflict (id) do nothing;

create policy "pin_photos_select_own"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'pin-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "pin_photos_insert_own"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'pin-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "pin_photos_update_own"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'pin-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'pin-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "pin_photos_delete_own"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'pin-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- ----------------------------------------------------------------------------
-- 9. Private Admin Aggregate Schema (read strictly by datedex-admin via service_role)
-- ----------------------------------------------------------------------------
create schema if not exists admin_analytics;

revoke all on schema admin_analytics from public, anon, authenticated;
grant usage on schema admin_analytics to service_role;

create or replace view admin_analytics.v_user_overview as
select
  count(*)::bigint as total_profiles,
  count(*) filter (where onboarding_completed)::bigint as onboarded_profiles,
  count(*) filter (where sync_photos)::bigint as photo_sync_opt_in_count,
  count(*) filter (where vault_enabled)::bigint as vault_enabled_count
from public.user_profiles;

create or replace view admin_analytics.v_subscription_summary as
select
  status,
  count(*)::bigint as subscriber_count
from public.subscriptions
group by status;

create or replace view admin_analytics.v_monetization_daily as
select
  date_trunc('day', created_at)::date as event_day,
  event_type,
  slot,
  count(*)::bigint as total_events
from public.monetization_events
group by date_trunc('day', created_at)::date, event_type, slot;

create or replace view admin_analytics.v_pin_country_totals as
select
  nationality_code,
  count(*)::bigint as total_pins,
  round(avg(rating)::numeric, 2) as avg_rating
from public.pins
where deleted_at is null
group by nationality_code;

revoke all on all tables in schema admin_analytics from public, anon, authenticated;
grant select on all tables in schema admin_analytics to service_role;
