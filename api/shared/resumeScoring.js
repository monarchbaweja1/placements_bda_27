import { normalizeProgrammeCode } from './programmeGuard.js';

const PROGRAMME_TAXONOMY = {
  bda: {
    coreSkills: ['sql', 'python', 'machine learning', 'statistics', 'excel', 'power bi', 'tableau', 'data visualization', 'predictive modeling', 'analytics'],
    tools: ['pandas', 'numpy', 'scikit-learn', 'tensorflow', 'pytorch', 'r', 'sas', 'spark', 'mysql', 'postgresql', 'bigquery'],
    roleKeywords: ['data analyst', 'business analyst', 'data scientist', 'analytics consultant', 'risk analyst', 'product analyst'],
    projectSignals: ['dashboard', 'model', 'forecast', 'classification', 'regression', 'segmentation', 'churn', 'recommendation', 'a/b test', 'etl']
  },
  bifs: {
    coreSkills: ['financial analysis', 'credit risk', 'valuation', 'banking', 'insurance', 'risk management', 'excel', 'sql', 'capital markets', 'portfolio'],
    tools: ['excel', 'power bi', 'tableau', 'python', 'sql', 'bloomberg', 'cfa', 'frm'],
    roleKeywords: ['credit analyst', 'risk analyst', 'financial analyst', 'relationship manager', 'investment banking', 'treasury'],
    projectSignals: ['valuation', 'credit score', 'portfolio', 'npa', 'underwriting', 'financial model', 'ratio analysis', 'risk model']
  },
  hcm: {
    coreSkills: ['healthcare', 'pharma', 'hospital operations', 'market access', 'medical devices', 'health insurance', 'sales', 'strategy', 'analytics'],
    tools: ['excel', 'power bi', 'tableau', 'sql', 'crm', 'spss', 'python'],
    roleKeywords: ['healthcare consultant', 'pharma marketing', 'hospital operations', 'territory manager', 'medical device sales'],
    projectSignals: ['patient', 'hospital', 'doctor', 'kol', 'therapy', 'claims', 'clinical', 'market access', 'go-to-market']
  },
  core: {
    coreSkills: ['marketing', 'sales', 'operations', 'strategy', 'finance', 'consulting', 'excel', 'business development', 'supply chain'],
    tools: ['excel', 'power bi', 'tableau', 'crm', 'sap', 'sql', 'python'],
    roleKeywords: ['management trainee', 'consultant', 'brand manager', 'sales manager', 'operations manager', 'product manager'],
    projectSignals: ['market research', 'gtm', 'supply chain', 'pricing', 'distribution', 'campaign', 'sales funnel', 'customer']
  }
};

