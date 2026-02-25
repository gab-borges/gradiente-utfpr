-- Run this in Supabase SQL Editor.
-- Stores all parsed disciplines for each course in a single JSONB row.

create table if not exists public.course_disciplines (
  course_id text primary key,
  course_label text not null,
  disciplines jsonb not null default '[]'::jsonb,
  disciplines_count integer not null default 0 check (disciplines_count >= 0),
  turmas_count integer not null default 0 check (turmas_count >= 0),
  source text not null default 'utfpr',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint course_disciplines_disciplines_array
    check (jsonb_typeof(disciplines) = 'array')
);

create index if not exists course_disciplines_updated_at_idx
  on public.course_disciplines (updated_at desc);

alter table public.course_disciplines enable row level security;

grant select on table public.course_disciplines to anon, authenticated;
grant insert, update, delete on table public.course_disciplines to service_role;

drop policy if exists "Public can read course disciplines" on public.course_disciplines;
create policy "Public can read course disciplines"
  on public.course_disciplines
  for select
  to anon, authenticated
  using (true);

drop policy if exists "Service role can write course disciplines" on public.course_disciplines;
create policy "Service role can write course disciplines"
  on public.course_disciplines
  for all
  to service_role
  using (true)
  with check (true);
