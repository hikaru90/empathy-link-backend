import { Hono } from 'hono';
import { lastVerificationLinks } from '../lib/auth.js';
import type { Env } from '../types/hono.js';

const test = new Hono<Env>();

/**
 * Endpoint to retrieve the last verification link sent to an email.
 * ONLY available in non-production environments.
 */
test.get('/last-verification-link', (c) => {
  if (process.env.NODE_ENV === 'production') {
    return c.json({ error: 'Not allowed in production' }, 403);
  }

  const email = c.req.query('email');
  if (!email) {
    return c.json({ error: 'Email query parameter is required' }, 400);
  }

  const link = lastVerificationLinks.get(email);
  if (!link) {
    return c.json({ error: 'No verification link found for this email' }, 404);
  }

  return c.json({ link });
});

export default test;
