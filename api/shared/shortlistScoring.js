import { normalizeProgrammeCode } from './programmeGuard.js';

// ── Company profiles per programme ─────────────────────────────────────────
// minCgpa: bare minimum to be considered
// strongCgpa: CGPA at which max CGPA score is awarded
// requiredSkills: must appear in resume/skill text for high score
// preferredSkills: nice-to-have; partial credit
// roleKeywords: words in target role or project descriptions that signal fit
// weights: how much each dimension contributes (must sum to 1)

const COMPANY_PROFILES = {
  bda: [
    {
      name: 'Deloitte',
      sector: 'Consulting / Analytics',
      minCgpa: 6.5, strongCgpa: 7.5,
      requiredSkills: ['sql', 'python', 'analytics', 'data visualization', 'excel'],
      preferredSkills: ['power bi', 'tableau', 'machine learning', 'statistics', 'r'],
      roleKeywords: ['analyst', 'consultant', 'data', 'business analyst', 'insights'],
      weights: { cgpa: 0.25, skills: 0.40, role: 0.20, projects: 0.15 },
      note: 'Values structured thinking, SQL/Python proficiency, and case-study readiness.'
    },
    {
      name: 'KPMG',
      sector: 'Advisory / Analytics',
      minCgpa: 6.5, strongCgpa: 7.5,
      requiredSkills: ['sql', 'excel', 'analytics', 'data visualization'],
      preferredSkills: ['power bi', 'tableau', 'python', 'risk analytics'],
      roleKeywords: ['analyst', 'advisory', 'consultant', 'data', 'audit'],
      weights: { cgpa: 0.26, skills: 0.38, role: 0.20, projects: 0.16 },
      note: 'Strong emphasis on Excel and data storytelling. CGPA threshold is enforced.'
    },
    {
      name: 'EY',
      sector: 'Advisory / Technology',
      minCgpa: 6.5, strongCgpa: 7.5,
      requiredSkills: ['sql', 'python', 'analytics', 'excel'],
      preferredSkills: ['power bi', 'machine learning', 'tableau', 'statistics'],
      roleKeywords: ['analyst', 'consultant', 'data', 'technology', 'advisory'],
      weights: { cgpa: 0.24, skills: 0.40, role: 0.20, projects: 0.16 },
      note: 'Technology-heavy advisory roles. Python and SQL are strongly weighted.'
    },
    {
      name: 'PwC',
      sector: 'Advisory / Consulting',
      minCgpa: 6.5, strongCgpa: 7.5,
      requiredSkills: ['excel', 'sql', 'analytics', 'data visualization'],
      preferredSkills: ['python', 'power bi', 'tableau', 'statistics'],
      roleKeywords: ['analyst', 'consultant', 'advisory', 'data', 'business'],
      weights: { cgpa: 0.26, skills: 0.38, role: 0.20, projects: 0.16 },
      note: 'Values business storytelling and structured analysis alongside technical skills.'
    },
    {
      name: 'Accenture',
      sector: 'Technology / Analytics',
      minCgpa: 6.0, strongCgpa: 7.2,
      requiredSkills: ['sql', 'python', 'analytics'],
      preferredSkills: ['machine learning', 'power bi', 'tableau', 'cloud', 'spark'],
      roleKeywords: ['analyst', 'data', 'technology', 'solutions', 'digital'],
      weights: { cgpa: 0.20, skills: 0.42, role: 0.22, projects: 0.16 },
      note: 'Large intake. Technical skills and project portfolio matter more than CGPA here.'
    },
    {
      name: 'Mu Sigma',
      sector: 'Analytics / Decision Science',
      minCgpa: 6.0, strongCgpa: 7.0,
      requiredSkills: ['sql', 'python', 'statistics', 'analytics'],
      preferredSkills: ['r', 'machine learning', 'predictive modeling', 'excel', 'a/b testing'],
      roleKeywords: ['analyst', 'decision scientist', 'data', 'insights', 'business'],
      weights: { cgpa: 0.18, skills: 0.45, role: 0.20, projects: 0.17 },
      note: 'Skews heavily toward technical analytics. Quantitative projects with measurable results stand out.'
    },
    {
      name: 'Fractal Analytics',
      sector: 'AI / Analytics',
      minCgpa: 6.5, strongCgpa: 7.5,
      requiredSkills: ['python', 'machine learning', 'statistics', 'sql'],
      preferredSkills: ['deep learning', 'scikit-learn', 'tensorflow', 'r', 'segmentation'],
      roleKeywords: ['data scientist', 'analyst', 'ai', 'ml', 'predictive', 'modeling'],
      weights: { cgpa: 0.22, skills: 0.46, role: 0.18, projects: 0.14 },
      note: 'Strong ML/AI focus. Practical projects with business impact are given significant weight.'
    },
    {
      name: 'Kantar',
      sector: 'Market Research / Analytics',
      minCgpa: 6.0, strongCgpa: 7.0,
      requiredSkills: ['analytics', 'excel', 'statistics', 'data visualization'],
      preferredSkills: ['sql', 'python', 'tableau', 'power bi', 'spss', 'r'],
      roleKeywords: ['research', 'analyst', 'insights', 'market', 'consumer'],
      weights: { cgpa: 0.22, skills: 0.38, role: 0.24, projects: 0.16 },
      note: 'Market research background and consumer insights framing add significant value.'
    },
    {
      name: 'Nielsen',
      sector: 'Market Research / Data',
      minCgpa: 6.0, strongCgpa: 7.0,
      requiredSkills: ['analytics', 'excel', 'statistics'],
      preferredSkills: ['sql', 'python', 'tableau', 'power bi', 'spss'],
      roleKeywords: ['research', 'analyst', 'insights', 'data', 'retail'],
      weights: { cgpa: 0.22, skills: 0.38, role: 0.24, projects: 0.16 },
      note: 'Similar to Kantar. Consumer and retail analytics experience is advantageous.'
    },
    {
      name: 'JP Morgan',
      sector: 'BFSI / Analytics',
      minCgpa: 7.0, strongCgpa: 8.0,
      requiredSkills: ['sql', 'python', 'statistics', 'excel', 'data analysis'],
      preferredSkills: ['machine learning', 'financial analytics', 'risk', 'r', 'quantitative'],
      roleKeywords: ['analyst', 'data', 'technology', 'quantitative', 'finance', 'risk'],
      weights: { cgpa: 0.35, skills: 0.36, role: 0.16, projects: 0.13 },
      note: 'CGPA is heavily weighted. 7+ is typically a hard filter. Strong SQL and quantitative background expected.'
    },
    {
      name: 'HDFC Bank',
      sector: 'BFSI / Analytics',
      minCgpa: 6.5, strongCgpa: 7.5,
      requiredSkills: ['sql', 'excel', 'analytics', 'data visualization'],
      preferredSkills: ['python', 'power bi', 'tableau', 'banking', 'risk'],
      roleKeywords: ['analyst', 'data', 'banking', 'credit', 'risk', 'operations'],
      weights: { cgpa: 0.28, skills: 0.38, role: 0.18, projects: 0.16 },
      note: 'Banking/finance domain knowledge is a strong positive signal for BDA profiles.'
    },
    {
      name: 'Amazon',
      sector: 'E-commerce / Tech Analytics',
      minCgpa: 7.0, strongCgpa: 8.0,
      requiredSkills: ['sql', 'python', 'analytics', 'data visualization', 'excel'],
      preferredSkills: ['machine learning', 'statistics', 'tableau', 'spark', 'aws'],
      roleKeywords: ['analyst', 'data scientist', 'business analyst', 'supply chain', 'product'],
      weights: { cgpa: 0.28, skills: 0.42, role: 0.18, projects: 0.12 },
      note: 'High bar for quantitative skills. Supply chain / product analytics experience valued.'
    },
    {
      name: 'Capgemini',
      sector: 'IT / Analytics Consulting',
      minCgpa: 5.5, strongCgpa: 6.8,
      requiredSkills: ['sql', 'analytics', 'excel'],
      preferredSkills: ['python', 'power bi', 'tableau', 'machine learning'],
      roleKeywords: ['analyst', 'consultant', 'data', 'technology'],
      weights: { cgpa: 0.18, skills: 0.42, role: 0.24, projects: 0.16 },
      note: 'Lower CGPA threshold. Portfolio of projects and communication skills drive outcomes.'
    }
  ],

  bifs: [
    {
      name: 'HDFC Bank',
      sector: 'Banking',
      minCgpa: 6.5, strongCgpa: 7.5,
      requiredSkills: ['financial analysis', 'credit risk', 'excel', 'banking'],
      preferredSkills: ['sql', 'power bi', 'valuation', 'portfolio', 'risk management'],
      roleKeywords: ['credit analyst', 'relationship manager', 'banking', 'risk'],
      weights: { cgpa: 0.30, skills: 0.40, role: 0.18, projects: 0.12 },
      note: 'Credit risk and banking domain knowledge strongly preferred.'
    },
    {
      name: 'ICICI Bank',
      sector: 'Banking',
      minCgpa: 6.5, strongCgpa: 7.5,
      requiredSkills: ['financial analysis', 'excel', 'banking', 'credit'],
      preferredSkills: ['sql', 'risk management', 'portfolio', 'valuation'],
      roleKeywords: ['analyst', 'banking', 'credit', 'relationship', 'risk'],
      weights: { cgpa: 0.30, skills: 0.40, role: 0.18, projects: 0.12 },
      note: 'Similar profile to HDFC Bank. Strong CGPA filter.'
    },
    {
      name: 'Axis Bank',
      sector: 'Banking',
      minCgpa: 6.0, strongCgpa: 7.2,
      requiredSkills: ['financial analysis', 'excel', 'banking'],
      preferredSkills: ['sql', 'credit risk', 'portfolio', 'power bi'],
      roleKeywords: ['analyst', 'banking', 'credit', 'risk', 'relationship'],
      weights: { cgpa: 0.28, skills: 0.40, role: 0.18, projects: 0.14 },
      note: 'Slightly lower CGPA threshold than HDFC/ICICI.'
    },
    {
      name: 'Deloitte',
      sector: 'Advisory / BFSI',
      minCgpa: 6.5, strongCgpa: 7.5,
      requiredSkills: ['financial analysis', 'excel', 'analytics', 'risk'],
      preferredSkills: ['sql', 'power bi', 'valuation', 'audit'],
      roleKeywords: ['analyst', 'advisory', 'risk', 'audit', 'financial'],
      weights: { cgpa: 0.26, skills: 0.38, role: 0.20, projects: 0.16 },
      note: 'BFSI advisory exposure and CFA/FRM certifications are differentiators.'
    }
  ],

  hcm: [
    {
      name: 'Abbott',
      sector: 'Medical Devices / Pharma',
      minCgpa: 6.0, strongCgpa: 7.2,
      requiredSkills: ['healthcare', 'sales', 'market access', 'analytics'],
      preferredSkills: ['excel', 'crm', 'medical devices', 'pharma', 'clinical'],
      roleKeywords: ['sales', 'marketing', 'territory', 'medical', 'healthcare'],
      weights: { cgpa: 0.22, skills: 0.38, role: 0.26, projects: 0.14 },
      note: 'Healthcare domain knowledge and sales aptitude are paramount.'
    },
    {
      name: 'Cipla',
      sector: 'Pharma',
      minCgpa: 6.0, strongCgpa: 7.2,
      requiredSkills: ['pharma', 'sales', 'healthcare', 'analytics'],
      preferredSkills: ['excel', 'market access', 'crm', 'kol'],
      roleKeywords: ['sales', 'marketing', 'pharma', 'territory', 'healthcare'],
      weights: { cgpa: 0.22, skills: 0.38, role: 0.26, projects: 0.14 },
      note: 'Pharma sales background and healthcare domain exposure are key.'
    },
    {
      name: 'Apollo Hospitals',
      sector: 'Hospital Operations',
      minCgpa: 6.0, strongCgpa: 7.0,
      requiredSkills: ['healthcare', 'hospital operations', 'analytics'],
      preferredSkills: ['excel', 'power bi', 'patient experience', 'quality'],
      roleKeywords: ['operations', 'healthcare', 'hospital', 'analytics', 'management'],
      weights: { cgpa: 0.22, skills: 0.38, role: 0.26, projects: 0.14 },
      note: 'Hospital operations and healthcare analytics experience is highly valued.'
    }
  ],

  core: [
    {
      name: 'Hindustan Unilever',
      sector: 'FMCG',
      minCgpa: 6.5, strongCgpa: 7.5,
      requiredSkills: ['marketing', 'sales', 'analytics', 'excel'],
      preferredSkills: ['brand management', 'consumer insights', 'supply chain', 'gtm'],
      roleKeywords: ['sales', 'marketing', 'management trainee', 'brand', 'fmcg'],
      weights: { cgpa: 0.28, skills: 0.36, role: 0.22, projects: 0.14 },
      note: 'FMCG internship and sales/marketing projects strongly differentiate candidates.'
    },
    {
      name: 'Asian Paints',
      sector: 'Manufacturing / FMCG',
      minCgpa: 6.5, strongCgpa: 7.5,
      requiredSkills: ['sales', 'marketing', 'analytics', 'excel'],
      preferredSkills: ['supply chain', 'distribution', 'brand', 'consumer'],
      roleKeywords: ['sales', 'marketing', 'management trainee', 'operations'],
      weights: { cgpa: 0.28, skills: 0.36, role: 0.22, projects: 0.14 },
      note: 'Strong bias toward structured sales experience and quantified outcomes.'
    },
    {
      name: 'Deloitte',
      sector: 'Management Consulting',
      minCgpa: 6.5, strongCgpa: 7.5,
      requiredSkills: ['strategy', 'analytics', 'excel', 'consulting'],
      preferredSkills: ['sql', 'power bi', 'operations', 'finance'],
      roleKeywords: ['consultant', 'analyst', 'strategy', 'operations', 'management'],
      weights: { cgpa: 0.26, skills: 0.38, role: 0.20, projects: 0.16 },
      note: 'Case study readiness and structured thinking are essential.'
    }
  ]
};

