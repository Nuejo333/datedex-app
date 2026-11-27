/**
 * @module platform/gemini/rizzCoachClient
 * Client API caller for the strictly server-side, Stripe-Pro-gated `/api/rizz-coach` endpoint.
 */
import {
  RizzCoachResponseSchema,
  type RizzCoachRequest,
  type RizzCoachResponse,
} from '../../domain/models/monetization';

/**
 * Sends a dating/texting coaching request to `/api/rizz-coach` with a Supabase JWT.
 * Server enforces 0 free messages (401 unauthenticated, 403 non-Pro).
 * @param {string} accessToken - Authenticated Supabase JWT access token.
 * @param {RizzCoachRequest} request - Coaching situation, goal, tone, and context.
 * @returns {Promise<RizzCoachResponse>} Exactly 3 tailored dating/texting strategies.
 * @throws {Error} On HTTP 401/403/400/500 or invalid response payload.
 */
export async function requestRizzCoachStrategies(
  accessToken: string,
  request: RizzCoachRequest,
): Promise<RizzCoachResponse> {
  const response = await fetch('/api/rizz-coach', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(request),
  });

  const json = (await response.json()) as Record<string, unknown>;
  if (!response.ok) {
    const message = typeof json.error === 'string' ? json.error : 'AI Rizz Coach request failed';
    throw new Error(message);
  }

  return RizzCoachResponseSchema.parse(json);
}
