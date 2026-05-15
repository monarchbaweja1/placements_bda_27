import { normalizeProgrammeCode } from './programmeGuard.js';

// ── Company profiles — MBA/PGDM placement specific (Indian B-school context)
// minCgpa / strongCgpa: on 10-point scale; converted to /8 for display
// All thresholds and skills calibrated for PGDM/MBA hiring, not BTech/generic roles

const COMPANY_PROFILES = {

  // ─────────────────────────────────────────────────────────────────────────
  // BDA — Big Data Analytics
  // ─────────────────────────────────────────────────────────────────────────
  bda: [
    {
      name: 'Deloitte',
      sector: 'Consulting / Analytics',
      minCgpa: 6.5, strongCgpa: 7.5,
      requiredSkills: ['sql', 'python', 'analytics', 'data visualization', 'excel'],
      preferredSkills: ['power bi', 'tableau', 'machine learning', 'statistics', 'r'],
      roleKeywords: ['analyst', 'consultant', 'data', 'business analyst', 'insights'],
      weights: { cgpa: 0.25, skills: 0.40, role: 0.20, projects: 0.15 },
      note: 'Hires for analytics consulting. SQL/Python proficiency + case-study readiness are key differentiators.'
    },
    {
      name: 'KPMG',
      sector: 'Advisory / Analytics',
      minCgpa: 6.5, strongCgpa: 7.5,
      requiredSkills: ['sql', 'excel', 'analytics', 'data visualization'],
      preferredSkills: ['power bi', 'tableau', 'python', 'risk analytics'],
      roleKeywords: ['analyst', 'advisory', 'consultant', 'data', 'audit'],
      weights: { cgpa: 0.26, skills: 0.38, role: 0.20, projects: 0.16 },
      note: 'CGPA threshold enforced. Excel + data storytelling is the primary filter after academics.'
    },
    {
      name: 'EY',
      sector: 'Advisory / Technology',
      minCgpa: 6.5, strongCgpa: 7.5,
      requiredSkills: ['sql', 'python', 'analytics', 'excel'],
      preferredSkills: ['power bi', 'machine learning', 'tableau', 'statistics'],
      roleKeywords: ['analyst', 'consultant', 'data', 'technology', 'advisory'],
      weights: { cgpa: 0.24, skills: 0.40, role: 0.20, projects: 0.16 },
      note: 'Technology-heavy advisory roles. Python and SQL are strongly weighted for BDA hires.'
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
      weights: { cgpa: 0.18, skills: 0.44, role: 0.22, projects: 0.16 },
      note: 'Large intake. Technical portfolio and problem-solving matter more than CGPA. Strategy + Analytics roles.'
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
      weights: { cgpa: 0.20, skills: 0.46, role: 0.18, projects: 0.16 },
      note: 'Strong ML/AI focus. Practical projects with business impact are given significant weight.'
    },
    {
      name: 'ZS Associates',
      sector: 'Analytics / Consulting',
      minCgpa: 7.0, strongCgpa: 8.0,
      requiredSkills: ['analytics', 'excel', 'sql', 'statistics', 'python'],
      preferredSkills: ['machine learning', 'tableau', 'power bi', 'r', 'pharma analytics'],
      roleKeywords: ['analyst', 'associate', 'consultant', 'data', 'business analytics'],
      weights: { cgpa: 0.30, skills: 0.40, role: 0.18, projects: 0.12 },
      note: 'One of the highest CGPA bars in analytics consulting. Strong pharma/healthcare analytics focus. Structured thinking + case prep essential.'
    },
    {
      name: 'Publicis Sapient',
      sector: 'Digital / Analytics Consulting',
      minCgpa: 6.5, strongCgpa: 7.5,
      requiredSkills: ['analytics', 'sql', 'excel', 'python'],
      preferredSkills: ['power bi', 'tableau', 'digital marketing', 'crm', 'machine learning'],
      roleKeywords: ['analyst', 'consultant', 'digital', 'data', 'technology'],
      weights: { cgpa: 0.22, skills: 0.42, role: 0.22, projects: 0.14 },
      note: 'Digital transformation focus. Blend of analytics + consulting skills valued. Good entry point for BDA MBAs.'
    },
    {
      name: 'Tiger Analytics',
      sector: 'AI / Analytics',
      minCgpa: 6.5, strongCgpa: 7.5,
      requiredSkills: ['python', 'machine learning', 'sql', 'statistics'],
      preferredSkills: ['deep learning', 'r', 'tableau', 'azure', 'aws'],
      roleKeywords: ['data scientist', 'ml engineer', 'analytics', 'ai', 'modeling'],
      weights: { cgpa: 0.20, skills: 0.48, role: 0.18, projects: 0.14 },
      note: 'Pure analytics / AI firm. Technical depth in ML and Python is the primary filter.'
    },
    {
      name: 'McKinsey & Company',
      sector: 'Management Consulting / Analytics',
      minCgpa: 7.5, strongCgpa: 8.0,
      requiredSkills: ['analytics', 'excel', 'statistics', 'python', 'sql'],
      preferredSkills: ['machine learning', 'tableau', 'power bi', 'r', 'case solving'],
      roleKeywords: ['analyst', 'associate', 'data', 'insights', 'strategy'],
      weights: { cgpa: 0.35, skills: 0.36, role: 0.18, projects: 0.11 },
      note: 'QuantumBlack / analytics arm. Extremely high bar — CGPA 7.5+ typical filter. Problem-solving + technical depth both required.'
    },
    {
      name: 'BCG',
      sector: 'Management Consulting / Analytics',
      minCgpa: 7.5, strongCgpa: 8.0,
      requiredSkills: ['analytics', 'python', 'statistics', 'excel', 'sql'],
      preferredSkills: ['machine learning', 'tableau', 'r', 'power bi'],
      roleKeywords: ['analyst', 'associate', 'data', 'insights', 'strategy'],
      weights: { cgpa: 0.35, skills: 0.36, role: 0.18, projects: 0.11 },
      note: 'BCG GAMMA analytics arm. Same high bar as McKinsey. Case performance is the ultimate differentiator.'
    },
    {
      name: 'Goldman Sachs',
      sector: 'BFSI / Technology Analytics',
      minCgpa: 7.5, strongCgpa: 8.0,
      requiredSkills: ['python', 'sql', 'statistics', 'data analysis', 'excel'],
      preferredSkills: ['machine learning', 'financial analytics', 'r', 'quantitative', 'risk'],
      roleKeywords: ['analyst', 'data', 'technology', 'quantitative', 'finance'],
      weights: { cgpa: 0.36, skills: 0.36, role: 0.16, projects: 0.12 },
      note: 'Very high academic bar. Quantitative rigor and SQL/Python depth are essential. Finance + tech roles for BDA profiles.'
    },
    {
      name: 'JP Morgan',
      sector: 'BFSI / Analytics',
      minCgpa: 7.0, strongCgpa: 8.0,
      requiredSkills: ['sql', 'python', 'statistics', 'excel', 'data analysis'],
      preferredSkills: ['machine learning', 'financial analytics', 'risk', 'r', 'quantitative'],
      roleKeywords: ['analyst', 'data', 'technology', 'quantitative', 'finance', 'risk'],
      weights: { cgpa: 0.35, skills: 0.36, role: 0.16, projects: 0.13 },
      note: 'CGPA is heavily weighted. 7+ on 10-scale is a hard filter. Strong SQL and quantitative background expected.'
    },
    {
      name: 'American Express',
      sector: 'BFSI / Analytics',
      minCgpa: 6.5, strongCgpa: 7.5,
      requiredSkills: ['sql', 'python', 'analytics', 'statistics', 'excel'],
      preferredSkills: ['machine learning', 'power bi', 'tableau', 'r', 'customer analytics'],
      roleKeywords: ['analyst', 'data scientist', 'risk', 'credit', 'customer'],
      weights: { cgpa: 0.26, skills: 0.42, role: 0.18, projects: 0.14 },
      note: 'Risk and customer analytics are core. Actively recruits from MBA programmes for analytics roles.'
    },
    {
      name: 'Amazon',
      sector: 'E-commerce / Tech Analytics',
      minCgpa: 7.0, strongCgpa: 8.0,
      requiredSkills: ['sql', 'python', 'analytics', 'data visualization', 'excel'],
      preferredSkills: ['machine learning', 'statistics', 'tableau', 'spark', 'aws'],
      roleKeywords: ['analyst', 'data scientist', 'business analyst', 'supply chain', 'product'],
      weights: { cgpa: 0.26, skills: 0.44, role: 0.18, projects: 0.12 },
      note: 'High bar for quantitative skills. Supply chain + product analytics experience valued. Data-driven decision culture.'
    },
    {
      name: 'Flipkart',
      sector: 'E-commerce / Analytics',
      minCgpa: 6.5, strongCgpa: 7.5,
      requiredSkills: ['sql', 'python', 'analytics', 'excel'],
      preferredSkills: ['machine learning', 'statistics', 'tableau', 'power bi', 'product analytics'],
      roleKeywords: ['analyst', 'data scientist', 'business analyst', 'product', 'operations'],
      weights: { cgpa: 0.22, skills: 0.44, role: 0.20, projects: 0.14 },
      note: 'Recruits MBAs for business analytics and product analytics roles. High-energy, fast-paced environment.'
    },
    {
      name: 'Walmart Global Tech',
      sector: 'Retail / Tech Analytics',
      minCgpa: 6.5, strongCgpa: 7.5,
      requiredSkills: ['sql', 'python', 'analytics', 'data visualization'],
      preferredSkills: ['machine learning', 'statistics', 'tableau', 'spark', 'retail analytics'],
      roleKeywords: ['analyst', 'data scientist', 'business analyst', 'supply chain', 'retail'],
      weights: { cgpa: 0.22, skills: 0.44, role: 0.20, projects: 0.14 },
      note: 'Retail analytics and supply chain analytics are primary hire areas. SQL depth is heavily tested.'
    },
    {
      name: "Lowe's India",
      sector: 'Retail / Analytics',
      minCgpa: 6.0, strongCgpa: 7.2,
      requiredSkills: ['sql', 'python', 'analytics', 'excel'],
      preferredSkills: ['machine learning', 'tableau', 'power bi', 'statistics', 'retail analytics'],
      roleKeywords: ['analyst', 'data scientist', 'business analyst', 'retail', 'operations'],
      weights: { cgpa: 0.20, skills: 0.44, role: 0.22, projects: 0.14 },
      note: 'Good entry-level analytics roles for MBA candidates. Retail analytics + SQL proficiency are top requirements.'
    },
    {
      name: 'HDFC Bank',
      sector: 'BFSI / Analytics',
      minCgpa: 6.5, strongCgpa: 7.5,
      requiredSkills: ['sql', 'excel', 'analytics', 'data visualization'],
      preferredSkills: ['python', 'power bi', 'tableau', 'banking', 'risk'],
      roleKeywords: ['analyst', 'data', 'banking', 'credit', 'risk', 'operations'],
      weights: { cgpa: 0.28, skills: 0.38, role: 0.18, projects: 0.16 },
      note: 'Banking/finance domain knowledge is a strong positive signal. Analytics + risk roles for BDA profiles.'
    },
    {
      name: 'Axis Bank',
      sector: 'BFSI / Analytics',
      minCgpa: 6.0, strongCgpa: 7.2,
      requiredSkills: ['sql', 'excel', 'analytics'],
      preferredSkills: ['python', 'power bi', 'tableau', 'risk', 'credit'],
      roleKeywords: ['analyst', 'data', 'banking', 'risk', 'credit'],
      weights: { cgpa: 0.26, skills: 0.38, role: 0.20, projects: 0.16 },
      note: 'Slightly lower bar than HDFC. Analytics-driven roles in risk and credit functions.'
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
      note: 'Consumer and retail analytics experience is advantageous. Similar profile to Kantar.'
    },
    {
      name: 'Capgemini',
      sector: 'IT / Analytics Consulting',
      minCgpa: 5.5, strongCgpa: 6.8,
      requiredSkills: ['sql', 'analytics', 'excel'],
      preferredSkills: ['python', 'power bi', 'tableau', 'machine learning'],
      roleKeywords: ['analyst', 'consultant', 'data', 'technology'],
      weights: { cgpa: 0.16, skills: 0.44, role: 0.24, projects: 0.16 },
      note: 'Lower CGPA threshold. Portfolio of projects and communication skills drive outcomes.'
    },
    {
      name: 'Wipro',
      sector: 'IT / Analytics Services',
      minCgpa: 5.5, strongCgpa: 7.0,
      requiredSkills: ['sql', 'analytics', 'excel', 'python'],
      preferredSkills: ['power bi', 'tableau', 'machine learning', 'cloud'],
      roleKeywords: ['analyst', 'consultant', 'data', 'technology', 'solutions'],
      weights: { cgpa: 0.16, skills: 0.44, role: 0.24, projects: 0.16 },
      note: 'Large intake. Skills and project portfolio matter more. Digital and analytics practices are primary targets.'
    },
    {
      name: 'Swiggy',
      sector: 'Food Tech / Analytics',
      minCgpa: 6.5, strongCgpa: 7.5,
      requiredSkills: ['sql', 'python', 'analytics', 'excel'],
      preferredSkills: ['machine learning', 'statistics', 'tableau', 'product analytics'],
      roleKeywords: ['analyst', 'business analyst', 'product', 'operations', 'data'],
      weights: { cgpa: 0.20, skills: 0.46, role: 0.20, projects: 0.14 },
      note: 'Fast-paced startup culture. Product and operations analytics are primary hire areas. SQL is heavily tested.'
    },
    {
      name: 'Razorpay',
      sector: 'Fintech / Analytics',
      minCgpa: 6.5, strongCgpa: 7.5,
      requiredSkills: ['sql', 'python', 'analytics', 'excel'],
      preferredSkills: ['machine learning', 'statistics', 'product analytics', 'fintech'],
      roleKeywords: ['analyst', 'data scientist', 'product', 'business analyst', 'fintech'],
      weights: { cgpa: 0.20, skills: 0.46, role: 0.20, projects: 0.14 },
      note: 'Fintech startup. SQL + Python proficiency and fintech/payments domain interest are key.'
    }
  ],

  // ─────────────────────────────────────────────────────────────────────────
  // BIFS — Banking, Insurance & Financial Services
  // ─────────────────────────────────────────────────────────────────────────
  bifs: [
    {
      name: 'Goldman Sachs',
      sector: 'Investment Banking',
      minCgpa: 7.5, strongCgpa: 8.0,
      requiredSkills: ['financial analysis', 'valuation', 'excel', 'capital markets', 'banking'],
      preferredSkills: ['bloomberg', 'sql', 'python', 'risk management', 'modelling'],
      roleKeywords: ['analyst', 'investment banking', 'equity', 'capital markets', 'ibd'],
      weights: { cgpa: 0.40, skills: 0.36, role: 0.14, projects: 0.10 },
      note: 'Extremely high CGPA bar (7.5+). Interview process tests financial modelling, valuation, and market knowledge rigorously.'
    },
    {
      name: 'JP Morgan',
      sector: 'Investment Banking / BFSI',
      minCgpa: 7.5, strongCgpa: 8.0,
      requiredSkills: ['financial analysis', 'valuation', 'excel', 'banking', 'capital markets'],
      preferredSkills: ['bloomberg', 'sql', 'python', 'risk management', 'credit'],
      roleKeywords: ['analyst', 'investment banking', 'markets', 'credit', 'risk'],
      weights: { cgpa: 0.40, skills: 0.36, role: 0.14, projects: 0.10 },
      note: 'Top-tier IB. CGPA is a hard filter. Financial modelling + markets knowledge are assessed in interviews.'
    },
    {
      name: 'Morgan Stanley',
      sector: 'Investment Banking',
      minCgpa: 7.5, strongCgpa: 8.0,
      requiredSkills: ['financial analysis', 'valuation', 'excel', 'capital markets'],
      preferredSkills: ['bloomberg', 'sql', 'python', 'risk management', 'equity research'],
      roleKeywords: ['analyst', 'investment banking', 'equity', 'markets', 'ibd'],
      weights: { cgpa: 0.40, skills: 0.36, role: 0.14, projects: 0.10 },
      note: 'Tier-1 IB with a very high CGPA filter. Strong financial modelling and markets preparation required.'
    },
    {
      name: 'Deutsche Bank',
      sector: 'Investment Banking / Markets',
      minCgpa: 7.0, strongCgpa: 8.0,
      requiredSkills: ['financial analysis', 'capital markets', 'excel', 'banking'],
      preferredSkills: ['bloomberg', 'risk management', 'fixed income', 'derivatives', 'sql'],
      roleKeywords: ['analyst', 'markets', 'banking', 'investment', 'risk'],
      weights: { cgpa: 0.36, skills: 0.36, role: 0.16, projects: 0.12 },
      note: 'Strong in fixed income and markets. CGPA filter is high. European banking exposure is an advantage.'
    },
    {
      name: 'Barclays',
      sector: 'Investment Banking / Markets',
      minCgpa: 7.0, strongCgpa: 8.0,
      requiredSkills: ['financial analysis', 'capital markets', 'excel', 'banking'],
      preferredSkills: ['bloomberg', 'risk management', 'derivatives', 'fixed income', 'credit'],
      roleKeywords: ['analyst', 'markets', 'investment banking', 'risk', 'credit'],
      weights: { cgpa: 0.36, skills: 0.36, role: 0.16, projects: 0.12 },
      note: 'Strong IB and markets presence. Similar profile to Deutsche Bank. Capital markets knowledge is tested.'
    },
    {
      name: 'Citi',
      sector: 'Banking / Capital Markets',
      minCgpa: 7.0, strongCgpa: 8.0,
      requiredSkills: ['financial analysis', 'excel', 'banking', 'capital markets'],
      preferredSkills: ['bloomberg', 'risk management', 'credit', 'valuation', 'sql'],
      roleKeywords: ['analyst', 'banking', 'markets', 'investment', 'treasury'],
      weights: { cgpa: 0.35, skills: 0.36, role: 0.17, projects: 0.12 },
      note: 'Global banking presence. Strong in treasury, capital markets, and transaction banking.'
    },
    {
      name: 'Standard Chartered',
      sector: 'Banking / Financial Services',
      minCgpa: 6.5, strongCgpa: 7.5,
      requiredSkills: ['financial analysis', 'banking', 'excel', 'credit'],
      preferredSkills: ['risk management', 'capital markets', 'bloomberg', 'sql', 'trade finance'],
      roleKeywords: ['analyst', 'banking', 'relationship', 'credit', 'trade'],
      weights: { cgpa: 0.32, skills: 0.38, role: 0.18, projects: 0.12 },
      note: 'Strong in emerging markets and trade finance. Relationship management and credit skills valued.'
    },
    {
      name: 'HSBC',
      sector: 'Banking / Financial Services',
      minCgpa: 6.5, strongCgpa: 7.5,
      requiredSkills: ['financial analysis', 'banking', 'excel', 'credit risk'],
      preferredSkills: ['risk management', 'capital markets', 'bloomberg', 'compliance', 'trade'],
      roleKeywords: ['analyst', 'banking', 'relationship', 'risk', 'compliance'],
      weights: { cgpa: 0.32, skills: 0.38, role: 0.18, projects: 0.12 },
      note: 'International banking focus. Compliance and risk management awareness is a differentiator.'
    },
    {
      name: 'Kotak Mahindra Bank',
      sector: 'Banking / Financial Services',
      minCgpa: 6.5, strongCgpa: 7.5,
      requiredSkills: ['financial analysis', 'banking', 'excel', 'credit'],
      preferredSkills: ['risk management', 'portfolio', 'capital markets', 'wealth', 'valuation'],
      roleKeywords: ['analyst', 'banking', 'wealth', 'credit', 'relationship'],
      weights: { cgpa: 0.32, skills: 0.38, role: 0.18, projects: 0.12 },
      note: 'Strong wealth management and corporate banking. Good MBA intake for relationship and credit roles.'
    },
    {
      name: 'HDFC Bank',
      sector: 'Banking',
      minCgpa: 6.5, strongCgpa: 7.5,
      requiredSkills: ['financial analysis', 'credit risk', 'excel', 'banking'],
      preferredSkills: ['sql', 'power bi', 'valuation', 'portfolio', 'risk management'],
      roleKeywords: ['credit analyst', 'relationship manager', 'banking', 'risk'],
      weights: { cgpa: 0.30, skills: 0.40, role: 0.18, projects: 0.12 },
      note: 'Credit risk and banking domain knowledge strongly preferred. One of the largest MBA employers in banking.'
    },
    {
      name: 'ICICI Bank',
      sector: 'Banking',
      minCgpa: 6.5, strongCgpa: 7.5,
      requiredSkills: ['financial analysis', 'excel', 'banking', 'credit'],
      preferredSkills: ['sql', 'risk management', 'portfolio', 'valuation'],
      roleKeywords: ['analyst', 'banking', 'credit', 'relationship', 'risk'],
      weights: { cgpa: 0.30, skills: 0.40, role: 0.18, projects: 0.12 },
      note: 'Large MBA intake. Credit, relationship management, and retail banking are primary tracks.'
    },
    {
      name: 'Axis Bank',
      sector: 'Banking',
      minCgpa: 6.0, strongCgpa: 7.2,
      requiredSkills: ['financial analysis', 'excel', 'banking'],
      preferredSkills: ['sql', 'credit risk', 'portfolio', 'power bi'],
      roleKeywords: ['analyst', 'banking', 'credit', 'risk', 'relationship'],
      weights: { cgpa: 0.28, skills: 0.40, role: 0.18, projects: 0.14 },
      note: 'Slightly lower CGPA threshold than HDFC/ICICI. Good MBA intake across credit, retail, and SME banking.'
    },
    {
      name: 'Yes Bank',
      sector: 'Banking',
      minCgpa: 6.0, strongCgpa: 7.0,
      requiredSkills: ['financial analysis', 'banking', 'excel'],
      preferredSkills: ['credit risk', 'portfolio', 'risk management', 'trade finance'],
      roleKeywords: ['analyst', 'banking', 'credit', 'relationship', 'corporate'],
      weights: { cgpa: 0.26, skills: 0.40, role: 0.20, projects: 0.14 },
      note: 'More accessible CGPA bar. Corporate banking and SME credit are key recruitment tracks.'
    },
    {
      name: 'Bajaj Finance',
      sector: 'NBFC / Financial Services',
      minCgpa: 6.0, strongCgpa: 7.2,
      requiredSkills: ['financial analysis', 'excel', 'credit risk', 'analytics'],
      preferredSkills: ['sql', 'risk management', 'portfolio', 'consumer lending'],
      roleKeywords: ['analyst', 'credit', 'risk', 'business', 'lending'],
      weights: { cgpa: 0.24, skills: 0.42, role: 0.20, projects: 0.14 },
      note: 'Largest NBFC in India. Strong in consumer credit and business lending. Risk and analytics skills are valued.'
    },
    {
      name: 'Aditya Birla Capital',
      sector: 'Financial Services / NBFC',
      minCgpa: 6.0, strongCgpa: 7.2,
      requiredSkills: ['financial analysis', 'excel', 'banking', 'insurance'],
      preferredSkills: ['risk management', 'portfolio', 'wealth', 'capital markets', 'credit'],
      roleKeywords: ['analyst', 'wealth', 'insurance', 'lending', 'financial services'],
      weights: { cgpa: 0.26, skills: 0.40, role: 0.20, projects: 0.14 },
      note: 'Diversified financial services conglomerate. Wealth management, insurance, and lending are active tracks.'
    },
    {
      name: 'Motilal Oswal',
      sector: 'Wealth Management / Capital Markets',
      minCgpa: 6.5, strongCgpa: 7.5,
      requiredSkills: ['financial analysis', 'capital markets', 'valuation', 'excel'],
      preferredSkills: ['equity research', 'bloomberg', 'portfolio', 'risk management', 'sql'],
      roleKeywords: ['analyst', 'wealth', 'equity', 'research', 'capital markets'],
      weights: { cgpa: 0.30, skills: 0.40, role: 0.18, projects: 0.12 },
      note: 'Strong equity research and wealth management culture. CFA/FRM in progress is a differentiator.'
    },
    {
      name: 'IIFL Finance',
      sector: 'NBFC / Wealth',
      minCgpa: 6.0, strongCgpa: 7.2,
      requiredSkills: ['financial analysis', 'excel', 'credit risk', 'banking'],
      preferredSkills: ['risk management', 'wealth', 'portfolio', 'capital markets'],
      roleKeywords: ['analyst', 'wealth', 'credit', 'lending', 'financial services'],
      weights: { cgpa: 0.24, skills: 0.42, role: 0.20, projects: 0.14 },
      note: 'Diversified NBFC with wealth and credit arms. Good access for BIFS profiles.'
    },
    {
      name: 'KPMG',
      sector: 'Advisory / BFSI Consulting',
      minCgpa: 6.5, strongCgpa: 7.5,
      requiredSkills: ['financial analysis', 'excel', 'risk management', 'banking'],
      preferredSkills: ['sql', 'power bi', 'valuation', 'audit', 'compliance'],
      roleKeywords: ['analyst', 'advisory', 'risk', 'audit', 'financial'],
      weights: { cgpa: 0.28, skills: 0.38, role: 0.20, projects: 0.14 },
      note: 'Risk advisory and BFSI consulting. CFA/FRM certifications and BFSI internships are differentiators.'
    },
    {
      name: 'EY',
      sector: 'Advisory / BFSI Consulting',
      minCgpa: 6.5, strongCgpa: 7.5,
      requiredSkills: ['financial analysis', 'excel', 'analytics', 'risk', 'banking'],
      preferredSkills: ['sql', 'power bi', 'valuation', 'audit', 'compliance'],
      roleKeywords: ['analyst', 'advisory', 'risk', 'financial', 'assurance'],
      weights: { cgpa: 0.26, skills: 0.38, role: 0.20, projects: 0.16 },
      note: 'Transaction advisory and risk management consulting for BFSI profiles. Good intake from B-schools.'
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
    },
    {
      name: 'HDFC Life',
      sector: 'Life Insurance',
      minCgpa: 6.0, strongCgpa: 7.0,
      requiredSkills: ['insurance', 'financial analysis', 'excel', 'banking'],
      preferredSkills: ['risk management', 'actuarial', 'portfolio', 'analytics'],
      roleKeywords: ['analyst', 'insurance', 'sales', 'underwriting', 'product'],
      weights: { cgpa: 0.24, skills: 0.40, role: 0.22, projects: 0.14 },
      note: 'Life insurance product and distribution roles. MBA hires for strategy, product, and channel management.'
    },
    {
      name: 'ICICI Prudential',
      sector: 'Life Insurance / AMC',
      minCgpa: 6.0, strongCgpa: 7.2,
      requiredSkills: ['insurance', 'financial analysis', 'excel', 'capital markets'],
      preferredSkills: ['risk management', 'portfolio', 'actuarial', 'analytics', 'wealth'],
      roleKeywords: ['analyst', 'insurance', 'investment', 'portfolio', 'wealth'],
      weights: { cgpa: 0.26, skills: 0.40, role: 0.20, projects: 0.14 },
      note: 'Strong in both life insurance and AMC. MBA hires across investment, risk, and distribution tracks.'
    }
  ],

  // ─────────────────────────────────────────────────────────────────────────
  // HCM — Healthcare Management
  // ─────────────────────────────────────────────────────────────────────────
  hcm: [
    {
      name: 'Abbott',
      sector: 'Medical Devices / Diagnostics',
      minCgpa: 6.0, strongCgpa: 7.2,
      requiredSkills: ['healthcare', 'sales', 'medical devices', 'analytics'],
      preferredSkills: ['excel', 'crm', 'market access', 'pharma', 'clinical'],
      roleKeywords: ['sales', 'territory', 'medical', 'device', 'diagnostics'],
      weights: { cgpa: 0.22, skills: 0.38, role: 0.26, projects: 0.14 },
      note: 'Healthcare domain knowledge and sales aptitude are paramount. Device/diagnostics familiarity is a strong plus.'
    },
    {
      name: 'Cipla',
      sector: 'Pharma',
      minCgpa: 6.0, strongCgpa: 7.2,
      requiredSkills: ['pharma', 'sales', 'healthcare', 'analytics'],
      preferredSkills: ['excel', 'market access', 'crm', 'kol', 'strategy'],
      roleKeywords: ['sales', 'marketing', 'pharma', 'territory', 'medical'],
      weights: { cgpa: 0.22, skills: 0.38, role: 0.26, projects: 0.14 },
      note: 'Pharma sales and marketing roles. Healthcare domain exposure and KOL management skills are key.'
    },
    {
      name: 'Sun Pharma',
      sector: 'Pharma',
      minCgpa: 6.0, strongCgpa: 7.2,
      requiredSkills: ['pharma', 'sales', 'healthcare', 'market access'],
      preferredSkills: ['excel', 'crm', 'kol', 'strategy', 'analytics'],
      roleKeywords: ['sales', 'marketing', 'pharma', 'territory', 'brand'],
      weights: { cgpa: 0.22, skills: 0.38, role: 0.26, projects: 0.14 },
      note: "India's largest pharma company. Strong brand management and specialty pharma sales tracks for MBAs."
    },
    {
      name: 'Lupin',
      sector: 'Pharma',
      minCgpa: 6.0, strongCgpa: 7.2,
      requiredSkills: ['pharma', 'sales', 'healthcare', 'analytics'],
      preferredSkills: ['excel', 'crm', 'market access', 'kol', 'strategy'],
      roleKeywords: ['sales', 'marketing', 'pharma', 'territory', 'medical'],
      weights: { cgpa: 0.22, skills: 0.38, role: 0.26, projects: 0.14 },
      note: 'Strong international generics business. MBA hires for brand management and market development roles.'
    },
    {
      name: "Dr. Reddy's",
      sector: 'Pharma',
      minCgpa: 6.0, strongCgpa: 7.2,
      requiredSkills: ['pharma', 'sales', 'healthcare', 'market access'],
      preferredSkills: ['analytics', 'excel', 'crm', 'kol', 'strategy'],
      roleKeywords: ['sales', 'marketing', 'pharma', 'business', 'territory'],
      weights: { cgpa: 0.22, skills: 0.38, role: 0.26, projects: 0.14 },
      note: 'Global pharma operations. Brand management and market access roles for MBA candidates.'
    },
    {
      name: 'Pfizer',
      sector: 'Pharma / MNC',
      minCgpa: 6.5, strongCgpa: 7.5,
      requiredSkills: ['pharma', 'healthcare', 'sales', 'market access', 'strategy'],
      preferredSkills: ['analytics', 'excel', 'crm', 'kol', 'regulatory'],
      roleKeywords: ['sales', 'marketing', 'medical', 'pharma', 'access'],
      weights: { cgpa: 0.26, skills: 0.38, role: 0.24, projects: 0.12 },
      note: 'MNC pharma with higher bar. Brand management, medical affairs, and market access are primary MBA tracks.'
    },
    {
      name: 'Novartis',
      sector: 'Pharma / MNC',
      minCgpa: 6.5, strongCgpa: 7.5,
      requiredSkills: ['pharma', 'healthcare', 'sales', 'market access'],
      preferredSkills: ['strategy', 'analytics', 'excel', 'kol', 'regulatory'],
      roleKeywords: ['marketing', 'medical', 'market access', 'pharma', 'strategy'],
      weights: { cgpa: 0.26, skills: 0.38, role: 0.24, projects: 0.12 },
      note: 'Specialty pharma and oncology focus. Market access + KOL engagement are core competencies.'
    },
    {
      name: 'Johnson & Johnson',
      sector: 'Medical Devices / Pharma / Consumer',
      minCgpa: 6.5, strongCgpa: 7.5,
      requiredSkills: ['healthcare', 'sales', 'medical devices', 'analytics', 'strategy'],
      preferredSkills: ['market access', 'crm', 'excel', 'kol', 'pharma'],
      roleKeywords: ['sales', 'marketing', 'medical', 'device', 'healthcare'],
      weights: { cgpa: 0.26, skills: 0.38, role: 0.24, projects: 0.12 },
      note: 'Diversified healthcare MNC. Medical devices + pharma sales tracks are most active for MBA hires.'
    },
    {
      name: 'Stryker',
      sector: 'Medical Devices',
      minCgpa: 6.5, strongCgpa: 7.5,
      requiredSkills: ['medical devices', 'sales', 'healthcare', 'analytics'],
      preferredSkills: ['excel', 'crm', 'market access', 'clinical', 'territory'],
      roleKeywords: ['sales', 'territory', 'medical', 'device', 'ortho'],
      weights: { cgpa: 0.24, skills: 0.40, role: 0.24, projects: 0.12 },
      note: 'Leading medical devices company. MBA hires for capital equipment sales and territory management roles.'
    },
    {
      name: 'Medtronic',
      sector: 'Medical Devices',
      minCgpa: 6.5, strongCgpa: 7.5,
      requiredSkills: ['medical devices', 'sales', 'healthcare', 'analytics'],
      preferredSkills: ['excel', 'crm', 'clinical', 'market access', 'strategy'],
      roleKeywords: ['sales', 'territory', 'medical', 'device', 'clinical'],
      weights: { cgpa: 0.24, skills: 0.40, role: 0.24, projects: 0.12 },
      note: 'Global medtech leader. Clinical selling + device knowledge are key differentiators.'
    },
    {
      name: 'Biocon',
      sector: 'Biopharma',
      minCgpa: 6.0, strongCgpa: 7.2,
      requiredSkills: ['pharma', 'healthcare', 'sales', 'market access'],
      preferredSkills: ['analytics', 'excel', 'strategy', 'regulatory', 'kol'],
      roleKeywords: ['sales', 'marketing', 'pharma', 'biotech', 'medical'],
      weights: { cgpa: 0.22, skills: 0.38, role: 0.26, projects: 0.14 },
      note: 'Leading biopharma. Biosimilars and specialty business expansion. Good MBA intake for marketing roles.'
    },
    {
      name: 'Apollo Hospitals',
      sector: 'Hospital Operations',
      minCgpa: 6.0, strongCgpa: 7.2,
      requiredSkills: ['healthcare', 'hospital operations', 'analytics', 'strategy'],
      preferredSkills: ['excel', 'power bi', 'patient experience', 'quality', 'operations'],
      roleKeywords: ['operations', 'healthcare', 'hospital', 'analytics', 'management'],
      weights: { cgpa: 0.22, skills: 0.38, role: 0.26, projects: 0.14 },
      note: 'Hospital operations and healthcare analytics experience is highly valued. Revenue cycle and patient experience roles.'
    },
    {
      name: 'Manipal Hospitals',
      sector: 'Hospital Operations',
      minCgpa: 6.0, strongCgpa: 7.0,
      requiredSkills: ['healthcare', 'hospital operations', 'analytics'],
      preferredSkills: ['excel', 'quality', 'patient experience', 'strategy', 'operations'],
      roleKeywords: ['operations', 'healthcare', 'hospital', 'management', 'quality'],
      weights: { cgpa: 0.20, skills: 0.38, role: 0.28, projects: 0.14 },
      note: 'Rapidly growing hospital network. Operations and business development roles for MBA hires.'
    },
    {
      name: 'Fortis Healthcare',
      sector: 'Hospital Operations',
      minCgpa: 6.0, strongCgpa: 7.0,
      requiredSkills: ['healthcare', 'hospital operations', 'analytics'],
      preferredSkills: ['excel', 'strategy', 'operations', 'patient experience', 'quality'],
      roleKeywords: ['operations', 'healthcare', 'hospital', 'management', 'analytics'],
      weights: { cgpa: 0.20, skills: 0.38, role: 0.28, projects: 0.14 },
      note: 'Multi-specialty hospital chain. Operations management and strategy roles for HCM profiles.'
    },
    {
      name: 'Narayana Health',
      sector: 'Hospital Operations',
      minCgpa: 5.5, strongCgpa: 7.0,
      requiredSkills: ['healthcare', 'hospital operations', 'analytics'],
      preferredSkills: ['excel', 'operations', 'quality', 'strategy', 'patient experience'],
      roleKeywords: ['operations', 'healthcare', 'hospital', 'management'],
      weights: { cgpa: 0.18, skills: 0.40, role: 0.28, projects: 0.14 },
      note: 'Known for frugal innovation in healthcare. Operations and quality management roles. Impact-driven culture.'
    },
    {
      name: 'Max Healthcare',
      sector: 'Hospital Operations',
      minCgpa: 6.0, strongCgpa: 7.0,
      requiredSkills: ['healthcare', 'hospital operations', 'analytics', 'strategy'],
      preferredSkills: ['excel', 'operations', 'quality', 'patient experience', 'business development'],
      roleKeywords: ['operations', 'healthcare', 'hospital', 'management', 'business development'],
      weights: { cgpa: 0.20, skills: 0.40, role: 0.26, projects: 0.14 },
      note: 'Premium healthcare network. Business development and operations roles for MBA candidates.'
    },
    {
      name: 'IQVIA',
      sector: 'Healthcare Analytics / CRO',
      minCgpa: 6.5, strongCgpa: 7.5,
      requiredSkills: ['healthcare', 'analytics', 'pharma', 'market access', 'strategy'],
      preferredSkills: ['excel', 'sql', 'power bi', 'market research', 'statistics'],
      roleKeywords: ['analyst', 'consulting', 'pharma', 'healthcare', 'insights'],
      weights: { cgpa: 0.26, skills: 0.40, role: 0.22, projects: 0.12 },
      note: 'Healthcare data and consulting. Analytics + pharma domain knowledge are core requirements. Good MBA entry point.'
    },
    {
      name: 'GE Healthcare',
      sector: 'Medical Devices / Health Tech',
      minCgpa: 6.5, strongCgpa: 7.5,
      requiredSkills: ['medical devices', 'healthcare', 'sales', 'analytics'],
      preferredSkills: ['strategy', 'market access', 'excel', 'digital health', 'operations'],
      roleKeywords: ['sales', 'marketing', 'medical', 'device', 'health tech'],
      weights: { cgpa: 0.24, skills: 0.40, role: 0.24, projects: 0.12 },
      note: 'Imaging and health tech leader. MBA hires for capital equipment sales and digital health strategy roles.'
    }
  ],

  // ─────────────────────────────────────────────────────────────────────────
  // CORE — General Management / FMCG / Consulting / Operations
  // ─────────────────────────────────────────────────────────────────────────
  core: [
    {
      name: 'Hindustan Unilever',
      sector: 'FMCG',
      minCgpa: 6.5, strongCgpa: 7.5,
      requiredSkills: ['marketing', 'sales', 'analytics', 'excel'],
      preferredSkills: ['brand management', 'consumer insights', 'supply chain', 'gtm'],
      roleKeywords: ['sales', 'marketing', 'management trainee', 'brand', 'fmcg'],
      weights: { cgpa: 0.28, skills: 0.36, role: 0.22, projects: 0.14 },
      note: 'Premium FMCG employer. MT roles are highly competitive. FMCG internship + brand/sales projects strongly differentiate.'
    },
    {
      name: 'P&G',
      sector: 'FMCG',
      minCgpa: 6.5, strongCgpa: 7.5,
      requiredSkills: ['marketing', 'sales', 'analytics', 'excel', 'strategy'],
      preferredSkills: ['brand management', 'consumer insights', 'gtm', 'supply chain'],
      roleKeywords: ['brand manager', 'sales', 'marketing', 'management trainee', 'fmcg'],
      weights: { cgpa: 0.28, skills: 0.36, role: 0.22, projects: 0.14 },
      note: "One of India's most coveted FMCG employers. High bar on structured thinking and brand/consumer understanding."
    },
    {
      name: 'Marico',
      sector: 'FMCG',
      minCgpa: 6.5, strongCgpa: 7.5,
      requiredSkills: ['marketing', 'sales', 'analytics', 'excel'],
      preferredSkills: ['brand management', 'consumer insights', 'distribution', 'gtm'],
      roleKeywords: ['sales', 'marketing', 'brand', 'management trainee', 'fmcg'],
      weights: { cgpa: 0.28, skills: 0.36, role: 0.22, projects: 0.14 },
      note: 'Agile FMCG culture. Brand and sales management roles. Good B-school recruiter at tier 2 schools.'
    },
    {
      name: 'Nestle',
      sector: 'FMCG / Food',
      minCgpa: 6.5, strongCgpa: 7.5,
      requiredSkills: ['marketing', 'sales', 'analytics', 'excel'],
      preferredSkills: ['brand management', 'consumer insights', 'supply chain', 'distribution'],
      roleKeywords: ['sales', 'marketing', 'brand', 'management trainee', 'food'],
      weights: { cgpa: 0.28, skills: 0.36, role: 0.22, projects: 0.14 },
      note: 'Strong brand culture. MT roles emphasise structured brand management + rural distribution experience.'
    },
    {
      name: 'ITC',
      sector: 'FMCG / Diversified',
      minCgpa: 6.5, strongCgpa: 7.5,
      requiredSkills: ['marketing', 'sales', 'analytics', 'excel', 'strategy'],
      preferredSkills: ['brand management', 'consumer insights', 'supply chain', 'trade marketing'],
      roleKeywords: ['sales', 'marketing', 'management trainee', 'brand', 'fmcg'],
      weights: { cgpa: 0.28, skills: 0.36, role: 0.22, projects: 0.14 },
      note: 'Diversified conglomerate with FMCG, hotels, agri, and paper. Strong MT programme across business verticals.'
    },
    {
      name: 'Godrej Consumer Products',
      sector: 'FMCG',
      minCgpa: 6.0, strongCgpa: 7.2,
      requiredSkills: ['marketing', 'sales', 'analytics', 'excel'],
      preferredSkills: ['brand management', 'consumer insights', 'distribution', 'gtm'],
      roleKeywords: ['sales', 'marketing', 'brand', 'management trainee', 'fmcg'],
      weights: { cgpa: 0.26, skills: 0.36, role: 0.24, projects: 0.14 },
      note: 'Good B-school recruiter at tier 2 schools. Emerging markets and brand management experience valued.'
    },
    {
      name: 'Dabur',
      sector: 'FMCG / Ayurveda',
      minCgpa: 6.0, strongCgpa: 7.2,
      requiredSkills: ['marketing', 'sales', 'analytics', 'excel'],
      preferredSkills: ['brand management', 'consumer insights', 'distribution', 'trade marketing'],
      roleKeywords: ['sales', 'marketing', 'brand', 'management trainee', 'consumer'],
      weights: { cgpa: 0.26, skills: 0.36, role: 0.24, projects: 0.14 },
      note: 'Ayurvedic and natural products FMCG. Sales and brand management roles. Rural distribution experience is a plus.'
    },
    {
      name: 'Colgate-Palmolive',
      sector: 'FMCG / Oral Care',
      minCgpa: 6.5, strongCgpa: 7.5,
      requiredSkills: ['marketing', 'sales', 'analytics', 'excel'],
      preferredSkills: ['brand management', 'consumer insights', 'distribution', 'gtm'],
      roleKeywords: ['sales', 'marketing', 'brand', 'management trainee', 'consumer'],
      weights: { cgpa: 0.28, skills: 0.36, role: 0.22, projects: 0.14 },
      note: 'Strong brand culture. MT roles focus on brand management, sales, and distribution management.'
    },
    {
      name: 'Asian Paints',
      sector: 'Manufacturing / FMCG',
      minCgpa: 6.5, strongCgpa: 7.5,
      requiredSkills: ['sales', 'marketing', 'analytics', 'excel'],
      preferredSkills: ['supply chain', 'distribution', 'brand', 'consumer', 'operations'],
      roleKeywords: ['sales', 'marketing', 'management trainee', 'operations', 'distribution'],
      weights: { cgpa: 0.28, skills: 0.36, role: 0.22, projects: 0.14 },
      note: 'Strong bias toward structured sales experience and quantified outcomes. Operations + sales MT tracks.'
    },
    {
      name: 'Berger Paints',
      sector: 'Manufacturing / Paints',
      minCgpa: 6.0, strongCgpa: 7.2,
      requiredSkills: ['sales', 'marketing', 'analytics', 'excel'],
      preferredSkills: ['distribution', 'operations', 'supply chain', 'brand'],
      roleKeywords: ['sales', 'marketing', 'management trainee', 'operations'],
      weights: { cgpa: 0.26, skills: 0.36, role: 0.24, projects: 0.14 },
      note: 'Good tier-2 B-school recruiter. Sales and operations management roles. Distribution network experience valued.'
    },
    {
      name: 'Pidilite',
      sector: 'Manufacturing / Specialty Chemicals',
      minCgpa: 6.0, strongCgpa: 7.2,
      requiredSkills: ['sales', 'marketing', 'analytics', 'excel'],
      preferredSkills: ['distribution', 'brand', 'consumer', 'operations', 'supply chain'],
      roleKeywords: ['sales', 'marketing', 'management trainee', 'brand', 'distribution'],
      weights: { cgpa: 0.26, skills: 0.36, role: 0.24, projects: 0.14 },
      note: 'Unique "pull" distribution model. Brand and channel management skills are key differentiators.'
    },
    {
      name: 'Britannia',
      sector: 'FMCG / Food',
      minCgpa: 6.0, strongCgpa: 7.2,
      requiredSkills: ['sales', 'marketing', 'analytics', 'excel'],
      preferredSkills: ['distribution', 'brand', 'consumer', 'supply chain', 'trade marketing'],
      roleKeywords: ['sales', 'marketing', 'brand', 'management trainee', 'distribution'],
      weights: { cgpa: 0.26, skills: 0.36, role: 0.24, projects: 0.14 },
      note: 'Good B-school recruiter. Sales and trade marketing roles. Rural and urban distribution experience valued.'
    },
    {
      name: 'Mondelez',
      sector: 'FMCG / Food',
      minCgpa: 6.5, strongCgpa: 7.5,
      requiredSkills: ['marketing', 'sales', 'analytics', 'excel'],
      preferredSkills: ['brand management', 'consumer insights', 'distribution', 'gtm'],
      roleKeywords: ['sales', 'marketing', 'brand', 'management trainee', 'consumer'],
      weights: { cgpa: 0.28, skills: 0.36, role: 0.22, projects: 0.14 },
      note: 'Global FMCG with strong brand culture. MT roles in sales and marketing. International exposure is a plus.'
    },
    {
      name: 'McKinsey & Company',
      sector: 'Management Consulting',
      minCgpa: 7.5, strongCgpa: 8.0,
      requiredSkills: ['strategy', 'analytics', 'excel', 'consulting', 'finance'],
      preferredSkills: ['operations', 'supply chain', 'marketing', 'power bi', 'sql'],
      roleKeywords: ['consultant', 'analyst', 'strategy', 'engagement', 'management'],
      weights: { cgpa: 0.36, skills: 0.34, role: 0.18, projects: 0.12 },
      note: 'Top consulting firm. Exceptionally high bar — CGPA 7.5+ is typical. Case performance is the ultimate filter.'
    },
    {
      name: 'BCG',
      sector: 'Management Consulting',
      minCgpa: 7.5, strongCgpa: 8.0,
      requiredSkills: ['strategy', 'analytics', 'excel', 'consulting'],
      preferredSkills: ['operations', 'finance', 'marketing', 'supply chain'],
      roleKeywords: ['consultant', 'analyst', 'strategy', 'engagement'],
      weights: { cgpa: 0.36, skills: 0.34, role: 0.18, projects: 0.12 },
      note: 'Top-tier strategy consulting. Similar bar to McKinsey. Structured problem-solving + quantitative reasoning are assessed.'
    },
    {
      name: 'Bain & Company',
      sector: 'Management Consulting',
      minCgpa: 7.5, strongCgpa: 8.0,
      requiredSkills: ['strategy', 'analytics', 'excel', 'consulting'],
      preferredSkills: ['operations', 'finance', 'private equity', 'marketing'],
      roleKeywords: ['consultant', 'analyst', 'strategy', 'engagement'],
      weights: { cgpa: 0.36, skills: 0.34, role: 0.18, projects: 0.12 },
      note: 'MBB consulting. Private equity and results-delivery focus. Case performance is the primary selection criterion.'
    },
    {
      name: 'Deloitte',
      sector: 'Management Consulting',
      minCgpa: 6.5, strongCgpa: 7.5,
      requiredSkills: ['strategy', 'analytics', 'excel', 'consulting'],
      preferredSkills: ['sql', 'power bi', 'operations', 'finance'],
      roleKeywords: ['consultant', 'analyst', 'strategy', 'operations', 'management'],
      weights: { cgpa: 0.26, skills: 0.38, role: 0.20, projects: 0.16 },
      note: 'Case study readiness and structured thinking are essential. Strategy and operations consulting roles for MBAs.'
    },
    {
      name: 'KPMG',
      sector: 'Management Consulting',
      minCgpa: 6.5, strongCgpa: 7.5,
      requiredSkills: ['strategy', 'analytics', 'excel', 'consulting'],
      preferredSkills: ['operations', 'finance', 'sql', 'supply chain'],
      roleKeywords: ['consultant', 'analyst', 'strategy', 'advisory'],
      weights: { cgpa: 0.26, skills: 0.38, role: 0.20, projects: 0.16 },
      note: 'Management consulting and advisory. Good tier-2 B-school intake. Structured problem-solving is assessed.'
    },
    {
      name: 'Amazon',
      sector: 'E-commerce / Operations',
      minCgpa: 7.0, strongCgpa: 8.0,
      requiredSkills: ['operations', 'supply chain', 'analytics', 'excel', 'strategy'],
      preferredSkills: ['sql', 'process improvement', 'logistics', 'finance'],
      roleKeywords: ['operations', 'supply chain', 'management', 'analyst', 'program manager'],
      weights: { cgpa: 0.28, skills: 0.40, role: 0.20, projects: 0.12 },
      note: 'Operations and supply chain management roles. Data-driven decision-making + structured execution are the core culture.'
    },
    {
      name: 'Aditya Birla Group',
      sector: 'Conglomerate / Diversified',
      minCgpa: 6.5, strongCgpa: 7.5,
      requiredSkills: ['strategy', 'finance', 'operations', 'analytics', 'excel'],
      preferredSkills: ['supply chain', 'marketing', 'business development', 'consulting'],
      roleKeywords: ['management trainee', 'strategy', 'operations', 'business', 'analyst'],
      weights: { cgpa: 0.28, skills: 0.36, role: 0.22, projects: 0.14 },
      note: 'Prestigious MT programme across businesses (fashion, telecom, cement, finance). Strong structured thinking required.'
    },
    {
      name: 'Tata Group',
      sector: 'Conglomerate / Diversified',
      minCgpa: 6.5, strongCgpa: 7.5,
      requiredSkills: ['strategy', 'operations', 'analytics', 'finance', 'excel'],
      preferredSkills: ['supply chain', 'marketing', 'consulting', 'business development'],
      roleKeywords: ['management trainee', 'strategy', 'operations', 'business', 'analyst'],
      weights: { cgpa: 0.28, skills: 0.36, role: 0.22, projects: 0.14 },
      note: 'Tata group companies hire MBAs across consumer, automotive, and services. Leadership and values alignment assessed.'
    },
    {
      name: 'Reckitt',
      sector: 'FMCG / Health & Hygiene',
      minCgpa: 6.5, strongCgpa: 7.5,
      requiredSkills: ['marketing', 'sales', 'analytics', 'excel'],
      preferredSkills: ['brand management', 'consumer insights', 'distribution', 'strategy'],
      roleKeywords: ['sales', 'marketing', 'brand', 'management trainee', 'consumer'],
      weights: { cgpa: 0.28, skills: 0.36, role: 0.22, projects: 0.14 },
      note: 'Health and hygiene FMCG. Brand management and trade marketing roles. International mindset valued.'
    },
    {
      name: 'Emami',
      sector: 'FMCG / Personal Care',
      minCgpa: 6.0, strongCgpa: 7.2,
      requiredSkills: ['sales', 'marketing', 'analytics', 'excel'],
      preferredSkills: ['brand management', 'distribution', 'consumer insights', 'trade marketing'],
      roleKeywords: ['sales', 'marketing', 'brand', 'management trainee', 'distribution'],
      weights: { cgpa: 0.24, skills: 0.36, role: 0.26, projects: 0.14 },
      note: 'Good tier-2 B-school recruiter. Strong rural distribution network. Sales and brand management tracks.'
    },
    {
      name: 'Flipkart',
      sector: 'E-commerce / Operations',
      minCgpa: 6.5, strongCgpa: 7.5,
      requiredSkills: ['operations', 'supply chain', 'analytics', 'excel', 'strategy'],
      preferredSkills: ['sql', 'logistics', 'process improvement', 'business development'],
      roleKeywords: ['operations', 'supply chain', 'analyst', 'business', 'program manager'],
      weights: { cgpa: 0.24, skills: 0.42, role: 0.20, projects: 0.14 },
      note: 'Ops and supply chain management roles. Fast-paced e-commerce environment. Data-driven operations culture.'
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
  const reqHit  = required.filter(s => tokens.some(t => t.includes(s) || s.includes(t)));
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

function buildReasons({ profile, cgpa, cgpa10, cgpaScore, skillScore, roleScore, projectScore, tokens }) {
  const reasons = [];

  // Thresholds displayed in /8 scale (college scale) for clarity
  const min8    = +(profile.minCgpa    * 0.8).toFixed(1);
  const strong8 = +(profile.strongCgpa * 0.8).toFixed(1);

  if (cgpa10 >= profile.strongCgpa)   reasons.push(`CGPA of ${cgpa}/8 is above the strong threshold (${strong8}+/8), boosting your score.`);
  else if (cgpa10 >= profile.minCgpa) reasons.push(`CGPA of ${cgpa}/8 meets the minimum requirement (${min8}+/8) but is below the strong threshold (${strong8}+/8).`);
  else                                 reasons.push(`CGPA of ${cgpa}/8 is below ${profile.name}'s minimum threshold (${min8}+/8), which significantly reduces probability.`);

  const missingRequired = profile.requiredSkills.filter(s => !tokens.some(t => t.includes(s) || s.includes(t)));
  if (missingRequired.length === 0) reasons.push(`All required skills detected: ${profile.requiredSkills.join(', ')}.`);
  else reasons.push(`Missing required skills: ${missingRequired.slice(0, 4).join(', ')}.`);

  if (roleScore >= 75) reasons.push(`Strong role alignment detected in skills / project descriptions.`);
  else reasons.push(`Limited role-specific keywords found — add more ${profile.sector}-relevant project context.`);

  if (profile.note) reasons.push(profile.note);
  return reasons;
}

export function scoreWithProfile({ profile, cgpaNum, cgpa10, tokens }) {
  const cgpaScore    = scoreCgpa(cgpa10, profile.minCgpa, profile.strongCgpa);
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
  const reasons = buildReasons({ profile, cgpa: cgpaNum, cgpa10, cgpaScore, skillScore, roleScore, projectScore, tokens });

  return {
    probability,
    breakdown: { cgpa: cgpaScore, skills: skillScore, roleAlignment: roleScore, projects: projectScore },
    reasons
  };
}

// ── Public API ─────────────────────────────────────────────────────────────
export function estimateShortlistProbabilities({ programme, cgpa, skills, projects, resumeText = '', targetCompanies }) {
  const code     = normalizeProgrammeCode(programme) || 'bda';
  const profiles = COMPANY_PROFILES[code] || COMPANY_PROFILES.bda;
  const tokens   = tokenize(`${skills} ${projects} ${resumeText}`);
  const cgpaNum  = parseFloat(cgpa) || 0;
  // College uses /8 scale; company thresholds are on /10 scale — convert for fair comparison
  const cgpa10   = Math.min(10, (cgpaNum / 8) * 10);

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
        aiEstimated: false,
        caveat: `No curated data for "${companyName}" in the ${code.toUpperCase()} programme. If AI is configured, an AI-based estimate will be generated.`,
        reasons: [],
        breakdown: null
      };
    }

    const scored = scoreWithProfile({ profile, cgpaNum, cgpa10, tokens });

    return {
      company: profile.name,
      sector: profile.sector,
      probability: scored.probability,
      known: true,
      aiEstimated: false,
      breakdown: scored.breakdown,
      reasons: scored.reasons,
      caveat: 'AI-based shortlist probability estimate only, not a guarantee. Based on programme-specific historical patterns.'
    };
  });
}

export { tokenize, COMPANY_PROFILES };