// Role clusters: each entry has trigger keywords and the relevant skill set for that role family.
// Keywords are matched against the user's target role string (case-insensitive, partial match).
const ROLE_CLUSTERS = {
  bda: [
    {
      triggers: ['data scientist', 'ml engineer', 'machine learning', 'ai engineer', 'deep learning', 'nlp engineer', 'computer vision', 'research scientist', 'applied scientist', 'modeling'],
      skills: ['python', 'machine learning', 'statistics', 'sql', 'predictive modeling', 'analytics', 'data visualization']
    },
    {
      triggers: ['data analyst', 'analytics analyst', 'bi analyst', 'business intelligence', 'reporting analyst', 'insights analyst', 'bi developer', 'tableau developer', 'power bi'],
      skills: ['sql', 'excel', 'analytics', 'power bi', 'tableau', 'data visualization', 'statistics', 'python']
    },
    {
      triggers: ['business analyst', 'product analyst', 'product manager', 'systems analyst', 'requirements analyst'],
      skills: ['sql', 'excel', 'analytics', 'power bi', 'statistics', 'data visualization', 'python']
    },
    {
      triggers: ['risk analyst', 'credit analyst', 'fraud analyst', 'risk modeling', 'quantitative analyst', 'quant', 'risk modeler'],
      skills: ['sql', 'python', 'statistics', 'analytics', 'excel', 'predictive modeling', 'machine learning']
    },
    {
      triggers: ['data engineer', 'etl', 'pipeline', 'spark engineer', 'cloud data', 'bigquery', 'warehouse'],
      skills: ['sql', 'python', 'analytics', 'statistics', 'excel', 'data visualization']
    }
  ],

  bifs: [
    {
      triggers: ['credit analyst', 'credit officer', 'loan analyst', 'underwriting', 'underwriter', 'lending', 'credit risk', 'credit manager', 'credit appraisal', 'npa', 'delinquency'],
      skills: ['credit risk', 'financial analysis', 'excel', 'banking', 'risk management', 'valuation', 'sql']
    },
    {
      triggers: ['investment banking', 'ib analyst', 'mergers', 'acquisitions', 'ma', 'm&a', 'equity research', 'research analyst', 'valuation analyst', 'deal', 'transaction'],
      skills: ['valuation', 'financial analysis', 'capital markets', 'excel', 'bloomberg', 'portfolio', 'risk management']
    },
    {
      triggers: ['wealth', 'portfolio manager', 'asset management', 'fund manager', 'mutual fund', 'pms', 'investment advisor', 'private banking', 'hni'],
      skills: ['portfolio', 'capital markets', 'financial analysis', 'excel', 'valuation', 'risk management', 'bloomberg']
    },
    {
      triggers: ['risk manager', 'risk analyst', 'market risk', 'operational risk', 'compliance', 'regulatory', 'enterprise risk', 'model risk', 'stress testing'],
      skills: ['risk management', 'credit risk', 'financial analysis', 'excel', 'sql', 'capital markets']
    },
    {
      triggers: ['relationship manager', 'rm', 'retail banking', 'branch manager', 'sme banking', 'corporate banking', 'client relationship', 'key account'],
      skills: ['banking', 'financial analysis', 'excel', 'portfolio', 'capital markets', 'credit risk', 'risk management']
    },
    {
      triggers: ['treasury', 'forex', 'fx trader', 'derivatives', 'fixed income', 'dealing', 'money market', 'liquidity'],
      skills: ['capital markets', 'financial analysis', 'excel', 'bloomberg', 'banking', 'portfolio', 'risk management']
    },
    {
      triggers: ['insurance', 'actuary', 'actuarial', 'claims', 'underwriting (insurance)', 'reinsurance', 'health insurance'],
      skills: ['insurance', 'financial analysis', 'excel', 'risk management', 'statistics', 'banking']
    }
  ],

  hcm: [
    {
      triggers: ['medical representative', 'mr', 'territory manager', 'territory sales', 'field sales', 'key account manager', 'area sales', 'area manager', 'zonal manager', 'regional manager', 'detailing'],
      skills: ['sales', 'healthcare', 'pharma', 'medical devices', 'crm', 'strategy', 'analytics']
    },
    {
      triggers: ['hospital operations', 'hospital administrator', 'hospital management', 'healthcare operations', 'clinic operations', 'facility manager', 'quality', 'patient experience', 'ops'],
      skills: ['hospital operations', 'healthcare', 'analytics', 'strategy', 'excel', 'health insurance']
    },
    {
      triggers: ['pharma marketing', 'brand manager (pharma)', 'medical affairs', 'market access', 'regulatory affairs', 'product manager (pharma)', 'kol', 'launch'],
      skills: ['pharma', 'market access', 'healthcare', 'sales', 'analytics', 'strategy', 'excel']
    },
    {
      triggers: ['healthcare consultant', 'health consultant', 'hospital consultant', 'healthcare strategy', 'health tech', 'digital health', 'health analytics', 'policy'],
      skills: ['healthcare', 'strategy', 'analytics', 'hospital operations', 'excel', 'health insurance']
    },
    {
      triggers: ['medical device', 'device sales', 'surgical sales', 'diagnostic sales', 'capital equipment'],
      skills: ['medical devices', 'sales', 'healthcare', 'crm', 'strategy', 'analytics', 'excel']
    },
    {
      triggers: ['insurance (health)', 'tpa', 'claims management', 'third party administrator'],
      skills: ['health insurance', 'healthcare', 'analytics', 'excel', 'strategy']
    }
  ],

  core: [
    {
      triggers: ['supply chain', 'scm', 'logistics', 'procurement', 'sourcing', 'inventory', 'warehouse', 'distribution', 'demand planning', 'purchase', 'vendor', 'fleet', 'last mile', 'fulfillment'],
      skills: ['supply chain', 'operations', 'excel', 'analytics', 'strategy', 'sap']
    },
    {
      triggers: ['operations', 'ops manager', 'plant manager', 'process improvement', 'lean', 'six sigma', 'manufacturing', 'quality assurance', 'production', 'project manager'],
      skills: ['operations', 'supply chain', 'excel', 'analytics', 'strategy', 'finance']
    },
    {
      triggers: ['marketing', 'digital marketing', 'content marketing', 'growth', 'performance marketing', 'seo', 'sem', 'social media', 'brand', 'campaign', 'gtm', 'product marketing', 'advertising'],
      skills: ['marketing', 'analytics', 'excel', 'strategy', 'business development', 'sales']
    },
    {
      triggers: ['brand manager', 'brand', 'brand marketing', 'brand strategy', 'consumer', 'fmcg brand'],
      skills: ['marketing', 'analytics', 'excel', 'strategy', 'sales', 'business development']
    },
    {
      triggers: ['sales', 'business development', 'bd', 'account manager', 'account executive', 'revenue', 'client', 'customer success', 'inside sales', 'field sales', 'b2b sales', 'b2c sales', 'zonal sales'],
      skills: ['sales', 'business development', 'excel', 'analytics', 'strategy', 'crm']
    },
    {
      triggers: ['management consultant', 'consultant', 'strategy consultant', 'advisory', 'transformation', 'corporate strategy', 'business strategy', 'strategy analyst'],
      skills: ['strategy', 'analytics', 'excel', 'consulting', 'operations', 'finance']
    },
    {
      triggers: ['finance manager', 'financial analyst', 'fp&a', 'financial planning', 'treasury', 'accounts', 'cfo', 'finance business partner', 'controllership', 'budgeting'],
      skills: ['finance', 'excel', 'analytics', 'strategy', 'consulting', 'operations']
    },
    {
      triggers: ['product manager', 'product management', 'pm', 'product owner', 'product strategy'],
      skills: ['strategy', 'analytics', 'excel', 'marketing', 'operations', 'finance']
    },
    {
      triggers: ['management trainee', 'mt', 'general management', 'leadership program', 'pgp', 'graduate trainee', 'business management'],
      skills: ['marketing', 'sales', 'operations', 'strategy', 'finance', 'analytics', 'excel']
    },
    {
      triggers: ['human resources', 'hr', 'talent acquisition', 'talent management', 'learning development', 'hrbp'],
      skills: ['strategy', 'analytics', 'excel', 'consulting', 'operations', 'business development']
    }
  ]
};

