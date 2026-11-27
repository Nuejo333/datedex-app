/**
 * @module features/rizz-coach/RizzCoachPanel
 * Strictly Pro-gated (0 free messages) AI Dating & Rizz Coach UI powered by
 * `/api/rizz-coach` (`gemini-2.5-flash`) and Stripe Checkout (€2.99/mo).
 */
import { useState, type FormEvent } from 'react';
import { Copy, Crown, Lock, Sparkles } from 'lucide-react';
import {
  RizzCoachRequestSchema,
  type RizzCoachRequest,
  type RizzCoachResponse,
} from '../../domain/models/monetization';
import { useTranslation } from '../../platform/i18n/LanguageContext';

/**
 * Props for `RizzCoachPanel`.
 */
export interface RizzCoachPanelProps {
  isAuthenticated: boolean;
  isPro: boolean;
  onUpgradeToPro: () => Promise<void>;
  onOpenBillingPortal: () => Promise<void>;
  onRequestCoaching: (request: RizzCoachRequest) => Promise<RizzCoachResponse>;
  onGoToVaultAuth: () => void;
}

/**
 * Renders the zero-free-message AI Rizz Coach paywall or Pro coaching studio.
 * @param {RizzCoachPanelProps} props - Auth, Pro subscription state, and API callbacks.
 * @returns {React.JSX.Element} AI Rizz Coach view.
 */
