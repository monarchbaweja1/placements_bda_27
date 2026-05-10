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

  const skillMatches = findMatches(lower, taxonomy.coreSkills);
  const toolMatches = findMatches(lower, taxonomy.tools);
  const roleMatches = findMatches(lower, taxonomy.roleKeywords.concat(splitWords(targetRole)));
  const projectMatches = findMatches(lower, taxonomy.projectSignals);
  const sectionMatches = findMatches(lower, ATS_SECTIONS);
  const impactMatches = countImpactSignals(text);
  const contactSignals = detectContactSignals(text);
  const lengthScore = scoreLength(text);

  const scores = {
    ats: scoreAts({ sectionMatches, contactSignals, lengthScore }),
    skills: ratioScore(skillMatches.length, taxonomy.coreSkills.length),
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

  return {
    programme: programmeCode,
    targetRole: targetRole || null,
    targetCompany: targetCompany || null,
    overallScore: weightedOverall,
    scores,
    extracted: {
      skills: skillMatches,
      tools: toolMatches,
      roleSignals: roleMatches,
      projectSignals: projectMatches,
      sections: sectionMatches,
      impactSignals: impactMatches,
      contactSignals
    },
    missing: {
      prioritySkills: missingTop(taxonomy.coreSkills, skillMatches, 5),
      tools: missingTop(taxonomy.tools, toolMatches, 5),
      projectSignals: missingTop(taxonomy.projectSignals, projectMatches, 5)
    },
    recommendations: buildRecommendations({
      programmeCode,
      scores,
      missingSkills: missingTop(taxonomy.coreSkills, skillMatches, 5),
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

function buildRecommendations({ programmeCode, scores, missingSkills, missingTools, impactMatches, sectionMatches }) {
  const recs = [];

  if (scores.ats < 75) {
    recs.push('Improve ATS structure: use clear headings for Education, Experience, Projects, Skills, and Certifications.');
  }

  if (missingSkills.length) {
    recs.push(`Add evidence for programme-critical skills: ${missingSkills.join(', ')}.`);
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

  if (programmeCode === 'bda' && scores.projects < 65) {
    recs.push('For BDA roles, add analytics project signals such as SQL analysis, dashboarding, predictive modeling, segmentation, or A/B testing.');
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
