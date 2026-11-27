/**
 * @module api/_lib/http
 * Shared HTTP utilities for Vercel Serverless Functions: typed JSON responses,
 * security headers, and raw body buffering for Stripe webhook signature verification.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';

/**
 * Sends a typed JSON response with strict `nosniff` and `no-store` headers.
 * @param {VercelResponse} res - Vercel HTTP response object.
 * @param {number} statusCode - HTTP status code.
 * @param {unknown} body - Serializable response payload.
 * @returns {void}
 */
export function sendJson(res: VercelResponse, statusCode: number, body: unknown): void {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.status(statusCode).json(body);
}

/**
 * Enforces an expected HTTP method on a serverless route.
 * @param {VercelRequest} req - Vercel HTTP request object.
 * @param {VercelResponse} res - Vercel HTTP response object.
 * @param {string} method - Expected HTTP verb (e.g. `'POST'`).
 * @returns {boolean} True when method matches; otherwise sends 405 and returns false.
 */
export function requireMethod(req: VercelRequest, res: VercelResponse, method: string): boolean {
  if (req.method !== method) {
    res.setHeader('Allow', method);
    sendJson(res, 405, { error: `Method ${req.method ?? 'UNKNOWN'} not allowed` });
    return false;
  }
  return true;
}

/**
 * Reads the unparsed raw request body Buffer required by `stripe.webhooks.constructEvent`.
 * @param {VercelRequest} req - Incoming webhook request stream.
 * @returns {Promise<Buffer>} Raw UTF-8 payload bytes.
 */
export async function readRawBody(req: VercelRequest): Promise<Buffer> {
  if (Buffer.isBuffer(req.body)) {
    return req.body;
  }
  if (typeof req.body === 'string') {
    return Buffer.from(req.body, 'utf8');
  }
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk, 'utf8') : Buffer.from(chunk));
  }
  if (chunks.length > 0) {
    return Buffer.concat(chunks);
  }
  if (req.body && typeof req.body === 'object') {
    return Buffer.from(JSON.stringify(req.body), 'utf8');
  }
  return Buffer.alloc(0);
}

/**
 * Extracts and parses a JSON body safely whether pre-parsed by Vercel or raw.
 * @param {VercelRequest} req - Incoming HTTP request.
 * @returns {unknown} Parsed JSON body or null if invalid.
 */
export function parseJsonBody(req: VercelRequest): unknown {
  if (req.body === undefined || req.body === null) return {};
  if (typeof req.body === 'string') {
    try {
      return JSON.parse(req.body) as unknown;
    } catch {
      return null;
    }
  }
  return req.body;
}
