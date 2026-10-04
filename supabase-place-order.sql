create or replace function public.place_dojiye_order(order_data jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  products_data jsonb;
  product_fulfillment_data jsonb;
  orders_data jsonb;
  order_fulfillment_data jsonb;
  settings_data jsonb;
  line_item jsonb;
  product_data jsonb;
  product_index integer;
  quantity integer;
  remaining_stock integer;
  unit_price numeric;
  discount_rate numeric;
  subtotal numeric := 0;
  total_discount numeric := 0;
  delivery_fee numeric := 0;
  tax_rate numeric := 0;
  tax_amount numeric := 0;
  order_total numeric := 0;
  payment_method text;
  safe_products jsonb := '[]'::jsonb;
  safe_fulfillment_products jsonb := '[]'::jsonb;
  order_record jsonb;
  source_store text;
begin
  if order_data is null or jsonb_typeof(order_data) <> 'object' then
    raise exception 'Order details are invalid.';
  end if;

  if coalesce(length(order_data ->> 'customer'), 0) not between 2 and 120
     or coalesce(length(order_data ->> 'phone'), 0) not between 5 and 40
     or coalesce(length(order_data ->> 'city'), 0) not between 2 and 100
     or coalesce(length(order_data ->> 'address'), 0) not between 3 and 300 then
    raise exception 'Name, phone, city, and delivery address are required.';
  end if;

  if coalesce(length(order_data ->> 'area'), 0) > 120
     or coalesce(length(order_data ->> 'notes'), 0) > 500 then
    raise exception 'Delivery details are too long.';
  end if;

  if coalesce(order_data ->> 'id', '') !~ '^#[A-F0-9-]{8,40}$' then
    raise exception 'Order reference is invalid.';
  end if;

  payment_method := order_data ->> 'payment';
  if payment_method is null
     or payment_method not in (
       'Cash on Delivery',
       'E-Birr',
       'CBE Bank Transfer',
       'Zaad',
       'M-Pesa'
     ) then
    raise exception 'Selected payment method is not available.';
  end if;

  if coalesce(jsonb_typeof(order_data -> 'products'), '') <> 'array'
     or jsonb_array_length(order_data -> 'products') = 0
     or jsonb_array_length(order_data -> 'products') > 30 then
    raise exception 'The order must contain between 1 and 30 product lines.';
  end if;

  select data into products_data
  from public.dojiye_store_data
  where key = 'dojiye_products'
  for update;

  if products_data is null or jsonb_typeof(products_data) <> 'array' then
    raise exception 'The product catalog is unavailable.';
  end if;

  insert into public.dojiye_store_data (key, data)
  values ('dojiye_product_fulfillment', '{}'::jsonb)
  on conflict (key) do nothing;

  select data into product_fulfillment_data
  from public.dojiye_store_data
  where key = 'dojiye_product_fulfillment'
  for share;

  if jsonb_typeof(product_fulfillment_data) <> 'object' then
    raise exception 'The private product fulfillment data is invalid.';
  end if;

  insert into public.dojiye_store_data (key, data)
  values ('dojiye_orders', '[]'::jsonb)
  on conflict (key) do nothing;

  select data into orders_data
  from public.dojiye_store_data
  where key = 'dojiye_orders'
  for update;

  if not found then
    raise exception 'The orders record is not initialized.';
  end if;

  if jsonb_typeof(orders_data) <> 'array' then
    raise exception 'The orders record is invalid.';
  end if;

  insert into public.dojiye_store_data (key, data)
  values ('dojiye_order_fulfillment', '[]'::jsonb)
  on conflict (key) do nothing;

  select data into order_fulfillment_data
  from public.dojiye_store_data
  where key = 'dojiye_order_fulfillment'
  for update;

  if jsonb_typeof(order_fulfillment_data) <> 'array' then
    raise exception 'The private order fulfillment data is invalid.';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(orders_data) as existing_order(value)
    where existing_order.value ->> 'id' = order_data ->> 'id'
  ) then
    select existing_order.value into order_record
    from jsonb_array_elements(orders_data) as existing_order(value)
    where existing_order.value ->> 'id' = order_data ->> 'id'
    limit 1;
    return order_record;
  end if;

  select coalesce(data, '{}'::jsonb) into settings_data
  from public.dojiye_store_data
  where key = 'dojiye_settings';

  delivery_fee := greatest(coalesce((settings_data ->> 'deliveryFee')::numeric, 0), 0);
  tax_rate := greatest(coalesce((settings_data ->> 'taxRate')::numeric, 0), 0);

  for line_item in
    select value from jsonb_array_elements(order_data -> 'products')
  loop
    if coalesce(line_item ->> 'id', '') = ''
       or coalesce(line_item ->> 'qty', '') !~ '^[0-9]{1,3}$' then
      raise exception 'A product line is invalid.';
    end if;

    quantity := (line_item ->> 'qty')::integer;
    if quantity < 1 or quantity > 50 then
      raise exception 'Product quantity must be between 1 and 50.';
    end if;

    select (catalog.ordinality - 1)::integer, catalog.value
      into product_index, product_data
    from jsonb_array_elements(products_data) with ordinality as catalog(value, ordinality)
    where catalog.value ->> 'id' = line_item ->> 'id'
    limit 1;

    if not found then
      raise exception 'A selected product is no longer available.';
    end if;

    if coalesce(product_data ->> 'status', '') = 'Hidden' then
      raise exception 'A selected product is currently unavailable.';
    end if;

    if coalesce(product_data ->> 'stock', '') !~ '^[0-9]+$' then
      raise exception 'Product stock information is invalid.';
    end if;

    remaining_stock := (product_data ->> 'stock')::integer;
    if remaining_stock < quantity then
      raise exception 'Not enough stock for product: %', product_data ->> 'name';
    end if;

    if coalesce(product_data ->> 'price', '') !~ '^[0-9]+([.][0-9]+)?$' then
      raise exception 'Product price information is invalid.';
    end if;

    unit_price := (product_data ->> 'price')::numeric;
    discount_rate := greatest(least(coalesce((product_data ->> 'discount')::numeric, 0), 100), 0);
    source_store := coalesce(
      nullif(btrim(product_fulfillment_data -> (product_data ->> 'id') ->> 'sourceStore'), ''),
      'Not assigned'
    );
    subtotal := subtotal + unit_price * quantity;
    total_discount := total_discount + unit_price * quantity * discount_rate / 100;
    remaining_stock := remaining_stock - quantity;

    products_data := jsonb_set(
      products_data,
      array[product_index::text, 'stock'],
      to_jsonb(remaining_stock),
      false
    );

    if remaining_stock = 0 then
      products_data := jsonb_set(
        products_data,
        array[product_index::text, 'status'],
        to_jsonb('Hidden'::text),
        false
      );
    end if;

    safe_products := safe_products || jsonb_build_array(jsonb_build_object(
      'id', product_data ->> 'id',
      'name', product_data ->> 'name',
      'qty', quantity,
      'price', unit_price,
      'discount', discount_rate
    ));
    safe_fulfillment_products := safe_fulfillment_products || jsonb_build_array(jsonb_build_object(
      'productId', product_data ->> 'id',
      'name', product_data ->> 'name',
      'qty', quantity,
      'sourceStore', source_store
    ));
  end loop;

  tax_amount := subtotal * tax_rate / 100;
  order_total := greatest(subtotal + delivery_fee + tax_amount - total_discount, 0);

  order_record := jsonb_build_object(
    'id', order_data ->> 'id',
    'customer', order_data ->> 'customer',
    'phone', order_data ->> 'phone',
    'city', order_data ->> 'city',
    'area', coalesce(order_data ->> 'area', ''),
    'address', order_data ->> 'address',
    'notes', coalesce(order_data ->> 'notes', ''),
    'payment', payment_method,
    'paymentStatus', 'Pending manual confirmation',
    'amount', order_total,
    'status', 'Pending',
    'date', to_char(current_date, 'Mon DD, YYYY'),
    'createdAt', to_jsonb(current_timestamp),
    'items', jsonb_array_length(safe_products),
    'subtotal', subtotal,
    'delivery', delivery_fee,
    'tax', tax_amount,
    'discount', total_discount,
    'products', safe_products
  );

  update public.dojiye_store_data
  set data = products_data
  where key = 'dojiye_products';

  update public.dojiye_store_data
  set data = orders_data || jsonb_build_array(order_record)
  where key = 'dojiye_orders';

  update public.dojiye_store_data
  set data = order_fulfillment_data || jsonb_build_array(jsonb_build_object(
    'orderId', order_data ->> 'id',
    'products', safe_fulfillment_products,
    'createdAt', current_timestamp
  ))
  where key = 'dojiye_order_fulfillment';

  return order_record;
