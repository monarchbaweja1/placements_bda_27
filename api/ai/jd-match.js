import { generateChatCompletion, isAiConfigured } from '../shared/aiProvider.js';
import { requireUser } from '../shared/auth.js';
import { applyCors, methodNotAllowed, sendJson } from '../shared/http.js';
import { logError, logInfo } from '../shared/logger.js';
import { normalizeProgrammeCode } from '../shared/programmeGuard.js';
import { checkRateLimit } from '../shared/rateLimit.js';

const MIN_CHARS = 200;
const MAX_CHARS = 60_000;

const PROGRAMME_CONTEXT = {
  bda: {
    name: 'Big Data Analytics (BDA)',
    focus: 'data science, machine learning, SQL, Python, Power BI, Tableau, statistics, analytics consulting, BFSI analytics',
    roles: 'Data Analyst, Business Analyst, Data Scientist, Analytics Consultant, Risk Analyst, BI Developer, ML Engineer',
    companies: 'Deloitte, EY, KPMG, Fractal Analytics, Tiger Analytics, Mu Sigma, Accenture, ThoughtWorks, ZS Associates, Kotak Mahindra, ICICI Bank, HDFC Bank, McKinsey QuantumBlack',
    coreSkills: ['python', 'sql', 'machine learning', 'tableau', 'power bi', 'statistics', 'r', 'excel', 'data visualization', 'predictive modeling', 'pandas', 'numpy', 'scikit-learn'],
    softKeywords: ['data driven', 'analytical thinking', 'stakeholder management', 'problem solving', 'structured thinking', 'business impact', 'hypothesis testing'],
    shortlistCgpa: 7.0,
    weightings: 'skills (35%), keywords ATS (25%), role alignment (25%), experience/projects (15%)'
  },
  bifs: {
    name: 'Banking, Insurance & Financial Services (BIFS)',
    focus: 'investment banking, credit analysis, risk management, insurance underwriting, financial modeling, BFSI operations, treasury',
    roles: 'Relationship Manager, Credit Analyst, Risk Analyst, Investment Banking Analyst, Insurance Manager, Treasury Analyst, Equity Research Analyst',
    companies: 'HDFC Bank, ICICI Bank, Axis Bank, Kotak Mahindra, SBI, Bajaj Finserv, HDFC Life, Aditya Birla Capital, Yes Bank, L&T Finance, Edelweiss, IIFL',
    coreSkills: ['financial modeling', 'credit analysis', 'risk management', 'excel', 'valuation', 'dcf', 'banking operations', 'insurance', 'portfolio management', 'bloomberg', 'capital markets'],
    softKeywords: ['financial analysis', 'client relationship', 'regulatory compliance', 'due diligence', 'underwriting', 'asset management', 'p&l ownership', 'npa management'],
    shortlistCgpa: 7.0,
    weightings: 'skills (30%), keywords ATS (25%), role alignment (30%), experience/projects (15%)'
  },
  hcm: {
    name: 'Healthcare Management (HCM)',
    focus: 'pharma sales, medical devices, hospital operations, healthcare consulting, market access, regulatory affairs, clinical research',
    roles: 'Medical Representative, Product Manager, Hospital Administrator, Healthcare Consultant, Market Access Manager, Operations Manager, Business Development Manager',
    companies: 'Sun Pharma, Cipla, Dr Reddys, Abbott, Pfizer, Johnson & Johnson, Medtronic, Fortis Hospitals, Apollo Hospitals, ZS Associates, IQVIA, Novartis, Roche',
    coreSkills: ['pharma domain knowledge', 'healthcare operations', 'market access', 'regulatory affairs', 'product management', 'clinical knowledge', 'hospital management', 'medical terminology', 'patient outcomes'],
    softKeywords: ['kol management', 'therapy area expertise', 'go-to-market', 'market development', 'healthcare economics', 'formulary management', 'pvt label', 'reimbursement'],
    shortlistCgpa: 6.5,
    weightings: 'domain knowledge (30%), role alignment (30%), keywords ATS (20%), experience/projects (20%)'
  },
  core: {
    name: 'General Management / Core MBA (CORE)',
    focus: 'marketing, sales, brand management, strategy, operations, supply chain, consulting, business development, general management',
    roles: 'Management Trainee, Sales Manager, Brand Manager, Strategy Consultant, Operations Manager, Business Development Manager, Category Manager',
    companies: 'Hindustan Unilever, ITC, P&G, Amazon, Flipkart, BCG, Bain & Company, McKinsey, Asian Paints, Dabur, Marico, Godrej, Nestle, Britannia, Titan',
    coreSkills: ['marketing strategy', 'sales management', 'brand management', 'p&l management', 'supply chain', 'operations', 'team leadership', 'go-to-market strategy', 'consumer insights', 'trade marketing'],
    softKeywords: ['cross-functional collaboration', 'revenue growth', 'market share expansion', 'stakeholder management', 'business development', 'new market entry', 'channel strategy', 'category management'],
    shortlistCgpa: 6.5,
    weightings: 'role alignment (35%), keywords ATS (25%), skills (25%), experience/projects (15%)'
  }
};

