insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'dojiye-product-images',
  'dojiye-product-images',
  true,
  2097152,
  array['image/webp']::text[]
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists dojiye_product_images_public_read on storage.objects;

do $product_image_policies$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'dojiye_product_images_admin_insert'
  ) then
    create policy dojiye_product_images_admin_insert
    on storage.objects
    for insert
    to authenticated
    with check (
      bucket_id = 'dojiye-product-images'
      and lower(coalesce(auth.jwt() ->> 'email', '')) in (
        'khadarqadafi@gmail.com',
        'admin@dojiye.com'
      )
    );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'dojiye_product_images_admin_update'
  ) then
    create policy dojiye_product_images_admin_update
    on storage.objects
    for update
    to authenticated
    using (
      bucket_id = 'dojiye-product-images'
      and lower(coalesce(auth.jwt() ->> 'email', '')) in (
        'khadarqadafi@gmail.com',
        'admin@dojiye.com'
      )
    )
    with check (
      bucket_id = 'dojiye-product-images'
      and lower(coalesce(auth.jwt() ->> 'email', '')) in (
        'khadarqadafi@gmail.com',
        'admin@dojiye.com'
      )
    );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'dojiye_product_images_admin_delete'
  ) then
    create policy dojiye_product_images_admin_delete
    on storage.objects
    for delete
    to authenticated
    using (
      bucket_id = 'dojiye-product-images'
      and lower(coalesce(auth.jwt() ->> 'email', '')) in (
        'khadarqadafi@gmail.com',
        'admin@dojiye.com'
      )
    );
  end if;
end
$product_image_policies$;