end;
$function$;

revoke all on function public.place_dojiye_order(jsonb) from public;
revoke all on function public.place_dojiye_order(jsonb) from anon;
revoke all on function public.place_dojiye_order(jsonb) from authenticated;
grant execute on function public.place_dojiye_order(jsonb) to anon, authenticated;

create or replace function public.get_dojiye_order_status(order_id text, customer_phone text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  order_record jsonb;
begin
  if coalesce(length(order_id), 0) not between 9 and 41
     or coalesce(length(customer_phone), 0) not between 5 and 40 then
    return null;
  end if;

  select order_row.value into order_record
  from public.dojiye_store_data as store
  cross join lateral jsonb_array_elements(store.data) as order_row(value)
  where store.key = 'dojiye_orders'
    and order_row.value ->> 'id' = order_id
    and regexp_replace(coalesce(order_row.value ->> 'phone', ''), '[^0-9]', '', 'g')
      = regexp_replace(customer_phone, '[^0-9]', '', 'g')
  limit 1;

  if order_record is null then
    return null;
  end if;

  return jsonb_build_object(
    'id', order_record ->> 'id',
    'payment', order_record ->> 'payment',
    'paymentStatus', coalesce(order_record ->> 'paymentStatus', 'Pending manual confirmation'),
    'status', order_record ->> 'status'
  );
end;
$function$;

revoke all on function public.get_dojiye_order_status(text, text) from public;
revoke all on function public.get_dojiye_order_status(text, text) from anon;
revoke all on function public.get_dojiye_order_status(text, text) from authenticated;
grant execute on function public.get_dojiye_order_status(text, text) to anon, authenticated;

notify pgrst, 'reload schema';
