create extension if not exists pgcrypto;
create extension if not exists vector;

create table if not exists public.programmes (
  id uuid primary key default gen_random_uuid(),
  code text unique not null check (code in ('bda', 'core', 'hcm', 'bifs')),
  name text not null,
  created_at timestamptz not null default now()
);

insert into public.programmes (code, name)
values
  ('bda', 'PGDM - Big Data Analytics'),
  ('core', 'PGDM - Core'),
  ('hcm', 'PGDM - Healthcare Management'),
  ('bifs', 'PGDM - Banking, Insurance and Financial Services')
on conflict (code) do update set name = excluded.name;

create table if not exists public.user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  programme_id uuid references public.programmes(id),
  email text,
  role text not null default 'student' check (role in ('student', 'admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  programme_id uuid not null references public.programmes(id),
  title text not null,
  type text not null check (type in (
    'placement_report',
    'resume',
    'interview_experience',
    'company_document',
    'roadmap',
    'prep_material',
    'shortlist_data',
    'role_data'
  )),
  source_url text,
  storage_path text,
  visibility text not null default 'programme' check (visibility in ('private', 'programme', 'admin')),
  uploaded_by uuid references auth.users(id),
  status text not null default 'pending' check (status in ('pending', 'processing', 'ready', 'failed')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.document_chunks (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  programme_id uuid not null references public.programmes(id),
  chunk_index integer not null,
  content text not null,
  metadata jsonb not null default '{}'::jsonb,
  embedding vector(1536),
  created_at timestamptz not null default now(),
  unique (document_id, chunk_index)
);

create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  programme_id uuid not null references public.programmes(id),
  name text not null,
  sector text,
  roles text[] not null default '{}',
  skills text[] not null default '{}',
  historical_notes jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (programme_id, name)
);

create table if not exists public.chat_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  programme_id uuid not null references public.programmes(id),
  title text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.chat_sessions(id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'system')),
  content text not null,
  citations jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.resume_analyses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  programme_id uuid not null references public.programmes(id),
  resume_document_id uuid references public.documents(id),
  parsed_profile jsonb not null default '{}'::jsonb,
  scores jsonb not null default '{}'::jsonb,
  recommendations jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.shortlist_estimates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  programme_id uuid not null references public.programmes(id),
  company_id uuid references public.companies(id),
  input_profile jsonb not null default '{}'::jsonb,
  probability numeric check (probability >= 0 and probability <= 100),
  reasons jsonb not null default '[]'::jsonb,
  caveats text not null default 'AI-based shortlist probability estimate, not a guarantee.',
  created_at timestamptz not null default now()
);

create index if not exists documents_programme_type_idx
  on public.documents (programme_id, type, status);

create index if not exists document_chunks_programme_idx
  on public.document_chunks (programme_id);

create index if not exists document_chunks_embedding_idx
  on public.document_chunks
  using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

create index if not exists companies_programme_idx
  on public.companies (programme_id);

create index if not exists chat_sessions_user_idx
  on public.chat_sessions (user_id, programme_id);

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_profiles up
    where up.id = auth.uid()
      and up.role = 'admin'
  );
$$;

create or replace function public.match_document_chunks(
  query_embedding vector(1536),
  match_count integer default 8,
  programme_code_filter text default null,
  document_type_filter text default null
)
returns table (
  id uuid,
  document_id uuid,
  programme_code text,
  document_title text,
  document_type text,
  content text,
  metadata jsonb,
  similarity double precision
)
language sql
stable
as $$
  select
    dc.id,
    dc.document_id,
    p.code as programme_code,
    d.title as document_title,
    d.type as document_type,
    dc.content,
    dc.metadata,
    1 - (dc.embedding <=> query_embedding) as similarity
  from public.document_chunks dc
  join public.documents d on d.id = dc.document_id
  join public.programmes p on p.id = dc.programme_id
  where dc.embedding is not null
    and d.status = 'ready'
    and (programme_code_filter is null or p.code = programme_code_filter)
    and (document_type_filter is null or d.type = document_type_filter)
  order by dc.embedding <=> query_embedding
  limit least(match_count, 20);
$$;

alter table public.programmes enable row level security;
alter table public.user_profiles enable row level security;
alter table public.documents enable row level security;
alter table public.document_chunks enable row level security;
alter table public.companies enable row level security;
alter table public.chat_sessions enable row level security;
alter table public.chat_messages enable row level security;
alter table public.resume_analyses enable row level security;
alter table public.shortlist_estimates enable row level security;

create policy "programmes are readable by authenticated users"
  on public.programmes for select
  to authenticated
  using (true);

create policy "users can read own profile"
  on public.user_profiles for select
  to authenticated
  using (id = auth.uid());

create policy "users can update own profile basics"
  on public.user_profiles for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

create policy "admins can read all profiles"
  on public.user_profiles for select
  to authenticated
  using (public.is_admin());

create policy "admins can manage documents"
  on public.documents for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "students can read ready programme documents"
  on public.documents for select
  to authenticated
  using (
    status = 'ready'
    and programme_id = (
      select up.programme_id
      from public.user_profiles up
      where up.id = auth.uid()
    )
  );

create policy "admins can manage document chunks"
  on public.document_chunks for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "students can read ready programme chunks"
  on public.document_chunks for select
  to authenticated
  using (
    programme_id = (
      select up.programme_id
      from public.user_profiles up
      where up.id = auth.uid()
    )
    and exists (
      select 1
      from public.documents d
      where d.id = document_chunks.document_id
        and d.status = 'ready'
    )
  );

create policy "admins can manage companies"
  on public.companies for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "students can read programme companies"
  on public.companies for select
  to authenticated
  using (
    programme_id = (
      select up.programme_id
      from public.user_profiles up
      where up.id = auth.uid()
    )
  );

create policy "users can read own chat sessions"
  on public.chat_sessions for select
  to authenticated
  using (user_id = auth.uid());

create policy "users can insert own chat sessions"
  on public.chat_sessions for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "users can read own chat messages"
  on public.chat_messages for select
  to authenticated
  using (
    exists (
      select 1
      from public.chat_sessions cs
      where cs.id = chat_messages.session_id
        and cs.user_id = auth.uid()
    )
  );

create policy "users can read own resume analyses"
  on public.resume_analyses for select
  to authenticated
  using (user_id = auth.uid());

create policy "users can read own shortlist estimates"
  on public.shortlist_estimates for select
  to authenticated
  using (user_id = auth.uid());

create policy "admins can read resume analyses"
  on public.resume_analyses for select
  to authenticated
  using (public.is_admin());

create policy "admins can read shortlist estimates"
  on public.shortlist_estimates for select
  to authenticated
  using (public.is_admin());
