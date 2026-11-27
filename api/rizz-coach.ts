/**
 * @module api/rizz-coach
 * Zero-free-message server-side AI Dating & Rizz Coach endpoint.
 * Strictly requires:
 *  1) Valid Supabase JWT (`401` otherwise)
 *  2) Active Pro subscription in `public.subscriptions` (`403` otherwise — 0 free messages)
 *  3) Validated Zod input (`400` otherwise)
 * Invokes `@google/genai` (`gemini-2.5-flash`) strictly server-side and returns 3 strategies.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleGenAI, Type } from '@google/genai';
import {
  RizzCoachRequestSchema,
  RizzCoachResponseSchema,
  type RizzCoachRequest,
  type RizzCoachResponse,
} from '../src/domain/models/monetization.js';
import {
  checkUserProSubscription,
  getSupabaseAdminClient,
  verifySupabaseJwt,
} from './_lib/auth.js';
import { parseJsonBody, requireMethod, sendJson } from './_lib/http.js';

const GEMINI_MODEL = 'gemini-2.5-flash';

/**
 * Injectable dependencies allowing deterministic Vitest verification of auth,
 * Pro subscription gating, and Gemini response handling.
 */
export interface RizzCoachDeps {
  verifyJwt: (authHeader: string | string[] | undefined) => Promise<{ id: string } | null>;
  checkPro: (userId: string) => Promise<boolean>;
  generateStrategies: (input: RizzCoachRequest) => Promise<RizzCoachResponse>;
  logUsage: (userId: string, model: string) => Promise<void>;
}

async function defaultGenerateStrategies(input: RizzCoachRequest): Promise<RizzCoachResponse> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error('Server missing GEMINI_API_KEY');
  }

  const ai = new GoogleGenAI({ apiKey });
  const prompt = [
    'You are Datédex Rizz Coach — a respectful, socially calibrated dating & texting strategist.',
    'Generate EXACTLY 3 distinct, natural, non-cringe, respectful messaging strategies tailored to the context.',
    `Goal: ${input.goal}`,
    `Tone: ${input.tone}`,
    `Met via: ${input.metChannel}`,
    input.city ? `City context: ${input.city}` : '',
    `Situation: ${input.situation}`,
  ]
    .filter(Boolean)
    .join('\n');

  const response = await ai.models.generateContent({
    model: GEMINI_MODEL,
    contents: prompt,
    config: {
      temperature: 0.8,
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          strategies: {
            type: Type.ARRAY,
            minItems: 3,
            maxItems: 3,
            items: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING },
                message: { type: Type.STRING },
                rationale: { type: Type.STRING },
              },
              required: ['title', 'message', 'rationale'],
            },
          },
        },
        required: ['strategies'],
      },
    },
  });

  const text = response.text?.trim() ?? '';
  const parsedJson = JSON.parse(text) as { strategies?: unknown };
  return RizzCoachResponseSchema.parse({
    strategies: parsedJson.strategies,
    model: GEMINI_MODEL,
  });
}

function createDefaultDeps(): RizzCoachDeps {
  const admin = getSupabaseAdminClient();
  return {
    verifyJwt: (authHeader) => verifySupabaseJwt(authHeader, admin),
    checkPro: async (userId) => {
      const result = await checkUserProSubscription(userId, admin);
      return result.isPro;
    },
    generateStrategies: defaultGenerateStrategies,
    logUsage: async (userId, model) => {
      await admin.from('ai_usage_logs').insert({ user_id: userId, model });
    },
  };
}

/**
 * Core handler for `/api/rizz-coach`, accepting optional injected dependencies for unit tests.
 * @param {VercelRequest} req - Incoming Vercel request.
 * @param {VercelResponse} res - Outgoing Vercel response.
 * @param {RizzCoachDeps} [deps] - Optional dependency overrides for tests.
 * @returns {Promise<void>}
 */
export async function handleRizzCoach(
  req: VercelRequest,
  res: VercelResponse,
  deps?: RizzCoachDeps,
): Promise<void> {
  if (!requireMethod(req, res, 'POST')) return;

  const rawBody = parseJsonBody(req);
  const parsedInput = RizzCoachRequestSchema.safeParse(rawBody);
  if (!parsedInput.success) {
    sendJson(res, 400, {
      error: parsedInput.error.issues.map((i) => i.message).join('; '),
    });
    return;
  }

  let resolvedDeps: RizzCoachDeps;
  try {
    resolvedDeps = deps ?? createDefaultDeps();
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Server configuration error';
    sendJson(res, 500, { error: message });
    return;
  }

  // Gate 1: Strict Supabase JWT authentication check (0 anonymous requests)
  const user = await resolvedDeps.verifyJwt(req.headers.authorization);
  if (!user) {
    sendJson(res, 401, { error: 'Authentication required. Sign in to use AI Rizz Coach.' });
    return;
  }

  // Gate 2: Strict server-side Pro subscription check (0 free messages)
  const isPro = await resolvedDeps.checkPro(user.id);
  if (!isPro) {
    sendJson(res, 403, {
      error: 'Datédex Pro (€2.99/mo) subscription required. 0 free messages are available.',
      upgradeRequired: true,
    });
    return;
  }

  try {
    const output = await resolvedDeps.generateStrategies(parsedInput.data);
    await resolvedDeps.logUsage(user.id, output.model);
    sendJson(res, 200, output);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'AI coaching generation failed';
    sendJson(res, 502, { error: message });
  }
}

/**
 * Vercel Serverless Function entrypoint for `POST /api/rizz-coach`.
 * @param {VercelRequest} req - Incoming HTTP request.
 * @param {VercelResponse} res - Outgoing HTTP response.
 * @returns {Promise<void>}
 */
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  await handleRizzCoach(req, res);
}
