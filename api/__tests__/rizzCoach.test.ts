/**
 * @module api/__tests__/rizzCoach.test
 * Security & functional tests for `/api/rizz-coach` verifying:
 * - 401 on missing/invalid JWT
 * - 403 on non-Pro users (strictly 0 free messages)
 * - 400 on invalid Zod input
 * - 200 with 3 strategies for verified Pro subscribers
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { describe, expect, it, vi } from 'vitest';
import { handleRizzCoach, type RizzCoachDeps } from '../rizz-coach.js';

function createMockResponse(): {
  res: VercelResponse;
  getStatus: () => number;
  getBody: () => Record<string, unknown>;
} {
  let statusCode = 200;
  let payload: Record<string, unknown> = {};

  const res = {
    setHeader: vi.fn().mockReturnThis(),
    status: vi.fn((code: number) => {
      statusCode = code;
      return res;
    }),
    json: vi.fn((body: Record<string, unknown>) => {
      payload = body;
      return res;
    }),
  } as unknown as VercelResponse;

  return {
    res,
    getStatus: () => statusCode,
    getBody: () => payload,
  };
}

const validBody = {
  situation: 'We matched in Lisbon and joked about pastel de nata rankings.',
  goal: 'date_invite',
  tone: 'playful',
  metChannel: 'Hinge',
  city: 'Lisbon',
};

describe('/api/rizz-coach zero-free-message gate', () => {
  it('returns 401 when JWT is missing or invalid', async () => {
    const mock = createMockResponse();
    const deps: RizzCoachDeps = {
      verifyJwt: async () => null,
      checkPro: async () => true,
      generateStrategies: vi.fn(),
      logUsage: vi.fn(),
    };

    const req = { method: 'POST', headers: {}, body: validBody } as unknown as VercelRequest;
    await handleRizzCoach(req, mock.res, deps);

    expect(mock.getStatus()).toBe(401);
    expect(deps.generateStrategies).not.toHaveBeenCalled();
  });

  it('returns 403 for authenticated free-tier users (0 free messages)', async () => {
    const mock = createMockResponse();
    const deps: RizzCoachDeps = {
      verifyJwt: async () => ({ id: 'user-123' }),
      checkPro: async () => false,
      generateStrategies: vi.fn(),
      logUsage: vi.fn(),
    };

    const req = {
      method: 'POST',
      headers: { authorization: 'Bearer valid-jwt' },
      body: validBody,
    } as unknown as VercelRequest;
    await handleRizzCoach(req, mock.res, deps);

    expect(mock.getStatus()).toBe(403);
    expect(mock.getBody().upgradeRequired).toBe(true);
    expect(deps.generateStrategies).not.toHaveBeenCalled();
  });

  it('returns 400 when input fails Zod validation', async () => {
    const mock = createMockResponse();
    const deps: RizzCoachDeps = {
      verifyJwt: async () => ({ id: 'user-123' }),
      checkPro: async () => true,
      generateStrategies: vi.fn(),
      logUsage: vi.fn(),
    };

    const req = {
      method: 'POST',
      headers: { authorization: 'Bearer valid-jwt' },
      body: { situation: 'short', goal: 'banter', tone: 'playful' },
    } as unknown as VercelRequest;
    await handleRizzCoach(req, mock.res, deps);

    expect(mock.getStatus()).toBe(400);
  });

  it('returns 200 with 3 strategies and logs usage for verified Pro subscribers', async () => {
    const mock = createMockResponse();
    const logUsage = vi.fn().mockResolvedValue(undefined);
    const deps: RizzCoachDeps = {
      verifyJwt: async () => ({ id: 'pro-user-1' }),
      checkPro: async () => true,
      generateStrategies: async () => ({
        model: 'gemini-2.5-flash',
        strategies: [
          { title: 'Warm Callback', message: 'Text 1', rationale: 'Why 1' },
          { title: 'Playful Tease', message: 'Text 2', rationale: 'Why 2' },
          { title: 'Direct Invite', message: 'Text 3', rationale: 'Why 3' },
        ],
      }),
      logUsage,
    };

    const req = {
      method: 'POST',
      headers: { authorization: 'Bearer valid-pro-jwt' },
      body: validBody,
    } as unknown as VercelRequest;
    await handleRizzCoach(req, mock.res, deps);

    expect(mock.getStatus()).toBe(200);
    expect((mock.getBody().strategies as unknown[]).length).toBe(3);
    expect(logUsage).toHaveBeenCalledWith('pro-user-1', 'gemini-2.5-flash');
  });
});
