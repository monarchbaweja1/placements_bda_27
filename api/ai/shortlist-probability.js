import { generateChatCompletion, isAiConfigured } from '../shared/aiProvider.js';
import { requireUser } from '../shared/auth.js';
import { applyCors, methodNotAllowed, sendJson } from '../shared/http.js';
import { logError, logInfo, logWarn } from '../shared/logger.js';
import { assertProgrammeAccess, normalizeProgrammeCode } from '../shared/programmeGuard.js';
import { checkRateLimit } from '../shared/rateLimit.js';
import { getSupabaseAdmin, hasSupabaseServiceRole } from '../shared/supabaseAdmin.js';

const MAX_COMPANIES = 8;

// Grounding data: used as reference context fed to Gemini — NOT used for direct formula scoring.
// Gemini reads this alongside the candidate's actual profile and reasons holistically.
const COMPANY_GROUNDING = {
  bda: [
    { name: 'Deloitte',          sector: 'Consulting / Analytics',       cgpaMin: 6.5, cgpaStrong: 7.5, skills: ['sql','python','analytics','data visualization','excel'],           roles: 'data analyst, analytics consultant, business analyst' },
    { name: 'KPMG',              sector: 'Advisory / Analytics',         cgpaMin: 6.5, cgpaStrong: 7.5, skills: ['sql','excel','analytics','power bi','tableau'],                   roles: 'analyst, advisory consultant, audit analytics' },
    { name: 'EY',                sector: 'Advisory / Technology',        cgpaMin: 6.5, cgpaStrong: 7.5, skills: ['sql','python','analytics','excel','power bi'],                    roles: 'technology analyst, data consultant, advisory analyst' },
    { name: 'PwC',               sector: 'Advisory / Consulting',        cgpaMin: 6.5, cgpaStrong: 7.5, skills: ['excel','sql','analytics','data visualization','python'],          roles: 'business analyst, advisory consultant, data analyst' },
    { name: 'Accenture',         sector: 'Technology / Analytics',       cgpaMin: 6.0, cgpaStrong: 7.2, skills: ['sql','python','analytics','machine learning'],                    roles: 'analyst, data engineer, technology solutions, digital analytics' },
    { name: 'Mu Sigma',          sector: 'Analytics / Decision Science', cgpaMin: 6.0, cgpaStrong: 7.0, skills: ['sql','python','statistics','analytics','r'],                      roles: 'decision scientist, business analyst, analytics consultant' },
    { name: 'Fractal Analytics', sector: 'AI / Analytics',              cgpaMin: 6.5, cgpaStrong: 7.5, skills: ['python','machine learning','statistics','sql'],                   roles: 'data scientist, ml engineer, analytics consultant' },
    { name: 'ZS Associates',     sector: 'Analytics / Consulting',       cgpaMin: 7.0, cgpaStrong: 8.0, skills: ['analytics','excel','sql','statistics','python'],                  roles: 'associate, analyst, business analytics consultant' },
    { name: 'Tiger Analytics',   sector: 'Analytics',                   cgpaMin: 6.5, cgpaStrong: 7.5, skills: ['python','sql','machine learning','statistics','analytics'],       roles: 'data scientist, analyst, ml engineer' },
    { name: 'Publicis Sapient',  sector: 'Digital / Analytics',         cgpaMin: 6.5, cgpaStrong: 7.5, skills: ['analytics','sql','excel','python'],                               roles: 'digital analyst, technology consultant' },
    { name: 'Capgemini',         sector: 'Technology / Consulting',      cgpaMin: 6.0, cgpaStrong: 7.0, skills: ['sql','python','analytics','excel'],                               roles: 'analyst, consultant, data analyst' },
    { name: 'HDFC Bank',         sector: 'BFSI / Analytics',            cgpaMin: 6.5, cgpaStrong: 7.5, skills: ['sql','analytics','excel','python'],                               roles: 'data analyst, risk analyst, business analyst' },
    { name: 'ICICI Bank',        sector: 'BFSI / Analytics',            cgpaMin: 6.5, cgpaStrong: 7.5, skills: ['sql','analytics','excel','python'],                               roles: 'analyst, data analyst, risk analytics' },
    { name: 'Kotak Mahindra',    sector: 'BFSI / Analytics',            cgpaMin: 6.5, cgpaStrong: 7.5, skills: ['sql','analytics','excel','python','statistics'],                  roles: 'data analyst, analytics, risk analyst' },
    { name: 'ThoughtWorks',      sector: 'Technology / Consulting',      cgpaMin: 6.5, cgpaStrong: 7.5, skills: ['python','sql','analytics','data engineering'],                    roles: 'data analyst, consultant, engineer' }
  ],
  bifs: [
    { name: 'HDFC Bank',         sector: 'Banking',                     cgpaMin: 6.5, cgpaStrong: 7.5, skills: ['financial analysis','credit risk','excel','banking'],              roles: 'relationship manager, credit analyst, branch banking' },
    { name: 'ICICI Bank',        sector: 'Banking',                     cgpaMin: 6.5, cgpaStrong: 7.5, skills: ['financial analysis','credit risk','excel','banking'],              roles: 'relationship manager, credit analyst, wealth management' },
    { name: 'Axis Bank',         sector: 'Banking',                     cgpaMin: 6.5, cgpaStrong: 7.5, skills: ['financial analysis','credit risk','excel','banking'],              roles: 'relationship manager, credit analyst, corporate banking' },
    { name: 'Kotak Mahindra',    sector: 'Banking / Asset Management',  cgpaMin: 6.5, cgpaStrong: 7.5, skills: ['financial analysis','excel','portfolio','capital markets'],        roles: 'relationship manager, wealth management, asset management' },
    { name: 'Bajaj Finserv',     sector: 'NBFC / Insurance',            cgpaMin: 6.5, cgpaStrong: 7.5, skills: ['financial analysis','credit analysis','excel','insurance'],       roles: 'risk analyst, credit analyst, product manager' },
    { name: 'HDFC Life',         sector: 'Life Insurance',              cgpaMin: 6.5, cgpaStrong: 7.5, skills: ['insurance','financial analysis','excel','sales'],                  roles: 'relationship manager, product manager, actuarial analyst' },
    { name: 'Aditya Birla Capital',sector:'NBFC / Wealth',              cgpaMin: 6.5, cgpaStrong: 7.5, skills: ['financial analysis','excel','portfolio','credit risk'],            roles: 'relationship manager, wealth manager, credit analyst' },
    { name: 'Edelweiss',         sector: 'Investment Banking / Wealth', cgpaMin: 7.0, cgpaStrong: 8.0, skills: ['valuation','financial analysis','excel','capital markets'],        roles: 'research analyst, investment banking analyst, wealth manager' },
    { name: 'L&T Finance',       sector: 'NBFC',                        cgpaMin: 6.5, cgpaStrong: 7.5, skills: ['credit analysis','financial analysis','excel','banking'],          roles: 'credit analyst, relationship manager, risk analyst' },
    { name: 'IIFL',              sector: 'NBFC / Wealth',               cgpaMin: 6.5, cgpaStrong: 7.5, skills: ['financial analysis','excel','capital markets','portfolio'],        roles: 'research analyst, wealth manager, relationship manager' },
    { name: 'SBI',               sector: 'Public Sector Banking',       cgpaMin: 6.0, cgpaStrong: 7.0, skills: ['banking','financial analysis','excel','credit risk'],              roles: 'probationary officer, credit analyst, relationship manager' },
    { name: 'Yes Bank',          sector: 'Banking',                     cgpaMin: 6.5, cgpaStrong: 7.5, skills: ['credit risk','financial analysis','excel','banking'],              roles: 'relationship manager, credit analyst, corporate banking' }
  ],
  hcm: [
    { name: 'Sun Pharma',        sector: 'Pharma',                      cgpaMin: 6.0, cgpaStrong: 7.0, skills: ['pharma domain','sales','crm','healthcare'],                        roles: 'medical representative, product manager, territory manager' },
    { name: 'Cipla',             sector: 'Pharma',                      cgpaMin: 6.0, cgpaStrong: 7.0, skills: ['pharma domain','sales','market access','healthcare'],              roles: 'medical representative, product manager, market access' },
    { name: 'Dr Reddys',         sector: 'Pharma',                      cgpaMin: 6.0, cgpaStrong: 7.0, skills: ['pharma domain','sales','analytics','healthcare'],                  roles: 'medical representative, business analyst, market development' },
    { name: 'Abbott',            sector: 'Pharma / Medical Devices',    cgpaMin: 6.5, cgpaStrong: 7.5, skills: ['pharma domain','medical devices','sales','analytics'],             roles: 'territory manager, product specialist, medical sales' },
    { name: 'Pfizer',            sector: 'Global Pharma',               cgpaMin: 6.5, cgpaStrong: 7.5, skills: ['pharma domain','sales','market access','regulatory'],              roles: 'medical representative, product manager, market access' },
    { name: 'Johnson & Johnson', sector: 'Pharma / Medical Devices',    cgpaMin: 6.5, cgpaStrong: 7.5, skills: ['pharma domain','medical devices','sales','healthcare'],            roles: 'territory manager, product specialist, clinical sales' },
    { name: 'Medtronic',         sector: 'Medical Devices',             cgpaMin: 6.5, cgpaStrong: 7.5, skills: ['medical devices','sales','hospital management','analytics'],       roles: 'territory manager, clinical specialist, device sales' },
    { name: 'ZS Associates',     sector: 'Pharma Consulting / Analytics',cgpaMin:7.0, cgpaStrong: 8.0, skills: ['pharma analytics','analytics','excel','sql'],                      roles: 'associate, business analytics, pharma consulting' },
    { name: 'IQVIA',             sector: 'Healthcare Data / Consulting', cgpaMin: 6.5, cgpaStrong: 7.5, skills: ['healthcare','analytics','market access','pharma domain'],          roles: 'consultant, analyst, data analyst' },
    { name: 'Fortis Hospitals',  sector: 'Hospital Operations',         cgpaMin: 6.0, cgpaStrong: 7.0, skills: ['hospital management','healthcare operations','analytics'],          roles: 'operations manager, hospital administrator, business development' },
    { name: 'Apollo Hospitals',  sector: 'Hospital Operations',         cgpaMin: 6.0, cgpaStrong: 7.0, skills: ['hospital management','healthcare operations','strategy'],           roles: 'operations manager, hospital administrator, strategy' }
  ],
  core: [
    { name: 'Hindustan Unilever', sector: 'FMCG',                      cgpaMin: 6.5, cgpaStrong: 7.5, skills: ['marketing','sales','brand management','analytics','strategy'],     roles: 'management trainee, sales officer, brand manager' },
    { name: 'ITC',               sector: 'FMCG / Diversified',         cgpaMin: 6.5, cgpaStrong: 7.5, skills: ['marketing','sales','strategy','operations','analytics'],            roles: 'management trainee, brand manager, sales officer' },
    { name: 'P&G',               sector: 'FMCG',                       cgpaMin: 7.0, cgpaStrong: 8.0, skills: ['marketing','brand management','analytics','p&l management'],       roles: 'brand manager, sales officer, management trainee' },
    { name: 'Amazon',            sector: 'E-Commerce / Technology',     cgpaMin: 6.5, cgpaStrong: 7.5, skills: ['analytics','operations','supply chain','sql','strategy'],          roles: 'operations manager, business analyst, supply chain manager' },
    { name: 'Flipkart',          sector: 'E-Commerce',                  cgpaMin: 6.5, cgpaStrong: 7.5, skills: ['analytics','operations','supply chain','marketing','sql'],         roles: 'category manager, supply chain, operations, analytics' },
    { name: 'Asian Paints',      sector: 'FMCG / Manufacturing',        cgpaMin: 6.5, cgpaStrong: 7.5, skills: ['sales','marketing','operations','supply chain','analytics'],       roles: 'management trainee, sales officer, operations manager' },
    { name: 'Dabur',             sector: 'FMCG',                        cgpaMin: 6.5, cgpaStrong: 7.5, skills: ['marketing','sales','analytics','brand management','strategy'],     roles: 'management trainee, brand manager, sales officer' },
    { name: 'Marico',            sector: 'FMCG',                        cgpaMin: 6.5, cgpaStrong: 7.5, skills: ['marketing','brand management','sales','analytics'],                roles: 'management trainee, brand manager, sales officer' },
    { name: 'BCG',               sector: 'Management Consulting',       cgpaMin: 7.5, cgpaStrong: 8.5, skills: ['strategy','consulting','analytics','excel','problem solving'],     roles: 'associate, management consultant, business analyst' },
    { name: 'Bain & Company',    sector: 'Management Consulting',       cgpaMin: 7.5, cgpaStrong: 8.5, skills: ['strategy','consulting','analytics','excel','problem solving'],     roles: 'associate, management consultant' },
    { name: 'McKinsey',          sector: 'Management Consulting',       cgpaMin: 7.5, cgpaStrong: 8.5, skills: ['strategy','consulting','analytics','problem solving','excel'],     roles: 'business analyst, associate, management consultant' },
    { name: 'Godrej',            sector: 'FMCG / Diversified',         cgpaMin: 6.5, cgpaStrong: 7.5, skills: ['marketing','sales','operations','analytics','strategy'],           roles: 'management trainee, brand manager, sales manager' },
    { name: 'Nestle',            sector: 'FMCG',                        cgpaMin: 6.5, cgpaStrong: 7.5, skills: ['marketing','sales','brand management','analytics','operations'],   roles: 'management trainee, brand manager, sales officer' },
    { name: 'Titan',             sector: 'Consumer / Retail',           cgpaMin: 6.5, cgpaStrong: 7.5, skills: ['marketing','sales','operations','analytics'],                     roles: 'management trainee, retail operations, sales manager' }
  ]
};