// ── Scoring functions ──────────────────────────────────────────────────────
function scoreCgpa(cgpa, minCgpa, strongCgpa) {
  if (cgpa < minCgpa) return Math.max(10, 30 - (minCgpa - cgpa) * 20);
  if (cgpa >= strongCgpa) return 100;
  return Math.round(30 + ((cgpa - minCgpa) / (strongCgpa - minCgpa)) * 70);
}

function scoreSkillCoverage(tokens, required, preferred) {
  const reqHit = required.filter(s => tokens.some(t => t.includes(s) || s.includes(t)));
  const prefHit = preferred.filter(s => tokens.some(t => t.includes(s) || s.includes(t)));
  const reqScore  = required.length  ? (reqHit.length  / required.length)  * 100 : 100;
  const prefScore = preferred.length ? (prefHit.length / preferred.length) * 100 : 100;
  return Math.round(reqScore * 0.72 + prefScore * 0.28);
}

function scoreRoleAlignment(tokens, roleKeywords) {
  if (!roleKeywords.length) return 60;
  const hits = roleKeywords.filter(k => tokens.some(t => t.includes(k) || k.includes(t)));
  return Math.round(Math.min(100, (hits.length / roleKeywords.length) * 100 + 15));
}

function scoreProjects(tokens, required) {
  if (!required.length) return 60;
  const hits = required.filter(s => tokens.some(t => t.includes(s) || s.includes(t)));
  return Math.round(Math.min(100, (hits.length / required.length) * 100));
}

