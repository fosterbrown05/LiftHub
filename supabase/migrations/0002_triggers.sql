-- Create a profile automatically on sign-up
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', ''));
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Stamp author identity and role on Q&A posts server-side,
-- so a client can never fake a trainer badge
create function public.stamp_author_role() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.author_id   := auth.uid();
  new.author_role := (select role from profiles where id = auth.uid());
  return new;
end $$;

create trigger qa_stamp
  before insert on qa_posts
  for each row execute function public.stamp_author_role();

-- Keep guides.updated_at honest
create function public.touch_updated_at() returns trigger
language plpgsql as $$
begin new.updated_at := now(); return new; end $$;

create trigger guides_touch
  before update on guides
  for each row execute function public.touch_updated_at();

-- Enforce the flat Q&A thread at the database level (Checkpoint 2
-- recommendation): an answer's parent must be a root question,
-- and it must live on the same guide as that question.
create function public.check_flat_thread() returns trigger
language plpgsql as $$
declare parent_rec qa_posts;
begin
  if new.parent_id is not null then
    select * into parent_rec from qa_posts where id = new.parent_id;
    if parent_rec.parent_id is not null then
      raise exception 'answers cannot have replies';
    end if;
    if parent_rec.guide_id <> new.guide_id then
      raise exception 'answer must belong to the question''s guide';
    end if;
  end if;
  return new;
end $$;

create trigger qa_flat
  before insert on qa_posts
  for each row execute function public.check_flat_thread();
