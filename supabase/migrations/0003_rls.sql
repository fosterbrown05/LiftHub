alter table profiles enable row level security;
alter table guides   enable row level security;
alter table qa_posts enable row level security;
alter table plans    enable row level security;

-- Role lookup without recursion: a policy on profiles that queries
-- profiles re-triggers itself. security definer runs outside RLS.
create function public.my_role() returns user_role
language sql stable security definer set search_path = public as $$
  select role from profiles where id = auth.uid();
$$;

-- profiles ---------------------------------------------------------
create policy profiles_select on profiles for select
  using (auth.uid() is not null);
create policy profiles_update on profiles for update
  using (id = auth.uid()) with check (id = auth.uid());
create policy profiles_delete on profiles for delete
  using (my_role() = 'admin');

-- RLS is per-row, not per-column: take role out of reach entirely,
-- and change it only through an admin-checked function.
revoke update (role) on public.profiles from authenticated;

create function public.set_user_role(target uuid, new_role user_role)
returns void language plpgsql security definer set search_path = public as $$
begin
  if my_role() <> 'admin' then
    raise exception 'admins only';
  end if;
  update profiles set role = new_role where id = target;
end $$;

-- guides -----------------------------------------------------------
create policy guides_select on guides for select
  using (status = 'published' or author_id = auth.uid() or my_role() = 'admin');
create policy guides_insert on guides for insert
  with check (my_role() in ('trainer','admin') and author_id = auth.uid());
create policy guides_update on guides for update
  using (author_id = auth.uid() or my_role() = 'admin');
create policy guides_delete on guides for delete
  using (author_id = auth.uid() or my_role() = 'admin');

-- qa_posts ---------------------------------------------------------
create policy qa_select on qa_posts for select using (
  exists (select 1 from guides g where g.id = guide_id
          and (g.status = 'published' or g.author_id = auth.uid()
               or my_role() = 'admin'))
);
create policy qa_insert on qa_posts for insert with check (
  auth.uid() is not null and
  exists (select 1 from guides g where g.id = guide_id
          and g.status = 'published')
);
create policy qa_delete on qa_posts for delete
  using (author_id = auth.uid() or my_role() = 'admin');
-- no update policy: posts are immutable in v1 (delete and repost)

-- plans ------------------------------------------------------------
create policy plans_select on plans for select
  using (user_id = auth.uid());
-- no insert policy for clients: rows are written only by the server
-- route using the service role, after the rate-limit check
