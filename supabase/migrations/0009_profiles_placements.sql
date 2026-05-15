create table profiles (
  id uuid references auth.users(id) primary key,
  name text, roll_no text, email text,
  internship text, resume_link text,
  target_roles text[], target_companies text[],
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create table placements (
  id uuid references auth.users(id) primary key,
  status text default 'searching',
  offer_company text, offer_role text,
  ctc numeric, joining_date date,
  interviews jsonb default '[]',
  updated_at timestamptz default now()
);
alter table profiles enable row level security;
alter table placements enable row level security;
create policy "Users manage own profile" on profiles for all using (auth.uid() = id);
create policy "Users manage own placement" on placements for all using (auth.uid() = id);
create policy "Anyone can read profiles" on profiles for select using (true);
create policy "Anyone can read placements" on placements for select using (true);