function tokenize(text) {
  return String(text || '').toLowerCase()
    .split(/[\s,;\/\-\|&]+/)
    .filter(t => t.length >= 2);
}

function buildReasons({ profile, cgpa, cgpaScore, skillScore, roleScore, projectScore, tokens }) {
  const reasons = [];

  if (cgpaScore >= 85) reasons.push(`CGPA of ${cgpa} is above the strong threshold (${profile.strongCgpa}+), boosting your score.`);
  else if (cgpaScore >= 50) reasons.push(`CGPA of ${cgpa} meets the minimum requirement (${profile.minCgpa}+) but is below the strong threshold (${profile.strongCgpa}+).`);
  else reasons.push(`CGPA of ${cgpa} is below ${profile.name}'s minimum threshold (${profile.minCgpa}+), which significantly reduces probability.`);

  const missingRequired = profile.requiredSkills.filter(s => !tokens.some(t => t.includes(s) || s.includes(t)));
  if (missingRequired.length === 0) reasons.push(`All required skills detected: ${profile.requiredSkills.join(', ')}.`);
  else reasons.push(`Missing required skills: ${missingRequired.slice(0, 4).join(', ')}.`);

  if (roleScore >= 75) reasons.push(`Strong role alignment detected in skills / project descriptions.`);
  else reasons.push(`Limited role-specific keywords found — add more ${profile.sector}-relevant project context.`);

  if (profile.note) reasons.push(profile.note);

  return reasons;
}

