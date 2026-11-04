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
-- Attachments remain under the entry's existing owner-only policies.
create or replace function public.daily_work_valid_attachments(files jsonb)
returns boolean language plpgsql immutable set search_path = '' as $$
declare f jsonb; content bytea;
begin
  if jsonb_typeof(files) <> 'array' then return false; end if;
  if jsonb_array_length(files) > 3 then return false; end if;
  for f in select value from jsonb_array_elements(files) loop
    if jsonb_typeof(f) <> 'object' or jsonb_typeof(f->'name') is distinct from 'string'
      or char_length(f->>'name') not between 1 and 255
      or jsonb_typeof(f->'data') is distinct from 'string'
      or jsonb_typeof(f->'size') is distinct from 'number' then return false; end if;
    content := decode(f->>'data', 'base64');
    if octet_length(content) > 1048576 or (f->>'size')::numeric <> octet_length(content) then return false; end if;
  end loop;
  return true;
exception when others then return false;
end;
$$;
alter table public.entries add column if not exists attachments jsonb not null default '[]'::jsonb;
alter table public.entries drop constraint if exists entries_attachments_valid;
alter table public.entries add constraint entries_attachments_valid check (public.daily_work_valid_attachments(attachments));
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
