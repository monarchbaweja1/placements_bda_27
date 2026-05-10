-- Seed BDA companies for shortlist probability reference data.
-- Additional RLS policies to allow student reads for shortlist estimates (insert).

-- Allow authenticated students to insert their own shortlist estimates
create policy if not exists "users can insert own shortlist estimates"
  on public.shortlist_estimates for insert
  to authenticated
  with check (user_id = auth.uid());

-- Allow authenticated students to insert their own resume analyses
create policy if not exists "users can insert own resume analyses"
  on public.resume_analyses for insert
  to authenticated
  with check (user_id = auth.uid());

-- Allow authenticated students to insert their own chat messages
create policy if not exists "users can insert own chat messages"
  on public.chat_messages for insert
  to authenticated
  with check (
    exists (
      select 1 from public.chat_sessions cs
      where cs.id = chat_messages.session_id
        and cs.user_id = auth.uid()
    )
  );

-- ── BDA companies seed ────────────────────────────────────────────────────────
insert into public.companies (programme_id, name, sector, roles, skills, historical_notes)
select
  p.id,
  c.name,
  c.sector,
  c.roles,
  c.skills,
  c.historical_notes
from public.programmes p
cross join (values
  (
    'Deloitte',
    'Consulting / Analytics',
    array['Data Analyst', 'Business Analyst', 'Analytics Consultant'],
    array['sql', 'python', 'analytics', 'data visualization', 'excel', 'power bi', 'tableau'],
    '{"minCgpa": 6.5, "strongCgpa": 7.5, "note": "Values structured thinking, SQL/Python proficiency, and case-study readiness."}'::jsonb
  ),
  (
    'KPMG',
    'Advisory / Analytics',
    array['Data Analyst', 'Advisory Analyst'],
    array['sql', 'excel', 'analytics', 'data visualization', 'power bi', 'tableau'],
    '{"minCgpa": 6.5, "strongCgpa": 7.5, "note": "Strong emphasis on Excel and data storytelling."}'::jsonb
  ),
  (
    'EY',
    'Advisory / Technology',
    array['Data Analyst', 'Technology Analyst', 'Advisory Consultant'],
    array['sql', 'python', 'analytics', 'excel', 'power bi', 'machine learning'],
    '{"minCgpa": 6.5, "strongCgpa": 7.5, "note": "Technology-heavy advisory roles. Python and SQL are strongly weighted."}'::jsonb
  ),
  (
    'PwC',
    'Advisory / Consulting',
    array['Data Analyst', 'Advisory Analyst'],
    array['excel', 'sql', 'analytics', 'data visualization', 'power bi'],
    '{"minCgpa": 6.5, "strongCgpa": 7.5, "note": "Values business storytelling and structured analysis."}'::jsonb
  ),
  (
    'Accenture',
    'Technology / Analytics',
    array['Data Analyst', 'Technology Analyst', 'Digital Analyst'],
    array['sql', 'python', 'analytics', 'machine learning', 'power bi', 'tableau'],
    '{"minCgpa": 6.0, "strongCgpa": 7.2, "note": "Large intake. Technical skills and project portfolio matter more than CGPA."}'::jsonb
  ),
  (
    'Mu Sigma',
    'Analytics / Decision Science',
    array['Decision Scientist', 'Business Analyst', 'Trainee Decision Scientist'],
    array['sql', 'python', 'statistics', 'analytics', 'r', 'machine learning'],
    '{"minCgpa": 6.0, "strongCgpa": 7.0, "note": "Skews heavily toward technical analytics. Quantitative projects with measurable results stand out."}'::jsonb
  ),
  (
    'Fractal Analytics',
    'AI / Analytics',
    array['Data Scientist', 'Business Analyst', 'Analytics Consultant'],
    array['python', 'machine learning', 'statistics', 'sql', 'deep learning', 'scikit-learn'],
    '{"minCgpa": 6.5, "strongCgpa": 7.5, "note": "Strong ML/AI focus. Practical projects with business impact are highly valued."}'::jsonb
  ),
  (
    'Kantar',
    'Market Research / Analytics',
    array['Research Analyst', 'Analytics Specialist', 'Insights Analyst'],
    array['analytics', 'excel', 'statistics', 'data visualization', 'sql', 'tableau', 'spss'],
    '{"minCgpa": 6.0, "strongCgpa": 7.0, "note": "Market research background and consumer insights framing add significant value."}'::jsonb
  ),
  (
    'JP Morgan',
    'BFSI / Analytics',
    array['Data Analyst', 'Technology Analyst', 'Quantitative Analyst'],
    array['sql', 'python', 'statistics', 'excel', 'data analysis', 'risk analytics'],
    '{"minCgpa": 7.0, "strongCgpa": 8.0, "note": "CGPA is heavily weighted. 7+ is typically a hard filter. Strong SQL and quantitative background expected."}'::jsonb
  ),
  (
    'Amazon',
    'E-commerce / Tech Analytics',
    array['Business Analyst', 'Data Analyst', 'Operations Analyst'],
    array['sql', 'python', 'analytics', 'data visualization', 'excel', 'statistics'],
    '{"minCgpa": 7.0, "strongCgpa": 8.0, "note": "High bar for quantitative skills. Supply chain/product analytics experience valued."}'::jsonb
  ),
  (
    'HDFC Bank',
    'BFSI / Analytics',
    array['Data Analyst', 'Credit Analyst', 'Risk Analyst'],
    array['sql', 'excel', 'analytics', 'data visualization', 'python', 'banking'],
    '{"minCgpa": 6.5, "strongCgpa": 7.5, "note": "Banking/finance domain knowledge is a strong positive signal for BDA profiles."}'::jsonb
  ),
  (
    'Capgemini',
    'IT / Analytics Consulting',
    array['Analyst', 'Consultant', 'Data Analyst'],
    array['sql', 'analytics', 'excel', 'python', 'power bi', 'tableau'],
    '{"minCgpa": 5.5, "strongCgpa": 6.8, "note": "Lower CGPA threshold. Portfolio of projects and communication skills drive outcomes."}'::jsonb
  )
) as c(name, sector, roles, skills, historical_notes)
where p.code = 'bda'
on conflict (programme_id, name) do update
  set sector           = excluded.sector,
      roles            = excluded.roles,
      skills           = excluded.skills,
      historical_notes = excluded.historical_notes,
      updated_at       = now();

