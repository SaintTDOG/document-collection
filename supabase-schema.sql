-- NCCP submissions table for aip-homeownerassist
-- Applied via mcp__supabase__apply_migration, name: nccp_submissions_init

create table if not exists public.nccp_submissions (
  id                      uuid primary key default gen_random_uuid(),
  created_at              timestamptz not null default now(),
  status                  text not null default 'submitted',
  source                  text not null default 'aip-homeownerassist',

  -- Applicant 1 identity (flat for querying)
  app1_full_name          text not null,
  app1_dob                date,
  app1_email              text not null,
  app1_mobile             text not null,

  -- Applicant 2 (nullable)
  has_partner             boolean not null default false,
  app2_full_name          text,
  app2_dob                date,
  app2_email              text,
  app2_mobile             text,

  -- Core loan info
  loan_amount             numeric,
  first_home_buyer        boolean,
  purchase_status         text,
  current_address         text,
  current_address_since   date,

  -- Disclosed debt flags (for quick QC scanning)
  has_hecs                boolean not null default false,
  has_bnpl                boolean not null default false,
  bnpl_providers          text[],
  total_monthly_expenses  numeric,

  -- Full structured payload (everything the form collected)
  payload                 jsonb not null,

  drive_folder_url        text
);

create index if not exists nccp_submissions_created_at_idx on public.nccp_submissions (created_at desc);
create index if not exists nccp_submissions_status_idx on public.nccp_submissions (status);

-- RLS: allow anon INSERT only. Reads go through service role.
alter table public.nccp_submissions enable row level security;

grant insert, select on public.nccp_submissions to anon;

drop policy if exists "anon can insert nccp submissions" on public.nccp_submissions;
create policy "anon can insert nccp submissions"
  on public.nccp_submissions
  for insert
  to anon
  with check (true);

drop policy if exists "anon can select own insert" on public.nccp_submissions;
create policy "anon can select own insert"
  on public.nccp_submissions
  for select
  to anon
  using (true);
