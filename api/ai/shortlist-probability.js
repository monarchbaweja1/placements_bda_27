import { requireUser } from '../shared/auth.js';
import { applyCors, methodNotAllowed, sendJson } from '../shared/http.js';
import { logError, logInfo } from '../shared/logger.js';
import { assertProgrammeAccess } from '../shared/programmeGuard.js';
import { checkRateLimit } from '../shared/rateLimit.js';
import { estimateShortlistProbabilities } from '../shared/shortlistScoring.js';
import { getSupabaseAdmin } from '../shared/supabaseAdmin.js';

const MAX_COMPANIES = 8;

export default async function handler(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST']);

  try {
    const auth = await requireUser(req);
    if (!auth.ok) return sendJson(res, auth.status, { ok: false, error: auth.error });

    const rate = checkRateLimit(`shortlist:${auth.user.id}`, { limit: 6, windowMs: 60_000 });
    res.setHeader('X-RateLimit-Remaining', String(rate.remaining));
    res.setHeader('X-RateLimit-Reset', String(rate.resetAt));

    if (!rate.allowed) {
      return sendJson(res, 429, {
        ok: false,
        error: { code: 'rate_limited', message: 'Too many requests. Please try again shortly.' }
      });
    }

    const supabase = getSupabaseAdmin();
    const access = await assertProgrammeAccess({
      supabase,
      userId: auth.user.id,
      requestedProgramme: req.body?.programme,
      requireAssignedProgramme: true
    });

    if (!access.ok) return sendJson(res, access.status, { ok: false, error: access.error });

    const body = req.body || {};
    const cgpa = parseFloat(body.cgpa);

    if (isNaN(cgpa) || cgpa < 0 || cgpa > 10) {
      return sendJson(res, 400, {
        ok: false,
        error: { code: 'invalid_cgpa', message: 'CGPA must be a number between 0 and 10.' }
      });
    }

    const skills   = String(body.skills   || '').trim().slice(0, 4000);
    const projects = String(body.projects  || '').trim().slice(0, 4000);

    const rawCompanies = Array.isArray(body.targetCompanies) ? body.targetCompanies : [];
    const targetCompanies = rawCompanies
      .map(c => String(c).trim())
      .filter(Boolean)
      .slice(0, MAX_COMPANIES);

    if (!targetCompanies.length) {
      return sendJson(res, 400, {
        ok: false,
        error: { code: 'no_companies', message: 'Provide at least one target company name.' }
      });
    }

    const estimates = estimateShortlistProbabilities({
      programme: access.programmeCode,
      cgpa,
      skills,
      projects,
      targetCompanies
    });

    // Persist estimates for known companies (fire-and-forget)
    for (const est of estimates) {
      if (!est.known || est.probability == null) continue;
      supabase
        .from('shortlist_estimates')
        .insert({
          user_id: auth.user.id,
          programme_id: access.userContext.programme?.id,
          input_profile: { cgpa, skills, projects },
          probability: est.probability,
          reasons: est.reasons || [],
          caveats: est.caveat
        })
        .then(() => {})
        .catch(() => {});
    }

    logInfo('shortlist_estimated', {
      userId: auth.user.id,
      programmeCode: access.programmeCode,
      companiesRequested: targetCompanies.length,
      companiesKnown: estimates.filter(e => e.known).length
    });

    return sendJson(res, 200, {
      ok: true,
      programme: access.programmeCode,
      cgpa,
      estimates
    });
  } catch (error) {
    logError('shortlist_probability_failed', error);
    return sendJson(res, 500, {
      ok: false,
      error: { code: 'estimation_failed', message: 'Unable to estimate shortlist probability right now.' }
    });
  }
}
