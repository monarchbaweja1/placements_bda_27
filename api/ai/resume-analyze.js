import { requireUser } from '../shared/auth.js';
import { applyCors, methodNotAllowed, sendJson } from '../shared/http.js';
import { logError, logInfo, logWarn } from '../shared/logger.js';
import { assertProgrammeAccess, normalizeProgrammeCode } from '../shared/programmeGuard.js';
import { checkRateLimit } from '../shared/rateLimit.js';
import { analyzeResumeText, normalizeResumeText } from '../shared/resumeScoring.js';
import { getSupabaseAdmin, hasSupabaseServiceRole } from '../shared/supabaseAdmin.js';

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

    const { supabase, access } = await resolveResumeAnalysisAccess({
      userId: auth.user.id,
      requestedProgramme: req.body?.programme
    });

    const analysis = analyzeResumeText({
      resumeText,
      programme: access.programmeCode,
      targetRole: req.body?.targetRole,
      targetCompany: req.body?.targetCompany
    });

    const saved = await saveResumeAnalysis({
      supabase,
      userId: auth.user.id,
      programmeId: access.userContext.programme?.id,
      analysis
    });

    logInfo('resume_analysis_completed', {
      userId: auth.user.id,
      programmeCode: access.programmeCode,
      analysisId: saved?.id || null,
      overallScore: analysis.overallScore
    });

    return sendJson(res, 200, {
      ok: true,
      analysisId: saved?.id || null,
      createdAt: saved?.created_at || null,
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

async function resolveResumeAnalysisAccess({ userId, requestedProgramme }) {
  const fallbackProgramme = normalizeProgrammeCode(requestedProgramme) || 'bda';
  const fallbackAccess = {
    ok: true,
    programmeCode: fallbackProgramme,
    userContext: { programme: null }
  };

  if (!hasSupabaseServiceRole()) {
    return { supabase: null, access: fallbackAccess };
  }

  try {
    const supabase = getSupabaseAdmin();
    const access = await assertProgrammeAccess({
      supabase,
      userId,
      requestedProgramme,
      requireAssignedProgramme: false
    });

    if (!access.ok) {
      logWarn('resume_programme_access_fallback', {
        userId,
        code: access.error?.code,
        requestedProgramme: fallbackProgramme
      });
      return { supabase, access: fallbackAccess };
    }

    return {
      supabase,
      access: {
        ...access,
        programmeCode: access.programmeCode || fallbackProgramme
      }
    };
  } catch (error) {
    logWarn('resume_programme_lookup_failed', {
      userId,
      message: error?.message || String(error),
      requestedProgramme: fallbackProgramme
    });
    return { supabase: null, access: fallbackAccess };
  }
}

async function saveResumeAnalysis({ supabase, userId, programmeId, analysis }) {
  if (!supabase) return null;

  try {
    const { data, error } = await supabase
      .from('resume_analyses')
      .insert({
        user_id: userId,
        programme_id: programmeId || null,
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
    return data;
  } catch (error) {
    logWarn('resume_analysis_save_failed', {
      userId,
      message: error?.message || String(error)
    });
    return null;
  }
}
