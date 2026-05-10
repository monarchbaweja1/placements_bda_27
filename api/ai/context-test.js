import { requireUser } from '../shared/auth.js';
import { applyCors, methodNotAllowed, sendJson } from '../shared/http.js';
import { logError } from '../shared/logger.js';
import { assertProgrammeAccess } from '../shared/programmeGuard.js';
import { checkRateLimit } from '../shared/rateLimit.js';
import { getSupabaseAdmin } from '../shared/supabaseAdmin.js';

export default async function handler(req, res) {
  if (applyCors(req, res)) return;
  if (!['GET', 'POST'].includes(req.method)) return methodNotAllowed(res, ['GET', 'POST']);

  try {
    const auth = await requireUser(req);
    if (!auth.ok) return sendJson(res, auth.status, { ok: false, error: auth.error });

    const rate = checkRateLimit(`context-test:${auth.user.id}`, { limit: 20, windowMs: 60_000 });
    res.setHeader('X-RateLimit-Remaining', String(rate.remaining));
    res.setHeader('X-RateLimit-Reset', String(rate.resetAt));

    if (!rate.allowed) {
      return sendJson(res, 429, {
        ok: false,
        error: {
          code: 'rate_limited',
          message: 'Too many requests. Please try again shortly.'
        }
      });
    }

    const requestedProgramme = req.method === 'GET'
      ? req.query.programme
      : req.body?.programme;

    const supabase = getSupabaseAdmin();
    const access = await assertProgrammeAccess({
      supabase,
      userId: auth.user.id,
      requestedProgramme
    });

    if (!access.ok) return sendJson(res, access.status, { ok: false, error: access.error });

    sendJson(res, 200, {
      ok: true,
      user: {
        id: auth.user.id,
        email: auth.user.email
      },
      programme: {
        code: access.programmeCode,
        assigned: access.userContext.programme
      },
      role: access.userContext.role,
      message: 'Authenticated AI foundation context is available.'
    });
  } catch (error) {
    logError('context_test_failed', error);
    sendJson(res, 500, {
      ok: false,
      error: {
        code: 'context_test_failed',
        message: 'Unable to verify AI context.'
      }
    });
  }
}
