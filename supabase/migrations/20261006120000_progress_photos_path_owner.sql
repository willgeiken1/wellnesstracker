-- A progress photo path has to be the owner's folder plus one file name.
-- Safe to run more than once. Does not update or delete any rows.
-- Adding the check fails if a row is outside that shape, instead of rewriting it.

alter table public.progress_photos
  drop constraint if exists progress_photos_path_owner;

alter table public.progress_photos
  add constraint progress_photos_path_owner
  check (path ~ ('^' || user_id::text || '/[^/]+$'));

drop policy if exists "own photos: insert" on public.progress_photos;
create policy "own photos: insert" on public.progress_photos
  for insert
  with check (
    auth.uid() = user_id
    and path ~ ('^' || user_id::text || '/[^/]+$')
  );

drop policy if exists "own photos: update" on public.progress_photos;
create policy "own photos: update" on public.progress_photos
  for update
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and path ~ ('^' || user_id::text || '/[^/]+$')
  );