export default async function handler(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST']);

  try {
    const auth = await requireUser(req);
    if (!auth.ok) return sendJson(res, auth.status, { ok: false, error: auth.error });

    const rate = checkRateLimit(`jd-match:${auth.user.id}`, { limit: 5, windowMs: 60_000 });
    res.setHeader('X-RateLimit-Remaining', String(rate.remaining));
    res.setHeader('X-RateLimit-Reset', String(rate.resetAt));

    if (!rate.allowed) {
      return sendJson(res, 429, {
        ok: false,
        error: { code: 'rate_limited', message: 'Too many requests. Please try again shortly.' }
      });
    }

    const body       = req.body || {};
    const jdText     = String(body.jdText  || '').trim().slice(0, MAX_CHARS);
    const cvText     = String(body.cvText  || '').trim().slice(0, MAX_CHARS);
    const programme  = normalizeProgrammeCode(body.programme) || 'bda';

    if (jdText.length < MIN_CHARS) {
      return sendJson(res, 400, {
        ok: false,
        error: { code: 'jd_too_short', message: `Job description must be at least ${MIN_CHARS} characters.` }
      });
    }
    if (cvText.length < MIN_CHARS) {
      return sendJson(res, 400, {
        ok: false,
        error: { code: 'cv_too_short', message: `CV / resume must be at least ${MIN_CHARS} characters.` }
      });
    }
    if (!isAiConfigured()) {
      return sendJson(res, 503, {
        ok: false,
        error: { code: 'ai_not_configured', message: 'AI analysis is not available right now.' }
      });
    }

    const result = await analyzeMatch({ jdText, cvText, programme });

    logInfo('jd_match_completed', {
      userId: auth.user.id,
      programme,
      matchScore: result.matchScore,
      verdict: result.shortlistVerdict
    });

    return sendJson(res, 200, { ok: true, programme, ...result });
  } catch (error) {
    logError('jd_match_failed', error);
    return sendJson(res, 500, {
      ok: false,
      error: { code: 'match_failed', message: 'Unable to analyze JD-CV match right now.' }
    });
  }
}