const PROGRAMME_CONTEXT = {
  bda:  'Big Data Analytics: data science, ML, Python, SQL, analytics consulting for BFSI/tech/consulting firms',
  bifs: 'Banking, Insurance & Financial Services: credit analysis, risk management, investment banking, BFSI operations',
  hcm:  'Healthcare Management: pharma sales, medical devices, hospital operations, healthcare consulting, market access',
  core: 'General Management / Core MBA: marketing, sales, strategy, operations, consulting, supply chain, FMCG, business development'
};

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

    if (!isAiConfigured()) {
      return sendJson(res, 503, {
        ok: false,
        error: { code: 'ai_not_configured', message: 'AI shortlist analysis is not available right now.' }
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
        error: { code: 'invalid_cgpa', message: 'CGPA must be a number between 0 and 8.' }
      });
    }

    const skills     = String(body.skills     || '').trim().slice(0, 4000);
    const projects   = String(body.projects   || '').trim().slice(0, 4000);
    const resumeText = String(body.resumeText || '').trim().slice(0, 40_000);

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

    const programme = access.programmeCode;
    const cgpa10    = Math.min(10, (cgpa / 8) * 10);

    // Run all companies through Gemini in parallel
    const results = await Promise.allSettled(
      targetCompanies.map(company =>
        scoreCompanyWithAI({ company, programme, cgpa, cgpa10, skills, projects, resumeText })
      )
    );

    const estimates = targetCompanies.map((company, i) => {
      const result = results[i];
      if (result.status === 'fulfilled' && result.value) {
        return result.value;
      }
      // If AI fails for a specific company, return a neutral fallback
      return {
        company,
        sector: '',
        probability: null,
        known: false,
        aiEstimated: false,
        breakdown: null,
        reasons: ['Analysis unavailable for this company.'],
        caveat: 'Could not analyze this company. Please try again.'
      };
    });

    // Fire-and-forget: persist to DB
    for (const est of estimates) {
      if (!supabase || est.probability == null) continue;
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
        .then(() => {}).catch(() => {});
    }

    logInfo('shortlist_estimated', {
      userId: auth.user.id,
      programmeCode: programme,
      companiesRequested: targetCompanies.length,
      companiesAnalyzed: estimates.filter(e => e.probability != null).length,
      aiPowered: true
    });

    return sendJson(res, 200, {
      ok: true,
      programme,
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

async function scoreCompanyWithAI({ company, programme, cgpa, cgpa10, skills, projects, resumeText }) {
  const progDesc    = PROGRAMME_CONTEXT[programme] || programme.toUpperCase();
  const groundingDB = COMPANY_GROUNDING[programme] || [];
  const groundEntry = groundingDB.find(c => c.name.toLowerCase() === company.toLowerCase().trim());

  const groundingText = groundEntry
    ? `Reference hiring data for ${groundEntry.name}:
  - Sector: ${groundEntry.sector}
  - Minimum CGPA expected (10-point scale): ${groundEntry.cgpaMin} | Competitive CGPA: ${groundEntry.cgpaStrong}
  - Core skills expected: ${groundEntry.skills.join(', ')}
  - Typical roles recruited for this programme: ${groundEntry.roles}`
    : `No pre-loaded data for "${company}". Use your training knowledge about this company's MBA campus hiring patterns at Indian B-schools.`;

  const systemInstruction = `You are an expert Indian MBA placement consultant specializing in ${progDesc} campus placements at top B-schools (IIMs, XLRI, NMIMS, SP Jain, GIM, etc.).

You give brutally honest, accurate shortlist probability assessments based on:
1. The candidate's actual academic profile (CGPA, skills, projects)
2. The company's real hiring standards and selection criteria
3. ${progDesc} programme-specific fit

You NEVER inflate scores. A 70%+ probability means the candidate is genuinely competitive for shortlisting at this company. A 30-50% means significant gaps exist. Never give 80%+ unless the profile truly meets or exceeds the company's typical shortlisting bar.`;

  const prompt = `Assess the shortlist probability for this ${programme.toUpperCase()} candidate at ${company}.

CANDIDATE PROFILE:
- CGPA: ${cgpa.toFixed(2)} / 8.0  (equivalent to ${cgpa10.toFixed(1)} / 10.0)
- Skills & Tools: ${skills || 'Not specified'}
- Projects & Internships: ${projects || 'Not specified'}
${resumeText ? `- Resume summary (first 1500 chars): ${resumeText.slice(0, 1500)}` : ''}

TARGET COMPANY: ${company}
${groundingText}

PROGRAMME: ${progDesc}

Return ONLY a valid JSON object (no markdown, no code fences):
{
  "company": "${company}",
  "sector": "<company sector/industry>",
  "probability": <integer 0-100, realistic shortlisting probability given this candidate's profile for this company>,
  "breakdown": {
    "cgpa":     <integer 0-100, how well CGPA compares to company's threshold>,
    "skills":   <integer 0-100, skills match vs company requirements>,
    "role":     <integer 0-100, candidate's experience alignment to typical roles at this company>,
    "projects": <integer 0-100, strength and relevance of projects/internships for this company>
  },
  "reasons": [
    "<specific reason citing either the candidate's strength or weakness relative to this company's bar>",
    "<another reason — mention actual skills/CGPA/projects where relevant>",
    "...3 to 4 items total"
  ],
  "caveat": "<one sentence about a specific condition or uncertainty for this company, or null if none>"
}

Calibration rules:
- 75-100: Profile clearly meets or exceeds this company's shortlisting bar — strong shortlist candidate
- 55-74: Competitive but some gaps — likely shortlisted with the right positioning
- 35-54: Borderline — significant gaps that need addressing
- Below 35: Unlikely to be shortlisted without substantial profile improvements
- The CGPA component must reflect whether candidate's CGPA is above/below/at the company's known threshold
- reasons must reference the candidate's actual data (e.g., "CGPA of X is above/below the Y threshold")`;

  const { answer } = await generateChatCompletion({
    model: 'gemini-2.5-flash',
    systemInstruction,
    prompt
  });

  const cleaned = answer.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim();
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;

  let raw;
  try { raw = JSON.parse(jsonMatch[0]); } catch { return null; }

  const clamp = (n, lo = 0, hi = 100) => Math.min(hi, Math.max(lo, Math.round(Number(n) || 0)));
  const arr   = (v, limit) => Array.isArray(v) ? v.slice(0, limit).map(s => String(s)) : [];

  return {
    company:     String(raw.company || company).trim(),
    sector:      String(raw.sector  || '').trim(),
    probability: clamp(raw.probability),
    known:       Boolean(groundEntry),
    aiEstimated: true,
    breakdown:   {
      cgpa:     clamp(raw.breakdown?.cgpa),
      skills:   clamp(raw.breakdown?.skills),
      role:     clamp(raw.breakdown?.role),
      projects: clamp(raw.breakdown?.projects)
    },
    reasons:     arr(raw.reasons, 4),
    caveat:      raw.caveat ? String(raw.caveat).trim() : null
  };
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
      access: { ...access, programmeCode: access.programmeCode || fallbackProgramme }
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
