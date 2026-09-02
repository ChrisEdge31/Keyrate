-- One row per completed passage, used for the profile page's stats and recent-sessions list.
create table public.results (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  mode text not null check (mode in ('learn', 'practice')),
  wpm integer not null,
  accuracy numeric not null,
  created_at timestamptz not null default now()
);

alter table public.results enable row level security;

create policy "Users can view own results"
  on public.results for select
  using (auth.uid() = user_id);

create policy "Users can insert own results"
  on public.results for insert
  with check (auth.uid() = user_id);

create index results_user_id_created_at_idx on public.results (user_id, created_at desc);