// Universal domain-keyword inference — handles future/novel role titles.
// Maps stable role archetypes (analyst, engineer, manager…) to programme-specific skills.
// These archetypes are stable even when specific role names are new.
const UNIVERSAL_DOMAIN_SIGNALS = {
  bda: [
    { words: ['scientist', 'machine', 'learning', 'deep', 'neural', 'nlp', 'computer', 'vision', 'genai', 'llm', 'diffusion', 'generative'],
      skills: ['python', 'machine learning', 'statistics', 'sql', 'predictive modeling', 'analytics'] },
    { words: ['analyst', 'analytics', 'analysis', 'intelligence', 'reporting', 'insights', 'visualiz', 'dashboard', 'bi'],
      skills: ['sql', 'excel', 'analytics', 'power bi', 'tableau', 'data visualization', 'statistics'] },
    { words: ['engineer', 'developer', 'architect', 'pipeline', 'infra', 'platform', 'etl', 'warehouse'],
      skills: ['sql', 'python', 'analytics', 'statistics', 'excel', 'data visualization'] },
    { words: ['risk', 'fraud', 'compliance', 'audit', 'governance', 'credit', 'quant'],
      skills: ['sql', 'python', 'statistics', 'analytics', 'excel', 'predictive modeling'] },
    { words: ['product', 'growth', 'strategy', 'business', 'market', 'consumer'],
      skills: ['sql', 'excel', 'analytics', 'power bi', 'statistics', 'data visualization'] },
  ],
  bifs: [
    { words: ['credit', 'loan', 'lending', 'underwriting', 'npa', 'delinquency', 'collection'],
      skills: ['credit risk', 'financial analysis', 'excel', 'banking', 'risk management', 'valuation'] },
    { words: ['investment', 'equity', 'fund', 'portfolio', 'asset', 'wealth', 'hni', 'pms', 'amc'],
      skills: ['valuation', 'financial analysis', 'capital markets', 'excel', 'bloomberg', 'portfolio'] },
    { words: ['risk', 'compliance', 'regulatory', 'governance', 'audit', 'stress', 'model'],
      skills: ['risk management', 'credit risk', 'financial analysis', 'excel', 'sql', 'capital markets'] },
    { words: ['treasury', 'forex', 'derivatives', 'fixed', 'bond', 'dealing', 'market', 'liquidity', 'alm'],
      skills: ['capital markets', 'financial analysis', 'excel', 'bloomberg', 'banking', 'portfolio'] },
    { words: ['banker', 'banking', 'branch', 'relationship', 'retail', 'corporate', 'sme', 'msme', 'trade'],
      skills: ['banking', 'financial analysis', 'excel', 'portfolio', 'capital markets', 'credit risk'] },
    { words: ['insurance', 'actuar', 'claim', 'reinsur', 'underwriting'],
      skills: ['insurance', 'financial analysis', 'excel', 'risk management', 'capital markets'] },
    { words: ['analyst', 'research', 'financial', 'finance', 'valuation', 'advisor'],
      skills: ['financial analysis', 'excel', 'valuation', 'capital markets', 'sql', 'risk management'] },
  ],
  hcm: [
    { words: ['sales', 'territory', 'field', 'representative', 'detailing', 'zonal', 'regional', 'kam', 'key account'],
      skills: ['sales', 'healthcare', 'pharma', 'medical devices', 'crm', 'strategy'] },
    { words: ['hospital', 'operations', 'administrator', 'facility', 'quality', 'patient', 'clinic', 'diagnostic'],
      skills: ['hospital operations', 'healthcare', 'analytics', 'strategy', 'excel', 'health insurance'] },
    { words: ['pharma', 'drug', 'clinical', 'regulatory', 'medical', 'device', 'therapy', 'kol', 'launch', 'market access'],
      skills: ['pharma', 'market access', 'healthcare', 'sales', 'analytics', 'strategy'] },
    { words: ['consultant', 'consulting', 'strategy', 'advisory', 'policy', 'health', 'digital health', 'healthtech'],
      skills: ['healthcare', 'strategy', 'analytics', 'hospital operations', 'excel', 'health insurance'] },
    { words: ['insurance', 'tpa', 'claims', 'actuar'],
      skills: ['health insurance', 'healthcare', 'analytics', 'excel', 'strategy', 'hospital operations'] },
  ],
  core: [
    { words: ['supply', 'logistics', 'procurement', 'sourcing', 'inventory', 'warehouse', 'fleet', 'fulfillment', 'scm', 'demand'],
      skills: ['supply chain', 'operations', 'excel', 'analytics', 'strategy', 'sap'] },
    { words: ['operations', 'ops', 'lean', 'six sigma', 'manufacturing', 'quality', 'process', 'production', 'plant'],
      skills: ['operations', 'supply chain', 'excel', 'analytics', 'strategy', 'finance'] },
    { words: ['marketing', 'brand', 'content', 'digital', 'campaign', 'growth', 'seo', 'media', 'advertising', 'gtm', 'consumer', 'pr'],
      skills: ['marketing', 'analytics', 'excel', 'strategy', 'business development', 'sales'] },
    { words: ['sales', 'revenue', 'account', 'business development', 'client', 'customer', 'success', 'bd', 'inside', 'zonal', 'b2b', 'b2c'],
      skills: ['sales', 'business development', 'excel', 'analytics', 'strategy', 'crm'] },
    { words: ['consultant', 'consulting', 'strategy', 'advisory', 'transformation', 'corporate', 'management consultant'],
      skills: ['strategy', 'analytics', 'excel', 'consulting', 'operations', 'finance'] },
    { words: ['finance', 'financial', 'treasury', 'accounting', 'accounts', 'budget', 'controlling', 'fp&a', 'cfo', 'audit'],
      skills: ['finance', 'excel', 'analytics', 'strategy', 'consulting', 'operations'] },
    { words: ['product', 'product manager', 'pm', 'product owner', 'product strategy'],
      skills: ['strategy', 'analytics', 'excel', 'marketing', 'operations', 'finance'] },
    { words: ['hr', 'human', 'talent', 'recruitment', 'learning', 'hrbp', 'people'],
      skills: ['strategy', 'analytics', 'excel', 'consulting', 'operations', 'business development'] },
    // Generic managerial/leadership archetypes — final safety net for CORE
    { words: ['manager', 'director', 'head', 'lead', 'chief', 'president', 'officer', 'trainee', 'associate', 'executive'],
      skills: ['strategy', 'analytics', 'excel', 'operations', 'finance', 'marketing'] },
  ]
};

