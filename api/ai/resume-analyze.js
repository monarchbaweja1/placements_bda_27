import { generateChatCompletion, isAiConfigured } from '../shared/aiProvider.js';
import { requireUser } from '../shared/auth.js';
import { applyCors, methodNotAllowed, sendJson } from '../shared/http.js';
import { logError, logInfo, logWarn } from '../shared/logger.js';
import { assertProgrammeAccess, normalizeProgrammeCode } from '../shared/programmeGuard.js';
import { checkRateLimit } from '../shared/rateLimit.js';
import { normalizeResumeText } from '../shared/resumeScoring.js';
import { getSupabaseAdmin, hasSupabaseServiceRole } from '../shared/supabaseAdmin.js';

const MIN_RESUME_CHARS = 500;
const MAX_RESUME_CHARS = 80_000;

const PROGRAMME_CONTEXT = {
  bda: {
    name: 'Big Data Analytics (BDA)',
    focus: 'data science, machine learning, SQL, Python, Power BI, Tableau, statistics, analytics consulting, BFSI analytics',
    roles: 'Data Analyst, Business Analyst, Data Scientist, Analytics Consultant, Risk Analyst, BI Developer',
    coreSkills: ['python', 'sql', 'machine learning', 'tableau', 'power bi', 'statistics', 'r', 'excel', 'data visualization', 'predictive modeling'],
    tools: ['pandas', 'numpy', 'scikit-learn', 'tensorflow', 'pytorch', 'spark', 'mysql', 'postgresql', 'bigquery', 'sas'],
    companies: 'Deloitte, EY, KPMG, Fractal Analytics, Tiger Analytics, Mu Sigma, Accenture, ZS Associates, ThoughtWorks',
    atsKeywords: ['data-driven', 'analytical thinking', 'stakeholder management', 'structured problem solving', 'business impact', 'hypothesis testing'],
    weights: 'ATS structure (15%), core skills (30%), tools (15%), role alignment (20%), impact/metrics (10%), projects (10%)'
  },
  bifs: {
    name: 'Banking, Insurance & Financial Services (BIFS)',
    focus: 'investment banking, credit analysis, risk management, insurance, financial modeling, BFSI operations, treasury, capital markets',
    roles: 'Relationship Manager, Credit Analyst, Risk Analyst, Investment Banking Analyst, Insurance Manager, Treasury Analyst',
    coreSkills: ['financial modeling', 'credit analysis', 'risk management', 'excel', 'valuation', 'dcf', 'banking operations', 'insurance', 'portfolio management'],
    tools: ['excel', 'bloomberg', 'python', 'sql', 'power bi', 'tableau', 'cfa knowledge', 'frm knowledge'],
    companies: 'HDFC Bank, ICICI Bank, Axis Bank, Kotak, Bajaj Finserv, HDFC Life, Aditya Birla Capital, L&T Finance, Edelweiss',
    atsKeywords: ['financial analysis', 'client relationship', 'regulatory compliance', 'due diligence', 'underwriting', 'asset management', 'npa management'],
    weights: 'ATS structure (10%), core skills (30%), tools (15%), role alignment (25%), impact/metrics (10%), projects (10%)'
  },
  hcm: {
    name: 'Healthcare Management (HCM)',
    focus: 'pharma sales, medical devices, hospital operations, healthcare consulting, market access, regulatory affairs, clinical research',
    roles: 'Medical Representative, Product Manager, Hospital Administrator, Healthcare Consultant, Market Access Manager, Operations Manager',
    coreSkills: ['pharma domain knowledge', 'healthcare operations', 'market access', 'regulatory affairs', 'product management', 'hospital management', 'patient outcomes'],
    tools: ['excel', 'power bi', 'crm', 'sql', 'spss', 'python', 'tableau'],
    companies: 'Sun Pharma, Cipla, Dr Reddys, Abbott, Pfizer, J&J, Medtronic, Fortis, Apollo, ZS Associates, IQVIA',
    atsKeywords: ['kol management', 'therapy area', 'go-to-market', 'market development', 'formulary management', 'pvt label', 'reimbursement'],
    weights: 'ATS structure (10%), domain knowledge (30%), tools (10%), role alignment (30%), impact/metrics (10%), projects (10%)'
  },
  core: {
    name: 'General Management / Core MBA (CORE)',
    focus: 'marketing, sales, brand management, strategy, operations, supply chain, consulting, business development',
    roles: 'Management Trainee, Sales Manager, Brand Manager, Strategy Consultant, Operations Manager, Business Development Manager',
    coreSkills: ['marketing strategy', 'sales management', 'brand management', 'p&l management', 'supply chain', 'operations', 'team leadership', 'go-to-market'],
    tools: ['excel', 'power bi', 'tableau', 'crm', 'sap', 'sql', 'python'],
    companies: 'HUL, ITC, P&G, Amazon, Flipkart, BCG, Bain, McKinsey, Asian Paints, Dabur, Marico, Godrej, Nestle',
    atsKeywords: ['cross-functional', 'revenue growth', 'market share', 'stakeholder management', 'business development', 'channel strategy'],
    weights: 'ATS structure (10%), core skills (25%), tools (10%), role alignment (30%), impact/metrics (15%), projects (10%)'
  }
};

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
        error: { code: 'rate_limited', message: 'Too many resume analyses. Please try again shortly.' }
      });
    }

    if (!isAiConfigured()) {
      return sendJson(res, 503, {
        ok: false,
        error: { code: 'ai_not_configured', message: 'AI resume analysis is not available right now.' }
      });
    }

    const resumeText = normalizeResumeText(req.body?.resumeText);
    if (resumeText.length < MIN_RESUME_CHARS) {
      return sendJson(res, 400, {
        ok: false,
        error: {
          code: 'resume_text_too_short',
          message: `Resume text must contain at least ${MIN_RESUME_CHARS} characters.`
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

    const analysis = await analyzeResumeWithAI({
      resumeText,
      programme: access.programmeCode,
      targetRole:    String(req.body?.targetRole    || '').trim().slice(0, 120),
      targetCompany: String(req.body?.targetCompany || '').trim().slice(0, 120)
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
      overallScore: analysis.overallScore,
      aiPowered: true
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
      error: { code: 'resume_analysis_failed', message: 'Unable to analyze resume right now.' }
    });
  }
}

async function analyzeResumeWithAI({ resumeText, programme, targetRole, targetCompany }) {
  const ctx = PROGRAMME_CONTEXT[programme] || PROGRAMME_CONTEXT.bda;

  const roleContext = targetRole
    ? `The candidate is targeting the role: "${targetRole}".`
    : `Score against general ${ctx.name} placement roles: ${ctx.roles}.`;

  const companyContext = targetCompany
    ? `Target company: "${targetCompany}" — factor in this company's known hiring standards.`
    : `Score against typical ${ctx.name} recruiters: ${ctx.companies}.`;

  const systemInstruction = `You are a senior ATS specialist and placement consultant with 15+ years of experience evaluating Indian MBA/PGDM resumes for campus placements at top B-schools (IIMs, XLRI, NMIMS, SP Jain, GIM, etc.).

You are evaluating for: ${ctx.name}
Programme focus: ${ctx.focus}
Typical hiring companies: ${ctx.companies}
Core skills expected: ${ctx.coreSkills.join(', ')}
Key tools expected: ${ctx.tools.join(', ')}
ATS keywords that matter: ${ctx.atsKeywords.join(', ')}
Scoring weights: ${ctx.weights}

Your analysis must be:
- STRICTLY ACCURATE: read the actual resume text, do not hallucinate skills not present
- EVIDENCE-BASED: cite specific lines or sections from the resume when making observations
- CALIBRATED: 80+ means genuinely shortlist-ready at the above companies; below 50 means significant gaps
- PROGRAMME-SPECIFIC: evaluate only what matters for ${ctx.name} recruiters, not generic job market standards`;

  const prompt = `Analyze this resume for a ${ctx.name} MBA/PGDM student at an Indian B-school.
${roleContext}
${companyContext}

---RESUME---
${resumeText.slice(0, 60_000)}

Return ONLY a valid JSON object (no markdown, no code fences, no text before or after):
{
  "overallScore": <integer 0-100, weighted composite per the programme weights above>,
  "scores": {
    "ats":           <integer 0-100, ATS structure: clear sections, proper headings, no tables/columns, scannable format>,
    "skills":        <integer 0-100, core domain skills for ${ctx.name} explicitly present in the resume>,
    "tools":         <integer 0-100, technical tools/software demonstrated with evidence of use>,
    "roleAlignment": <integer 0-100, how well the candidate's experience aligns to the target role>,
    "impact":        <integer 0-100, quantified results, metrics, % improvements, revenue/cost numbers>,
    "projects":      <integer 0-100, relevance, depth, and business impact of projects and internships>
  },
  "extracted": {
    "skills": [
      "<skill explicitly found in the resume — only list if evidence exists>",
      "...up to 12 items"
    ]
  },
  "missing": {
    "prioritySkills": [
      "<important ${ctx.name} skill completely absent from the resume>",
      "...up to 8 items"
    ],
    "tools": [
      "<tool commonly expected for ${ctx.name} not evidenced in resume>",
      "...up to 6 items"
    ]
  },
  "recommendations": [
    "<specific, actionable change referencing actual resume content — not generic advice>",
    "...6 to 8 items total"
  ],
  "explanation": [
    "<one sentence explaining a key scoring decision with evidence from the resume>",
    "...3 to 5 items total"
  ]
}

Scoring anchors:
- 85-100: Strong ATS pass + likely shortlisted by top recruiters with no major changes
- 70-84: Good profile, minor gaps, competitive with targeted improvements
- 55-69: Moderate, needs deliberate skill/language upgrades to compete
- 40-54: Significant gaps in skills or impact evidence, needs major overhaul
- Below 40: Resume is unlikely to pass ATS filters for ${ctx.name} roles without fundamental restructuring
- NEVER inflate scores to be encouraging — inaccurate high scores hurt the student's placement chances`;

  const { answer } = await generateChatCompletion({
    model: 'gemini-2.5-flash',
    systemInstruction,
    prompt
  });

  const cleaned = answer.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim();
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('AI returned an unreadable response. Please try again.');

  let raw;
  try { raw = JSON.parse(jsonMatch[0]); } catch { throw new Error('AI response could not be parsed. Please try again.'); }

  const clamp = n => Math.min(100, Math.max(0, Math.round(Number(n) || 0)));
  const arr   = (v, limit) => Array.isArray(v) ? v.slice(0, limit).map(s => String(s)) : [];

  return {
    overallScore: clamp(raw.overallScore),
    scores: {
      ats:           clamp(raw.scores?.ats),
      skills:        clamp(raw.scores?.skills),
      tools:         clamp(raw.scores?.tools),
      roleAlignment: clamp(raw.scores?.roleAlignment),
      impact:        clamp(raw.scores?.impact),
      projects:      clamp(raw.scores?.projects)
    },
    extracted: {
      skills: arr(raw.extracted?.skills, 12)
    },
    missing: {
      prioritySkills: arr(raw.missing?.prioritySkills, 8),
      tools:          arr(raw.missing?.tools, 6)
    },
    recommendations: arr(raw.recommendations, 8),
    explanation:     arr(raw.explanation, 5),
    programme,
    targetRole:      targetRole || '',
    targetCompany:   targetCompany || ''
  };
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
      access: { ...access, programmeCode: access.programmeCode || fallbackProgramme }
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
