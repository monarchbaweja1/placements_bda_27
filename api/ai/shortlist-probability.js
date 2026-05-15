import { generateChatCompletion, isAiConfigured } from '../shared/aiProvider.js';
import { requireUser } from '../shared/auth.js';
import { applyCors, methodNotAllowed, sendJson } from '../shared/http.js';
import { logError, logInfo, logWarn } from '../shared/logger.js';
import { assertProgrammeAccess, normalizeProgrammeCode } from '../shared/programmeGuard.js';
import { checkRateLimit } from '../shared/rateLimit.js';
import { estimateShortlistProbabilities, scoreWithProfile, tokenize } from '../shared/shortlistScoring.js';
import { getSupabaseAdmin, hasSupabaseServiceRole } from '../shared/supabaseAdmin.js';

const PROGRAMME_DESCRIPTIONS = {
  bda:  'Big Data Analytics — data science, analytics, SQL/Python, ML, consulting roles',
  bifs: 'Banking, Insurance and Financial Services — investment banking, credit, risk, insurance, financial analytics',
  hcm:  'Healthcare Management — pharma, hospital operations, healthcare consulting, market access',
  core: 'General Management / Core MBA — marketing, sales, strategy, operations, consulting, supply chain'
};

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

    const body = req.body || {};
    const { supabase, access } = await resolveShortlistAccess({
      userId: auth.user.id,
      requestedProgramme: body.programme
    });

    const cgpa = parseFloat(body.cgpa);

    if (isNaN(cgpa) || cgpa < 0 || cgpa > 8) {
      return sendJson(res, 400, {
        ok: false,
        error: { code: 'invalid_cgpa', message: 'CGPA must be a number between 0 and 8 (your college grading scale).' }
      });
    }

    const skills     = String(body.skills     || '').trim().slice(0, 4000);
    const projects   = String(body.projects   || '').trim().slice(0, 4000);
    const resumeText = String(body.resumeText || '').trim().slice(0, 80_000);

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
      resumeText,
      targetCompanies
    });

    // AI fallback: estimate unknown companies via Gemini
    const unknowns = estimates.filter(e => !e.known && !e.aiEstimated);
    if (unknowns.length > 0 && isAiConfigured()) {
      const tokens  = tokenize(`${skills} ${projects} ${resumeText}`);
      const cgpaNum = parseFloat(cgpa) || 0;
      const cgpa10  = Math.min(10, (cgpaNum / 8) * 10);

      const aiResults = await Promise.allSettled(
        unknowns.map(est => fetchAiCompanyProfile(est.company, access.programmeCode))
      );

      for (let i = 0; i < unknowns.length; i++) {
        const result = aiResults[i];
        if (result.status !== 'fulfilled' || !result.value) continue;

        const profile = result.value;
        const scored  = scoreWithProfile({ profile, cgpaNum, cgpa10, tokens });
        const idx     = estimates.findIndex(e => e.company === unknowns[i].company);
        if (idx === -1) continue;

        estimates[idx] = {
          company:     profile.name || unknowns[i].company,
          sector:      profile.sector || '',
          probability: scored.probability,
          known:       false,
          aiEstimated: true,
          breakdown:   scored.breakdown,
          reasons:     scored.reasons,
          caveat:      `AI-estimated profile for ${profile.name || unknowns[i].company} in ${access.programmeCode.toUpperCase()} context. Data may not reflect actual hiring criteria — use as directional guidance only.`
        };
      }
    }

    // Persist estimates for known companies (fire-and-forget)
    for (const est of estimates) {
      if (!supabase) continue;
      if (!est.known || est.probability == null) continue;
      supabase
        .from('shortlist_estimates')
        .insert({
          user_id: auth.user.id,
          programme_id: access.userContext.programme?.id,
          input_profile: { cgpa, skills, projects, resumeTextChars: resumeText.length },
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
      companiesKnown: estimates.filter(e => e.known).length,
      companiesAiEstimated: estimates.filter(e => e.aiEstimated).length
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

async function fetchAiCompanyProfile(companyName, programmeCode) {
  const progDesc = PROGRAMME_DESCRIPTIONS[programmeCode] || programmeCode.toUpperCase();
  const systemInstruction = `You are an expert on Indian MBA/PGDM campus placements. You have detailed knowledge of hiring criteria, CGPA thresholds, required skills, and role preferences of companies that recruit from Indian B-schools (IIMs, XLRI, NMIMS, SP Jain, GIM, etc.).`;

  const prompt = `Generate a campus hiring profile for "${companyName}" for MBA/PGDM students in the ${progDesc} specialisation.

Return ONLY a valid JSON object with exactly these fields (no markdown, no explanation):
{
  "name": "${companyName}",
  "sector": "<industry/sector>",
  "minCgpa": <minimum CGPA on 10-point scale, typically 6.0–7.5>,
  "strongCgpa": <competitive CGPA on 10-point scale, typically 7.0–8.5>,
  "requiredSkills": ["skill1", "skill2"],
  "preferredSkills": ["skill1", "skill2"],
  "roleKeywords": ["keyword1", "keyword2"],
  "weights": { "cgpa": 0.25, "skills": 0.40, "role": 0.20, "projects": 0.15 },
  "note": "<one sentence about MBA hiring at this company>"
}

Rules:
- CGPA thresholds are on a 10-point scale (Indian B-school standard)
- requiredSkills: 3–6 lowercase strings for core skills expected for this programme
- preferredSkills: 3–6 lowercase strings for additional valued skills
- roleKeywords: 4–8 lowercase keywords for typical job functions/titles
- weights must sum to exactly 1.0; cgpa: 0.18–0.30, skills: 0.36–0.46, role: 0.14–0.24, projects: 0.10–0.17
- Base everything on real MBA placement patterns, not generic job boards`;

  try {
    const { answer } = await generateChatCompletion({ systemInstruction, prompt });

    const jsonMatch = answer.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const profile = JSON.parse(jsonMatch[0]);

    if (
      typeof profile.minCgpa !== 'number' ||
      typeof profile.strongCgpa !== 'number' ||
      !Array.isArray(profile.requiredSkills) ||
      !profile.weights
    ) return null;

    const wSum = (profile.weights.cgpa || 0) + (profile.weights.skills || 0) +
                 (profile.weights.role  || 0) + (profile.weights.projects || 0);
    if (Math.abs(wSum - 1) > 0.08) return null;

    profile.name        = String(profile.name || companyName).trim();
    profile.minCgpa     = Math.max(5.0, Math.min(9.0, parseFloat(profile.minCgpa)));
    profile.strongCgpa  = Math.max(profile.minCgpa, Math.min(9.5, parseFloat(profile.strongCgpa)));
    profile.requiredSkills  = (profile.requiredSkills  || []).map(s => String(s).toLowerCase());
    profile.preferredSkills = (profile.preferredSkills || []).map(s => String(s).toLowerCase());
    profile.roleKeywords    = (profile.roleKeywords    || []).map(s => String(s).toLowerCase());

    return profile;
  } catch {
    return null;
  }
}

async function resolveShortlistAccess({ userId, requestedProgramme }) {
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
      logWarn('shortlist_programme_access_fallback', {
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
    logWarn('shortlist_programme_lookup_failed', {
      userId,
      message: error?.message || String(error),
      requestedProgramme: fallbackProgramme
    });
    return { supabase: null, access: fallbackAccess };
  }
}