const STOP_WORDS = new Set(['and', 'the', 'for', 'with', 'that', 'this', 'from', 'are', 'was', 'has', 'have', 'will', 'can', 'its', 'senior', 'junior', 'lead', 'associate', 'deputy', 'vice', 'assistant']);

export function getRoleSpecificSkills(programmeCode, targetRole, taxonomy) {
  if (!targetRole) return taxonomy.coreSkills;

  const roleLower = String(targetRole).toLowerCase().trim();
  const clusters  = ROLE_CLUSTERS[programmeCode] || [];

  // Pass 1 — phrase match against known cluster triggers
  for (const cluster of clusters) {
    if (cluster.triggers.some(t => roleLower.includes(t) || t.includes(roleLower))) {
      return cluster.skills;
    }
  }

  // Pass 2 — word-level match against cluster trigger words
  const roleWords = roleLower.split(/[\s\-\/,]+/).filter(w => w.length >= 3 && !STOP_WORDS.has(w));
  for (const cluster of clusters) {
    const triggerWords = cluster.triggers.join(' ').split(/[\s\-\/,]+/).filter(w => w.length >= 3);
    if (roleWords.some(rw => triggerWords.some(tw => tw.includes(rw) || rw.includes(tw)))) {
      return cluster.skills;
    }
  }

  // Pass 3 — universal domain inference for novel/future roles
  // Scores each domain by how many of its signal words appear in the role title,
  // then returns the skills for the highest-scoring domain.
  const domains = UNIVERSAL_DOMAIN_SIGNALS[programmeCode] || [];
  let bestSkills = null;
  let bestScore  = 0;
  for (const domain of domains) {
    const score = domain.words.reduce((n, w) => n + (roleLower.includes(w) ? 1 : 0), 0);
    if (score > bestScore) { bestScore = score; bestSkills = domain.skills; }
  }
  if (bestScore > 0 && bestSkills) return bestSkills;

  // Pass 4 — no match at all: return coreSkills so at least something relevant is shown
  return taxonomy.coreSkills;
}

