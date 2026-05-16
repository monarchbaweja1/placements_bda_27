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
  const hasRole    = Boolean(targetRole);
  const hasCompany = Boolean(targetCompany);

  // Role-first mode: when the user specifies a target role, evaluate strictly against
  // that role's requirements — never the programme's generic skill list.
  const systemInstruction = hasRole
    ? buildRoleFirstInstruction(targetRole, targetCompany, ctx)
    : buildProgrammeFirstInstruction(ctx);

  const skillsScoreDesc = hasRole
    ? `skills specifically required for "${targetRole}" explicitly present in the resume`
    : `core domain skills for ${ctx.name} explicitly present in the resume`;

  const toolsScoreDesc = hasRole
    ? `tools specifically used in "${targetRole}" demonstrated with evidence`
    : `technical tools/software demonstrated with evidence of use`;

  const missingSkillsDesc = hasRole
    ? `"<skill genuinely required for the "${targetRole}" role that is completely absent from the resume — ONLY list skills relevant to this specific role, never skills from unrelated domains>",`
    : `"<important ${ctx.name} skill completely absent from the resume>",`;

  const missingToolsDesc = hasRole
    ? `"<tool specifically used in "${targetRole}" roles not evidenced in resume>",`
    : `"<tool commonly expected for ${ctx.name} not evidenced in resume>",`;

  const roleAlignDesc = hasRole
    ? `how well the candidate's experience aligns to the "${targetRole}" role`
    : `how well the candidate's experience aligns to the target role`;

  const prompt = `Analyze this resume for a candidate${hasRole ? ` targeting the "${targetRole}" role` : ` in the ${ctx.name} programme`} at an Indian B-school.
${hasCompany ? `Target company: "${targetCompany}"` : ''}

---RESUME---
${resumeText.slice(0, 60_000)}

Return ONLY a valid JSON object (no markdown, no code fences, no text before or after):
{
  "overallScore": <integer 0-100, weighted composite>,
  "scores": {
    "ats":           <integer 0-100, ATS structure: clear sections, proper headings, no tables/columns, scannable format>,
    "skills":        <integer 0-100, ${skillsScoreDesc}>,
    "tools":         <integer 0-100, ${toolsScoreDesc}>,
    "roleAlignment": <integer 0-100, ${roleAlignDesc}>,
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
      ${missingSkillsDesc}
      "...up to 8 items"
    ],
    "tools": [
      ${missingToolsDesc}
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
- 85-100: Strong ATS pass + likely shortlisted with no major changes
- 70-84: Good profile, minor gaps, competitive with targeted improvements
- 55-69: Moderate, needs deliberate skill/language upgrades to compete
- 40-54: Significant gaps in skills or impact evidence, needs major overhaul
- Below 40: Unlikely to pass ATS filters without fundamental restructuring
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

function buildRoleFirstInstruction(targetRole, targetCompany, ctx) {
  const companyLine = targetCompany
    ? `Target company: "${targetCompany}" — factor in this company's known hiring standards for "${targetRole}" candidates.`
    : `No specific company targeted. Evaluate against typical Indian company standards for "${targetRole}" positions.`;

  return `You are a senior ATS specialist and placement consultant with 15+ years of experience evaluating Indian MBA/PGDM resumes for campus placements at top B-schools (IIMs, XLRI, NMIMS, SP Jain, GIM, etc.).

EVALUATION MODE: ROLE-SPECIFIC
You are evaluating this resume STRICTLY for the role: "${targetRole}"
${companyLine}

ABSOLUTE RULES — violating these makes the analysis useless to the student:
1. List as "missing prioritySkills" ONLY skills that are genuinely required for "${targetRole}" — nothing else.
2. Do NOT list skills from unrelated domains as missing, regardless of the student's academic programme.
3. Concrete examples of what NOT to list as missing:
   - If role is "Data Analyst" → do NOT list marketing strategy, sales management, brand management, supply chain, operations, P&L, go-to-market
   - If role is "Sales Manager" → do NOT list machine learning, SQL, Python, data visualization, statistics
   - If role is "Brand Manager" → do NOT list SQL, programming, financial modeling, data engineering
   - If role is "Software Engineer" → do NOT list marketing, brand, sales, operations
4. Missing skills must be what a recruiter hiring for "${targetRole}" at an Indian company would actually look for.
5. Score "roleAlignment" based on how closely the candidate's background matches "${targetRole}" requirements.
6. Score "skills" and "tools" only against what "${targetRole}" requires.

Your analysis must be:
- STRICTLY ACCURATE: read the actual resume text, do not hallucinate skills not present
- EVIDENCE-BASED: cite specific lines or sections from the resume when making observations
- CALIBRATED: 80+ means genuinely shortlist-ready for "${targetRole}"; below 50 means significant gaps`;
}

function buildProgrammeFirstInstruction(ctx) {
  return `You are a senior ATS specialist and placement consultant with 15+ years of experience evaluating Indian MBA/PGDM resumes for campus placements at top B-schools (IIMs, XLRI, NMIMS, SP Jain, GIM, etc.).

EVALUATION MODE: PROGRAMME-GENERAL
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
