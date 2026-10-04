alter table public.dojiye_store_data enable row level security;

do $policy_cleanup$
declare
  existing_policy record;
begin
  for existing_policy in
    select policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = 'dojiye_store_data'
  loop
    execute format(
      'drop policy if exists %I on public.dojiye_store_data',
      existing_policy.policyname
    );
  end loop;
end
$policy_cleanup$;

grant select on table public.dojiye_store_data to anon;
grant select, insert, update on table public.dojiye_store_data to authenticated;

create policy dojiye_public_storefront_read
on public.dojiye_store_data
for select
to anon, authenticated
using (key in (
  'dojiye_products',
  'dojiye_categories',
  'dojiye_settings',
  'dojiye_inventory_availability'
));

create policy dojiye_admin_manage_store_data
on public.dojiye_store_data
for all
to authenticated
using (
  (auth.jwt() ->> 'email') in ('khadarqadafi@gmail.com', 'admin@dojiye.com')
)
with check (
  (auth.jwt() ->> 'email') in ('khadarqadafi@gmail.com', 'admin@dojiye.com')
);
