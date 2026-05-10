import { requireUser } from '../shared/auth.js';
import { applyCors, methodNotAllowed, sendJson } from '../shared/http.js';
import { logError, logInfo } from '../shared/logger.js';
import { assertProgrammeAccess } from '../shared/programmeGuard.js';
import { checkRateLimit } from '../shared/rateLimit.js';
import { analyzeResumeText, normalizeResumeText } from '../shared/resumeScoring.js';
import { getSupabaseAdmin } from '../shared/supabaseAdmin.js';

const MIN_RESUME_CHARS = 500;
const MAX_RESUME_CHARS = 80_000;

export default async function handler(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST']);

  try {
    const auth = await requireUser(req);
    if (!auth.ok) return sendJson(res, auth.status, { ok: false, error: auth.error });

    const rate = checkRateLimit(`resume-analyze:${auth.user.id}`, { limit: 8, windowMs: 60_000 });
    res.setHeader('X-RateLimit-Remaining', String(rate.remaining));
    res.setHeader('X-RateLimit-Reset', String(rate.resetAt));

    if (!rate.allowed) {
      return sendJson(res, 429, {
        ok: false,
        error: {
          code: 'rate_limited',
          message: 'Too many resume analyses. Please try again shortly.'
        }
      });
    }

    const resumeText = normalizeResumeText(req.body?.resumeText);
    if (resumeText.length < MIN_RESUME_CHARS) {
      return sendJson(res, 400, {
        ok: false,
        error: {
          code: 'resume_text_too_short',
          message: `Resume text must contain at least ${MIN_RESUME_CHARS} characters for explainable scoring.`
        }
      });
    }

    if (resumeText.length > MAX_RESUME_CHARS) {
      return sendJson(res, 400, {
        ok: false,
        error: {
          code: 'resume_text_too_long',
          message: `Resume text must be ${MAX_RESUME_CHARS} characters or fewer.`
        }
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

    const analysis = analyzeResumeText({
      resumeText,
      programme: access.programmeCode,
      targetRole: req.body?.targetRole,
      targetCompany: req.body?.targetCompany
    });

    const { data, error } = await supabase
      .from('resume_analyses')
      .insert({
        user_id: auth.user.id,
        programme_id: access.userContext.programme.id,
        parsed_profile: analysis.extracted,
        scores: {
          overall: analysis.overallScore,
          breakdown: analysis.scores,
          explanation: analysis.explanation
        },
        recommendations: {
          missing: analysis.missing,
          recommendations: analysis.recommendations,
          targetRole: analysis.targetRole,
          targetCompany: analysis.targetCompany
        }
      })
      .select('id, created_at')
      .single();

    if (error) throw error;

    logInfo('resume_analysis_completed', {
      userId: auth.user.id,
      programmeCode: access.programmeCode,
      analysisId: data.id,
      overallScore: analysis.overallScore
    });

    return sendJson(res, 200, {
      ok: true,
      analysisId: data.id,
      createdAt: data.created_at,
      analysis
    });
  } catch (error) {
    logError('resume_analysis_failed', error);
    return sendJson(res, 500, {
      ok: false,
      error: {
        code: 'resume_analysis_failed',
        message: 'Unable to analyze resume right now.'
      }
    });
  }
}
