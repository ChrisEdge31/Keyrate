-- One profile row per auth user, holding the app-specific data that
-- auth.users doesn't: display name and onboarding goals.
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

-- Profiles are created via this trigger, not a client-side insert: signup
-- can leave a user without an active session (e.g. "confirm email" is on
-- by default for new Supabase projects), and an RLS-gated insert from the
-- client would silently fail in that window. security definer lets this
-- run regardless of session state, reading the name out of the signup
-- metadata the client passes in options.data.
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