const ATS_SECTIONS = ['education', 'experience', 'projects', 'skills', 'certifications', 'internship', 'achievements'];
const IMPACT_PATTERNS = [
  /\b\d+(\.\d+)?\s?%/g,
  /\b\d+(\.\d+)?\s?(lpa|cr|crore|lakhs?|k|m|mn|million|hours?|days?)\b/gi,
  /\b(reduced|improved|increased|decreased|saved|optimized|automated|built|launched|created|delivered)\b/gi
];

export function analyzeResumeText({ resumeText, programme, targetRole = '', targetCompany = '' }) {
  const programmeCode = normalizeProgrammeCode(programme) || 'bda';
  const taxonomy = PROGRAMME_TAXONOMY[programmeCode] || PROGRAMME_TAXONOMY.bda;
  const text = normalizeResumeText(resumeText);
  const lower = text.toLowerCase();

  // Use role-specific skill subset when a target role is specified so recommendations are relevant
  const roleSkills   = getRoleSpecificSkills(programmeCode, targetRole, taxonomy);
  const allSkillMatches  = findMatches(lower, taxonomy.coreSkills); // for extraction/display
  const roleSkillMatches = findMatches(lower, roleSkills);           // for scoring

  const toolMatches = findMatches(lower, taxonomy.tools);
  const roleMatches = findMatches(lower, taxonomy.roleKeywords.concat(splitWords(targetRole)));
  const projectMatches = findMatches(lower, taxonomy.projectSignals);
  const sectionMatches = findMatches(lower, ATS_SECTIONS);
  const impactMatches = countImpactSignals(text);
  const contactSignals = detectContactSignals(text);
  const lengthScore = scoreLength(text);

  const scores = {
    ats: scoreAts({ sectionMatches, contactSignals, lengthScore }),
    skills: ratioScore(roleSkillMatches.length, roleSkills.length),
    tools: ratioScore(toolMatches.length, Math.min(taxonomy.tools.length, 8)),
    roleAlignment: scoreRoleAlignment({ roleMatches, projectMatches, targetRole, targetCompany, lower }),
    impact: Math.min(100, impactMatches * 12),
    projects: ratioScore(projectMatches.length, Math.min(taxonomy.projectSignals.length, 8))
  };

  const weightedOverall = Math.round(
    scores.ats * 0.18 +
    scores.skills * 0.24 +
    scores.tools * 0.14 +
    scores.roleAlignment * 0.18 +
    scores.impact * 0.14 +
    scores.projects * 0.12
  );

  const missingRoleSkills = missingTop(roleSkills, roleSkillMatches, 5);

  return {
    programme: programmeCode,
    targetRole: targetRole || null,
    targetCompany: targetCompany || null,
    overallScore: weightedOverall,
    scores,
    extracted: {
      skills: allSkillMatches,
      tools: toolMatches,
      roleSignals: roleMatches,
      projectSignals: projectMatches,
      sections: sectionMatches,
      impactSignals: impactMatches,
      contactSignals
    },
    missing: {
      prioritySkills: missingRoleSkills,
      tools: missingTop(taxonomy.tools, toolMatches, 5),
      projectSignals: missingTop(taxonomy.projectSignals, projectMatches, 5)
    },
    recommendations: buildRecommendations({
      programmeCode,
      targetRole,
      scores,
      missingSkills: missingRoleSkills,
      missingTools: missingTop(taxonomy.tools, toolMatches, 5),
      impactMatches,
      sectionMatches
    }),
    explanation: buildExplanation(scores, weightedOverall)
  };
}

