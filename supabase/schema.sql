-- Run this entire file in the SQL Editor of your Supabase project.
-- This setup is additive and can be run again without deleting entries.
begin;
create table if not exists public.entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  date date not null,
  title text not null check (char_length(btrim(title)) between 1 and 160),
  notes text not null default '' check (char_length(notes) <= 50000),
  category text not null default 'Work' check (category in ('Work','Learning','Meeting','Personal')),
  hours double precision not null default 0 check (hours >= 0 and hours <= 24),
  updated timestamptz not null default now()
);
create index if not exists entries_user_date_idx on public.entries(user_id, date desc);
alter table public.entries enable row level security;
revoke all on public.entries from anon;
revoke all on public.entries from authenticated;
grant select, insert, update, delete on public.entries to authenticated;
drop policy if exists entries_select_own on public.entries;
create policy entries_select_own on public.entries for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists entries_insert_own on public.entries;
create policy entries_insert_own on public.entries for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists entries_update_own on public.entries;
create policy entries_update_own on public.entries for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists entries_delete_own on public.entries;
create policy entries_delete_own on public.entries for delete to authenticated using ((select auth.uid()) = user_id);
create or replace function public.daily_work_set_updated() returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated = now();
  return new;
end;
$$;
drop trigger if exists daily_work_updated on public.entries;
create trigger daily_work_updated before update on public.entries for each row execute function public.daily_work_set_updated();
commit;
