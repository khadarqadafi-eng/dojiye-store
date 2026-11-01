# Product image storage

Product images are uploaded to the public `dojiye-product-images` Supabase Storage bucket. The product keeps the public image URL in its `image` field, so the image stays paired with the product and is available on every device. The browser only uploads optimized WebP images; it does not need a service-role key.

## Set up the bucket

1. Open the DOJIYE project in Supabase Dashboard and go to **SQL Editor**.
2. Open `product-images-storage.sql` from this folder, copy its contents into the SQL Editor, and run it once. It creates/configures only the product-image bucket and its Storage policies; it does not drop or replace policies on `dojiye_store_data`.
3. In the website Admin, sign in with an allowed admin account and add or edit a product. The image is resized to at most 320 pixels and 8 KB, uploaded to Storage under a path containing the product ID, and then its public URL is saved with that product.

The bucket allows public image reads for the storefront. Upload, update, and delete operations are restricted to the allowed authenticated admin emails. The bucket accepts WebP images up to 2 MB; the website optimizer targets a much smaller size.

## Migrate existing product images

After running the SQL, open **Admin → Products**. If older product images are still embedded in the product records, use **U wareeji Supabase Storage**. The migration uploads images in batches of 20 and updates each product's image URL only after its Storage upload succeeds. It preserves product IDs and all product details. If a batch fails, the previous image data and product records remain in place; already completed batches stay migrated and can be continued by running the action again.

Do not delete the old image URL or data before the replacement URL has been saved successfully with its product. Keep normal database backups as usual.
