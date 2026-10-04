# Inventory sync setup

The website includes an admin-triggered, read-only inventory sync for Odoo and POS systems with a compatible REST inventory endpoint. Credentials stay in Supabase Edge Function secrets; the browser never receives them.

## Deploy the function

From the project folder, link the Supabase CLI to the DOJIYE project and deploy:

```powershell
supabase login
supabase link --project-ref wokfwbjlmeandlfvgtkk
supabase functions deploy inventory-sync
```

In the Supabase SQL Editor, apply the updated [`supabase-rls.sql`](../supabase-rls.sql) so only the catalog, settings, and sanitized inventory snapshot are public; integration and fulfillment metadata remain admin-only. That script replaces the policies on `dojiye_store_data`, so review any custom policies before running it. If you maintain custom policies, add the equivalent narrow policy from [`inventory-availability-policy.sql`](./inventory-availability-policy.sql) instead and verify that no broader public-read policy exposes private keys.

To keep product source-store and order fulfillment details private, run the updated [`supabase-place-order.sql`](../supabase-place-order.sql) in the Supabase SQL Editor after backing up your current database. It recreates the order RPC so it snapshots each product's private source branch into `dojiye_order_fulfillment`; this information is not added to the customer's order response.

When adding or editing a product, enter its **Fulfillment store / branch (admin only)**, for example `Halal Super Market`. This value is stored separately from the public product catalog. The admin order details view shows the branch snapshot for orders placed after the updated RPC has been installed. Older orders do not have historical branch snapshots.

## Configure Odoo

1. In the website admin, open **System Integrations → Add system**, choose **Odoo**, enter the public HTTPS Odoo URL, database name, and branch/warehouse label, then save.
2. Note the secret name shown for the assigned slot, for example `DOJIYE_SYSTEM_1_CREDENTIALS`.
3. In Supabase Dashboard → **Edge Functions → Secrets**, set that secret to a JSON object:

```json
{"username":"ODOO_LOGIN","apiKey":"ODOO_API_KEY"}
```

Use a dedicated Odoo account with read-only access to products and inventory. Odoo must allow its `/web/session/authenticate` and `/web/dataset/call_kw` JSON-RPC endpoints. The connector reads product `default_code` (SKU) and sums internal available quantities (`quantity - reserved_quantity`).

## Configure a POS / other REST system

The system must expose a public HTTPS `GET` inventory endpoint that returns JSON, and its API must allow requests from Supabase Edge Functions. In the admin form, enter:

- Base system URL and relative inventory API path.
- JSON path to the list (for example `items` or `data.items`).
- SKU, available quantity, and optional warehouse field names.
- Whether the secret is sent as `Authorization: Bearer` or `X-API-Key`.

Set the corresponding slot secret in Supabase Dashboard → **Edge Functions → Secrets**:

```json
{"apiKey":"POS_READ_ONLY_API_KEY"}
```

Example response for a POS configured with the default field mappings:

```json
{
  "items": [
    {"sku":"NES-001","quantity":12,"warehouse":"Main branch"},
    {"sku":"NES-001","quantity":0,"warehouse":"Branch 2"}
  ]
}
```

The JSON response must explicitly include zero-quantity products if the POS API supports doing so. Only SKUs already in the DOJIYE catalog are shown; unmatched SKUs are ignored.

## Run a sync

Sign in to the website as an allowed admin, open **System Integrations**, and select **Sync inventory now**. The function records per-system success/error status and the latest SKU/location availability. Customers can see the last synchronized counts on matching product cards.

Sync is manual in this deployment. Online orders do not reserve or decrement stock in Odoo/POS, so confirm availability with the branch before promising fulfillment. Do not place a Supabase service-role key or external-system credential in website files or browser storage. For fully automatic scheduled sync or online stock reservation, configure a schedule and transaction behavior separately before enabling them.
