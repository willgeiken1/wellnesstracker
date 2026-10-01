-- Progress photos: a private storage bucket plus one row per photo. Each person can only see their own.
-- Safe to run more than once.
create table if not exists public.progress_photos (
  id       text primary key,
  user_id  uuid not null references auth.users(id) on delete cascade,
  day      date not null,
  pose     text,
  path     text not null,
  taken_at timestamptz not null default now()
);
alter table public.progress_photos enable row level security;
drop policy if exists "own photos: read"   on public.progress_photos;
drop policy if exists "own photos: insert" on public.progress_photos;
drop policy if exists "own photos: update" on public.progress_photos;
drop policy if exists "own photos: delete" on public.progress_photos;
create policy "own photos: read"   on public.progress_photos for select using (auth.uid() = user_id);
create policy "own photos: insert" on public.progress_photos for insert with check (auth.uid() = user_id);
create policy "own photos: update" on public.progress_photos for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own photos: delete" on public.progress_photos for delete using (auth.uid() = user_id);
grant select, insert, update, delete on public.progress_photos to authenticated;
grant all on public.progress_photos to service_role;

-- Private bucket; files live under a folder named after the account id.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('progress', 'progress', false, 5242880, array['image/jpeg'])
on conflict (id) do nothing;
drop policy if exists "progress: read own"   on storage.objects;
drop policy if exists "progress: upload own" on storage.objects;
drop policy if exists "progress: update own" on storage.objects;
drop policy if exists "progress: delete own" on storage.objects;
create policy "progress: read own"   on storage.objects for select to authenticated using (bucket_id = 'progress' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "progress: upload own" on storage.objects for insert to authenticated with check (bucket_id = 'progress' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "progress: update own" on storage.objects for update to authenticated using (bucket_id = 'progress' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "progress: delete own" on storage.objects for delete to authenticated using (bucket_id = 'progress' and (storage.foldername(name))[1] = auth.uid()::text);