// ── Public API ─────────────────────────────────────────────────────────────
export function estimateShortlistProbabilities({ programme, cgpa, skills, projects, targetCompanies }) {
  const code    = normalizeProgrammeCode(programme) || 'bda';
  const profiles = COMPANY_PROFILES[code] || COMPANY_PROFILES.bda;
  const tokens  = tokenize(skills + ' ' + projects);
  const cgpaNum = parseFloat(cgpa) || 0;

  return targetCompanies.map(companyName => {
    const profile = profiles.find(p =>
      p.name.toLowerCase() === companyName.toLowerCase() ||
      p.name.toLowerCase().includes(companyName.toLowerCase()) ||
      companyName.toLowerCase().includes(p.name.toLowerCase())
    );

    if (!profile) {
      return {
        company: companyName,
        probability: null,
        known: false,
        caveat: 'No historical pattern data for this company in the current programme. Add interview experiences and shortlist data via the admin panel to improve coverage.',
        reasons: [],
        breakdown: null
      };
    }

    const cgpaScore    = scoreCgpa(cgpaNum, profile.minCgpa, profile.strongCgpa);
    const skillScore   = scoreSkillCoverage(tokens, profile.requiredSkills, profile.preferredSkills);
    const roleScore    = scoreRoleAlignment(tokens, profile.roleKeywords);
    const projectScore = scoreProjects(tokens, profile.requiredSkills);

    const weighted = Math.round(
      cgpaScore    * profile.weights.cgpa    +
      skillScore   * profile.weights.skills  +
      roleScore    * profile.weights.role    +
      projectScore * profile.weights.projects
    );

    const probability = Math.max(5, Math.min(92, weighted));
    const reasons = buildReasons({ profile, cgpa: cgpaNum, cgpaScore, skillScore, roleScore, projectScore, tokens });

    return {
      company: profile.name,
      sector: profile.sector,
      probability,
      known: true,
      breakdown: {
        cgpa: cgpaScore,
        skills: skillScore,
        roleAlignment: roleScore,
        projects: projectScore
      },
      reasons,
      caveat: 'AI-based shortlist probability estimate only, not a guarantee. Based on programme-specific historical patterns.'
    };
  });
}
