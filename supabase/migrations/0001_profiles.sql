-- One profile row per auth user: display name and onboarding goals, which auth.users doesn't hold.
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text,
  speed_goal integer,
  daily_minutes integer,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "Users can view own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id);

-- Created via trigger, not a client insert: signup can leave a user without a session (e.g. email confirmation), and an RLS-gated insert would silently fail then. security definer runs regardless.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, name)
  values (new.id, new.raw_user_meta_data ->> 'name');
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
