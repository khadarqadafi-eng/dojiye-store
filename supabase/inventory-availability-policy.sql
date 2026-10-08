alter table public.dojiye_store_data enable row level security;

grant select on table public.dojiye_store_data to anon, authenticated;

do $policy$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'dojiye_store_data'
      and policyname = 'dojiye_public_inventory_availability_read'
  ) then
    create policy dojiye_public_inventory_availability_read
    on public.dojiye_store_data
    for select
    to anon, authenticated
    using (key = 'dojiye_inventory_availability');
  end if;
end
$policy$;