async function analyzeMatch({ jdText, cvText, programme }) {
  const ctx = PROGRAMME_CONTEXT[programme] || PROGRAMME_CONTEXT.bda;

  const systemInstruction = `You are a senior placement consultant and ATS specialist with 15+ years experience in Indian MBA campus recruiting for ${ctx.name}.

You have deep familiarity with:
- Typical roles recruited for this programme: ${ctx.roles}
- Companies that actively recruit: ${ctx.companies}
- Core technical skills evaluated: ${ctx.coreSkills.join(', ')}
- Domain focus: ${ctx.focus}
- Shortlisting weighting for this programme: ${ctx.weightings}

Your analysis must be:
- STRICTLY ACCURATE: scores must reflect real, observable overlap between the JD and CV text
- PROGRAMME-SPECIFIC: factor in what matters specifically for ${ctx.name} campus recruiters
- EVIDENCE-BASED: every strength and gap must cite exact text or absence from the documents
- CALIBRATED: scoring should reflect real shortlisting thresholds at Indian B-schools like IIM, XLRI, NMIMS, SP Jain, GIM
- Never inflate scores — a 70+ means the candidate is genuinely competitive for shortlisting`;

  const prompt = `Perform a precise JD-CV match analysis for a ${ctx.name} MBA candidate.

---JOB DESCRIPTION---
${jdText}

---CANDIDATE CV / RESUME---
${cvText}

Return ONLY a valid JSON object (no markdown, no code fences, no explanation text before or after):
{
  "matchScore": <integer 0-100, the single overall match percentage — strict weighted average per programme weightings>,
  "scoreBreakdown": {
    "skillsMatch":      <integer 0-100, % of required JD skills demonstrably present in CV>,
    "experienceMatch":  <integer 0-100, relevance of candidate's projects/internships to JD requirements>,
    "keywordsMatch":    <integer 0-100, exact+synonym keyword overlap between JD and CV>,
    "roleAlignment":    <integer 0-100, how well candidate's background maps to this specific role>,
    "educationFit":     <integer 0-100, academic background and ${ctx.name} programme fit>
  },
  "strongPoints": [
    "<Strength citing specific CV evidence — e.g., 'Python + Pandas project at XYZ directly matches JD requirement for data wrangling'>",
    "<another specific strength with evidence>",
    "...3 to 6 items total"
  ],
  "weakPoints": [
    "<Gap citing specific JD requirement vs what CV shows — e.g., 'JD requires SQL proficiency with joins/window functions, but CV only mentions basic Excel'>",
    "<another specific gap with JD reference>",
    "...3 to 6 items total"
  ],
  "suggestions": [
    "<Concrete, implementable action to close the most critical gap — be specific about what to add, build, or reframe>",
    "<another actionable suggestion>",
    "...4 to 7 items total"
  ],
  "keywordsToAdd": [
    "<exact keyword or phrase from JD missing in CV — these improve ATS pass rate>",
    "...6 to 14 items"
  ],
  "matchedKeywords": [
    "<keyword/phrase present in both JD and CV — confirms ATS visibility>",
    "...5 to 12 items"
  ],
  "shortlistVerdict": "<one of exactly: Strong Fit | Good Fit | Borderline | Weak Fit>",
  "verdictReason": "<1-2 sentences explaining the shortlist verdict using ${ctx.name} recruiter standards and specific evidence from the documents>",
  "topPriorityAction": "<the single most impactful change the candidate must make — be specific and actionable, not generic>"
}

Scoring anchor points:
- 85-100: Near-perfect match, candidate almost certainly gets shortlisted
- 70-84: Strong match, likely shortlisted with minor improvements
- 55-69: Moderate match, borderline — needs targeted improvements
- 40-54: Weak match, significant skill/experience gaps
- Below 40: Poor fit for this specific role
- keywordsToAdd must be VERBATIM phrases from the JD that ATS systems will scan for
- strongPoints and weakPoints must ALWAYS reference specific text evidence`;

  const { answer } = await generateChatCompletion({
    model: 'gemini-2.5-flash',
    systemInstruction,
    prompt
  });

  const jsonMatch = answer.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('AI returned invalid response format.');

  const raw = JSON.parse(jsonMatch[0]);

  const clamp = (n) => Math.min(100, Math.max(0, Math.round(Number(n) || 0)));
  const arr   = (v, limit) => Array.isArray(v) ? v.slice(0, limit).map(s => String(s)) : [];

  return {
    matchScore:        clamp(raw.matchScore),
    scoreBreakdown: {
      skillsMatch:     clamp(raw.scoreBreakdown?.skillsMatch),
      experienceMatch: clamp(raw.scoreBreakdown?.experienceMatch),
      keywordsMatch:   clamp(raw.scoreBreakdown?.keywordsMatch),
      roleAlignment:   clamp(raw.scoreBreakdown?.roleAlignment),
      educationFit:    clamp(raw.scoreBreakdown?.educationFit)
    },
    strongPoints:      arr(raw.strongPoints, 6),
    weakPoints:        arr(raw.weakPoints, 6),
    suggestions:       arr(raw.suggestions, 7),
    keywordsToAdd:     arr(raw.keywordsToAdd, 14),
    matchedKeywords:   arr(raw.matchedKeywords, 12),
    shortlistVerdict:  ['Strong Fit', 'Good Fit', 'Borderline', 'Weak Fit'].includes(raw.shortlistVerdict)
                         ? raw.shortlistVerdict : 'Borderline',
    verdictReason:     String(raw.verdictReason || ''),
    topPriorityAction: String(raw.topPriorityAction || '')
  };
}