export function RizzCoachPanel({
  isAuthenticated,
  isPro,
  onUpgradeToPro,
  onOpenBillingPortal,
  onRequestCoaching,
  onGoToVaultAuth,
}: RizzCoachPanelProps): React.JSX.Element {
  const { t } = useTranslation();
  const [situation, setSituation] = useState('');
  const [goal, setGoal] = useState<RizzCoachRequest['goal']>('banter');
  const [tone, setTone] = useState<RizzCoachRequest['tone']>('playful');
  const [metChannel, setMetChannel] = useState('Hinge');
  const [city, setCity] = useState('');
  const [result, setResult] = useState<RizzCoachResponse | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);

  const handleSubmit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    setErrorMsg(null);
    const parsed = RizzCoachRequestSchema.safeParse({
      situation,
      goal,
      tone,
      metChannel,
      city,
    });
    if (!parsed.success) {
      setErrorMsg(parsed.error.issues[0]?.message ?? t('rizz.invalidInput'));
      return;
    }

    setBusy(true);
    try {
      const response = await onRequestCoaching(parsed.data);
      setResult(response);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : t('rizz.generateError'));
    } finally {
      setBusy(false);
    }
  };

  if (!isAuthenticated || !isPro) {
    return (
      <section className="space-y-4 rounded-2xl border border-amber-400/25 bg-gradient-to-b from-[#171b2b] to-[#121622] p-5">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-amber-400/15 text-amber-300">
            <Crown className="h-6 w-6" aria-hidden="true" />
          </div>
          <div>
            <h2 className="text-base font-bold text-white">{t('rizz.title')}</h2>
            <p className="text-xs text-amber-300">{t('rizz.priceMeta')}</p>
          </div>
        </div>

        <p className="text-xs leading-relaxed text-slate-300">{t('rizz.description')}</p>

        <div className="rounded-xl border border-white/10 bg-slate-900/70 p-3 text-xs text-slate-300">
          <p className="inline-flex items-center gap-1.5 font-semibold text-white">
            <Lock className="h-3.5 w-3.5 text-rose-400" aria-hidden="true" />
            {t('rizz.serverVerified')}
          </p>
          <p className="mt-1 text-[11px] text-slate-400">
            {isAuthenticated ? t('rizz.freeTierNote') : t('rizz.signedOutNote')}
          </p>
        </div>

        {errorMsg && (
          <p role="alert" className="text-xs text-rose-300">
            {errorMsg}
          </p>
        )}

        {isAuthenticated ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setErrorMsg(null);
              setBusy(true);
              void onUpgradeToPro()
                .catch((e: unknown) =>
                  setErrorMsg(e instanceof Error ? e.message : t('rizz.checkoutUnavailable')),
                )
                .finally(() => setBusy(false));
            }}
            className="w-full rounded-xl bg-gradient-to-r from-amber-400 to-rose-500 px-4 py-3 text-sm font-bold text-slate-950 shadow-lg hover:brightness-110 disabled:opacity-60"
          >
            {busy ? t('rizz.openingCheckout') : t('rizz.unlockPro')}
          </button>
        ) : (
          <button
            type="button"
            onClick={onGoToVaultAuth}
            className="w-full rounded-xl bg-white/10 px-4 py-3 text-sm font-semibold text-white hover:bg-white/15"
          >
            {t('rizz.signInToUpgrade')}
          </button>
        )}
      </section>
    );
  }

  return (
    <div className="space-y-4">
      <section className="space-y-3 rounded-2xl border border-amber-400/25 bg-[#121622] p-4">
        <div className="flex items-center justify-between">
          <h2 className="inline-flex items-center gap-1.5 text-sm font-bold text-white">
            <Sparkles className="h-4 w-4 text-amber-300" aria-hidden="true" />
            {t('rizz.activeTitle')}
          </h2>
          <button
            type="button"
            onClick={() => void onOpenBillingPortal()}
            className="text-xs font-medium text-amber-300 hover:underline"
          >
            {t('rizz.manageBilling')}
          </button>
        </div>

        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-3">
          <div>
            <label htmlFor="rizz-situation" className="mb-1 block text-xs font-medium text-slate-300">
              {t('rizz.situationLabel')}
            </label>
            <textarea
              id="rizz-situation"
              required
              minLength={10}
              maxLength={1200}
              rows={3}
              value={situation}
              onChange={(e) => setSituation(e.target.value)}
              placeholder={t('rizz.situationPlaceholder')}
              className="dd-input resize-y text-xs"
            />
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <select
              aria-label={t('rizz.goalAria')}
              value={goal}
              onChange={(e) => setGoal(e.target.value as RizzCoachRequest['goal'])}
              className="dd-input text-xs"
            >
              <option value="opener">{t('rizz.goal.opener')}</option>
              <option value="banter">{t('rizz.goal.banter')}</option>
              <option value="date_invite">{t('rizz.goal.date_invite')}</option>
              <option value="recovery">{t('rizz.goal.recovery')}</option>
              <option value="spark">{t('rizz.goal.spark')}</option>
            </select>

            <select
              aria-label={t('rizz.toneAria')}
              value={tone}
              onChange={(e) => setTone(e.target.value as RizzCoachRequest['tone'])}
              className="dd-input text-xs"
            >
              <option value="playful">{t('rizz.tone.playful')}</option>
              <option value="confident">{t('rizz.tone.confident')}</option>
              <option value="warm">{t('rizz.tone.warm')}</option>
              <option value="direct">{t('rizz.tone.direct')}</option>
            </select>

            <input
              type="text"
              aria-label={t('rizz.channelAria')}
              value={metChannel}
              onChange={(e) => setMetChannel(e.target.value)}
              placeholder={t('rizz.channelPlaceholder')}
              className="dd-input text-xs"
            />

            <input
              type="text"
              aria-label={t('rizz.cityAria')}
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder={t('rizz.cityPlaceholder')}
              className="dd-input text-xs"
            />
          </div>

          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-xl bg-gradient-to-r from-rose-500 to-amber-500 px-4 py-2.5 text-xs font-bold text-white hover:brightness-110 disabled:opacity-60"
          >
            {busy ? t('rizz.crafting') : t('rizz.generate')}
          </button>
        </form>
      </section>

      {errorMsg && (
        <p role="alert" className="rounded-xl border border-rose-500/40 bg-rose-500/15 px-3 py-2 text-xs text-rose-200">
          {errorMsg}
        </p>
      )}

      {result && (
        <div className="space-y-2.5">
          {result.strategies.map((strategy, idx) => (
            <article
              key={`${strategy.title}-${idx}`}
              className="space-y-2 rounded-2xl border border-white/10 bg-[#121622] p-4"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold text-amber-300 uppercase">
                  {t('rizz.strategyLabel', { index: idx + 1, title: strategy.title })}
                </h3>
                <button
                  type="button"
                  onClick={() => {
                    void navigator.clipboard?.writeText(strategy.message);
                    setCopiedIdx(idx);
                    setTimeout(() => setCopiedIdx(null), 1500);
                  }}
                  className="inline-flex items-center gap-1 rounded-lg bg-white/10 px-2 py-1 text-[11px] text-slate-200 hover:bg-white/15"
                >
                  <Copy className="h-3 w-3" aria-hidden="true" />
                  {copiedIdx === idx ? t('rizz.copied') : t('rizz.copy')}
                </button>
              </div>
              <p className="rounded-xl bg-slate-900/70 p-3 text-sm text-white">
                “{strategy.message}”
              </p>
              <p className="text-[11px] text-slate-400">{strategy.rationale}</p>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