-- ── BIFS companies seed ───────────────────────────────────────────────────────
insert into public.companies (programme_id, name, sector, roles, skills, historical_notes)
select
  p.id,
  c.name,
  c.sector,
  c.roles,
  c.skills,
  c.historical_notes
from public.programmes p
cross join (values
  (
    'HDFC Bank',
    'Banking',
    array['Credit Analyst', 'Relationship Manager', 'Risk Analyst'],
    array['financial analysis', 'credit risk', 'excel', 'banking', 'sql'],
    '{"minCgpa": 6.5, "strongCgpa": 7.5, "note": "Credit risk and banking domain knowledge strongly preferred."}'::jsonb
  ),
  (
    'ICICI Bank',
    'Banking',
    array['Credit Analyst', 'Relationship Manager', 'Risk Analyst'],
    array['financial analysis', 'excel', 'banking', 'credit', 'sql'],
    '{"minCgpa": 6.5, "strongCgpa": 7.5, "note": "Similar profile to HDFC Bank. Strong CGPA filter."}'::jsonb
  ),
  (
    'Axis Bank',
    'Banking',
    array['Credit Analyst', 'Relationship Manager'],
    array['financial analysis', 'excel', 'banking', 'credit risk'],
    '{"minCgpa": 6.0, "strongCgpa": 7.2, "note": "Slightly lower CGPA threshold than HDFC/ICICI."}'::jsonb
  ),
  (
    'Deloitte',
    'Advisory / BFSI',
    array['Risk Analyst', 'Advisory Analyst', 'Financial Consultant'],
    array['financial analysis', 'excel', 'analytics', 'risk', 'audit'],
    '{"minCgpa": 6.5, "strongCgpa": 7.5, "note": "BFSI advisory exposure and CFA/FRM certifications are differentiators."}'::jsonb
  )
) as c(name, sector, roles, skills, historical_notes)
where p.code = 'bifs'
on conflict (programme_id, name) do update
  set sector           = excluded.sector,
      roles            = excluded.roles,
      skills           = excluded.skills,
      historical_notes = excluded.historical_notes,
      updated_at       = now();

-- ── HCM companies seed ────────────────────────────────────────────────────────
insert into public.companies (programme_id, name, sector, roles, skills, historical_notes)
select
  p.id,
  c.name,
  c.sector,
  c.roles,
  c.skills,
  c.historical_notes
from public.programmes p
cross join (values
  (
    'Abbott',
    'Medical Devices / Pharma',
    array['Territory Manager', 'Sales Analyst', 'Market Access Analyst'],
    array['healthcare', 'sales', 'market access', 'analytics', 'excel'],
    '{"minCgpa": 6.0, "strongCgpa": 7.2, "note": "Healthcare domain knowledge and sales aptitude are paramount."}'::jsonb
  ),
  (
    'Cipla',
    'Pharma',
    array['Territory Manager', 'Sales Officer', 'Marketing Analyst'],
    array['pharma', 'sales', 'healthcare', 'analytics', 'excel', 'market access'],
    '{"minCgpa": 6.0, "strongCgpa": 7.2, "note": "Pharma sales background and healthcare domain exposure are key."}'::jsonb
  ),
  (
    'Apollo Hospitals',
    'Hospital Operations',
    array['Operations Analyst', 'Healthcare Consultant', 'Business Development'],
    array['healthcare', 'hospital operations', 'analytics', 'excel', 'power bi'],
    '{"minCgpa": 6.0, "strongCgpa": 7.0, "note": "Hospital operations and healthcare analytics experience is highly valued."}'::jsonb
  )
) as c(name, sector, roles, skills, historical_notes)
where p.code = 'hcm'
on conflict (programme_id, name) do update
  set sector           = excluded.sector,
      roles            = excluded.roles,
      skills           = excluded.skills,
      historical_notes = excluded.historical_notes,
      updated_at       = now();