export function normalizeResumeText(value) {
  return String(value || '')
    .replace(/\r\n/g, '\n')
    .replace(/\t/g, ' ')
    .replace(/[ \u00a0]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function findMatches(lowerText, terms) {
  const uniqueTerms = [...new Set(terms.filter(Boolean).map(term => String(term).toLowerCase()))];
  return uniqueTerms.filter(term => lowerText.includes(term));
}

function splitWords(value) {
  return String(value || '')
    .toLowerCase()
    .split(/[^a-z0-9+#.]+/)
    .filter(word => word.length >= 3);
}

function countImpactSignals(text) {
  const matches = new Set();
  for (const pattern of IMPACT_PATTERNS) {
    for (const match of text.matchAll(pattern)) {
      matches.add(match[0].toLowerCase());
    }
  }
  return matches.size;
}

function detectContactSignals(text) {
  return {
    email: /[^\s@]+@[^\s@]+\.[^\s@]+/.test(text),
    phone: /(\+?\d[\d\s-]{8,}\d)/.test(text),
    linkedin: /linkedin\.com/i.test(text),
    github: /github\.com/i.test(text)
  };
}

function scoreLength(text) {
  const words = text.split(/\s+/).filter(Boolean).length;
  if (words < 250) return 45;
  if (words <= 850) return 100;
  if (words <= 1100) return 82;
  return 62;
}

function scoreAts({ sectionMatches, contactSignals, lengthScore }) {
  const contactScore = [contactSignals.email, contactSignals.phone, contactSignals.linkedin].filter(Boolean).length * 10;
  const sectionScore = ratioScore(sectionMatches.length, 5) * 0.6;
  return Math.round(Math.min(100, sectionScore + contactScore + lengthScore * 0.15));
}

function scoreRoleAlignment({ roleMatches, projectMatches, targetRole, targetCompany, lower }) {
  let score = ratioScore(roleMatches.length + projectMatches.length, 8);
  if (targetRole && lower.includes(String(targetRole).toLowerCase())) score += 10;
  if (targetCompany && lower.includes(String(targetCompany).toLowerCase())) score += 5;
  return Math.min(100, Math.round(score));
}

function ratioScore(matches, denominator) {
  if (!denominator) return 0;
  return Math.round(Math.min(100, (matches / denominator) * 100));
}

function missingTop(source, matches, count) {
  const found = new Set(matches);
  return source.filter(item => !found.has(item)).slice(0, count);
}

function buildRecommendations({ programmeCode, targetRole, scores, missingSkills, missingTools, impactMatches, sectionMatches }) {
  const recs = [];
  const roleLabel = targetRole ? `${targetRole} role` : `${programmeCode.toUpperCase()} programme`;

  if (scores.ats < 75) {
    recs.push('Improve ATS structure: use clear headings for Education, Experience, Projects, Skills, and Certifications.');
  }

  if (missingSkills.length) {
    recs.push(`Add evidence for ${roleLabel}-critical skills: ${missingSkills.join(', ')}.`);
  }

  if (missingTools.length) {
    recs.push(`Include relevant tools only if you can defend them in interviews: ${missingTools.join(', ')}.`);
  }

  if (impactMatches < 4) {
    recs.push('Quantify outcomes with numbers such as accuracy lift, cost reduction, time saved, revenue impact, or process improvement.');
  }

  if (!sectionMatches.includes('projects')) {
    recs.push('Add a project section with 2-3 role-relevant projects and measurable business context.');
  }

  if (scores.projects < 65) {
    const roleSuffix = targetRole
      ? `"${targetRole}" role`
      : `${programmeCode.toUpperCase()} roles`;
    recs.push(`Add role-relevant project signals for ${roleSuffix} with specific tools used, tasks completed, and measurable business outcomes.`);
  }

  return recs.slice(0, 6);
}

function buildExplanation(scores, overallScore) {
  return [
    `Overall score is ${overallScore}/100 based on transparent weighted scoring, not random estimation.`,
    `Skill coverage contributed ${scores.skills}/100 and tool coverage contributed ${scores.tools}/100.`,
    `ATS structure contributed ${scores.ats}/100 based on sections, contact signals, and resume length.`,
    `Impact score is ${scores.impact}/100 based on quantified or action-oriented outcome signals.`
  ];
}
