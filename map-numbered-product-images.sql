begin;

insert into public.dojiye_store_data (key, data)
select 'dojiye_products_backup_before_numbered_image_mapping_20261003', data
from public.dojiye_store_data
where key = 'dojiye_products'
on conflict (key) do nothing;

update public.dojiye_store_data as store
set data = (
  select jsonb_agg(
    case
      when image_file.name is not null then
        jsonb_set(
          product.value,
          '{image}',
          to_jsonb(
            'https://wokfwbjlmeandlfvgtkk.supabase.co/storage/v1/object/public/product-images/'
            || image_file.name
          ),
          true
        )
      else product.value
    end
    order by product.ordinality
  )
  from jsonb_array_elements(store.data) with ordinality as product(value, ordinality)
  left join lateral (
    select storage_object.name
    from storage.objects as storage_object
    where storage_object.bucket_id = 'product-images'
      and storage_object.name = any(array[
        'categories/' || ((regexp_match(product.value ->> 'sku', '(?i)^imp-([0-9]+)$'))[1])::integer::text || '.jpg',
        'categories/' || ((regexp_match(product.value ->> 'sku', '(?i)^imp-([0-9]+)$'))[1])::integer::text || '.jpeg',
        'categories/' || ((regexp_match(product.value ->> 'sku', '(?i)^imp-([0-9]+)$'))[1])::integer::text || '.png',
        'categories/' || ((regexp_match(product.value ->> 'sku', '(?i)^imp-([0-9]+)$'))[1])::integer::text || '.webp',
        'categories/' || ((regexp_match(product.value ->> 'sku', '(?i)^imp-([0-9]+)$'))[1])::integer::text || '.avif'
      ])
    order by array_position(array['jpg', 'jpeg', 'png', 'webp', 'avif'], lower(split_part(storage_object.name, '.', 2)))
    limit 1
  ) as image_file on true
)
where store.key = 'dojiye_products'
  and jsonb_typeof(store.data) = 'array';

commit;

select
  count(*) as total_products,
  count(*) filter (
    where product.value ->> 'image' like
      'https://wokfwbjlmeandlfvgtkk.supabase.co/storage/v1/object/public/product-images/categories/%'
  ) as products_using_numbered_storage_images
from public.dojiye_store_data as store
cross join lateral jsonb_array_elements(store.data) as product(value)
where store.key = 'dojiye_products';
