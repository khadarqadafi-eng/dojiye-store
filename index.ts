import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info, x-supabase-api-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const DATA_TABLE = "dojiye_store_data";
const INTEGRATIONS_KEY = "dojiye_integrations";
const PRODUCTS_KEY = "dojiye_products";
const AVAILABILITY_KEY = "dojiye_inventory_availability";
const ADMIN_EMAILS = new Set(["khadarqadafi@gmail.com", "admin@dojiye.com"]);
const MAX_RESPONSE_BYTES = 5_000_000;
const REQUEST_TIMEOUT_MS = 20_000;

type Integration = {
  id: string;
  slot: number;
  provider: "odoo" | "pos" | "other";
  name: string;
  baseUrl: string;
  location?: string;
  account?: string;
  apiPath?: string;
  itemsPath?: string;
  skuField?: string;
  quantityField?: string;
  warehouseField?: string;
  authType?: "bearer" | "api_key";
  syncStatus?: string;
  lastSyncAt?: string | null;
  syncError?: string;
};

type InventorySource = {
  integrationId: string;
  name: string;
  location: string;
  quantity: number;
  lastSyncedAt: string;
  stale: boolean;
};

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function assertPublicHttpsUrl(value: string): URL {
  const url = new URL(value);
  const hostname = url.hostname.toLowerCase();
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    !hostname.includes(".") ||
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal") ||
    /^[\d.]+$/.test(hostname) ||
    hostname.startsWith("[")
  ) {
    throw new Error("System URL must be a public HTTPS hostname.");
  }
  return url;
}

async function fetchJson(url: URL, init: RequestInit = {}): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const result = await fetch(url, {
      ...init,
      signal: controller.signal,
      redirect: "error",
    });
    const declaredLength = Number(result.headers.get("content-length") || 0);
    if (declaredLength > MAX_RESPONSE_BYTES) {
      throw new Error("External system response is too large.");
    }
    const text = await result.text();
    if (new TextEncoder().encode(text).byteLength > MAX_RESPONSE_BYTES) {
      throw new Error("External system response is too large.");
    }
    if (!result.ok) {
      throw new Error(`External system returned HTTP ${result.status}.`);
    }
    try {
      return JSON.parse(text);
    } catch {
      throw new Error("External system returned invalid JSON.");
    }
  } finally {
    clearTimeout(timeout);
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function getByPath(value: unknown, path: string): unknown {
  if (!path) return value;
  return path.split(".").reduce<unknown>((current, part) => {
    if (Array.isArray(current) && /^\d+$/.test(part)) return current[Number(part)];
    return asRecord(current)[part];
  }, value);
}

function normalizeRows(rows: unknown, integration: Integration, syncedAt: string): Record<string, InventorySource[]> {
  if (!Array.isArray(rows)) throw new Error("Configured items path did not return a list.");
  const skuField = integration.skuField || "sku";
  const quantityField = integration.quantityField || "quantity";
  const warehouseField = integration.warehouseField || "";
  const totals = new Map<string, { location: string; quantity: number }>();

  for (const row of rows) {
    const sku = String(getByPath(row, skuField) ?? "").trim().toUpperCase();
    const rawQuantity = getByPath(row, quantityField);
    const quantity = Number(rawQuantity);
    if (!sku || rawQuantity === null || rawQuantity === undefined || rawQuantity === "" || !Number.isFinite(quantity)) {
      throw new Error("An inventory row is missing its configured SKU or quantity field.");
    }
    const location = String(
      (warehouseField && getByPath(row, warehouseField)) || integration.location || integration.name,
    ).trim();
    const key = `${sku}\u0000${location}`;
    const current = totals.get(key) || { location, quantity: 0 };
    current.quantity += Math.max(0, quantity);
    totals.set(key, current);
  }

  const inventory: Record<string, InventorySource[]> = {};
  for (const [key, entry] of totals) {
    const sku = key.split("\u0000", 1)[0];
    (inventory[sku] ||= []).push({
      integrationId: integration.id,
      name: integration.name,
      location: entry.location,
      quantity: Math.round(entry.quantity * 1000) / 1000,
      lastSyncedAt: syncedAt,
      stale: false,
    });
  }
  return inventory;
}

async function readRestInventory(integration: Integration, credentials: Record<string, unknown>, syncedAt: string) {
  const baseUrl = assertPublicHttpsUrl(integration.baseUrl);
  const apiPath = integration.apiPath || "/api/inventory";
  if (!apiPath.startsWith("/") || apiPath.startsWith("//")) {
    throw new Error("Inventory API path must be a relative path starting with one slash.");
  }
  const endpoint = new URL(apiPath, baseUrl);
  if (endpoint.origin !== baseUrl.origin) throw new Error("Inventory API path must stay on the configured system host.");

  const apiKey = String(credentials.apiKey || "");
  if (!apiKey) throw new Error("Missing API key secret.");
  const headers = new Headers({ Accept: "application/json" });
  if (integration.authType === "api_key") headers.set("X-API-Key", apiKey);
  else headers.set("Authorization", `Bearer ${apiKey}`);

  const payload = await fetchJson(endpoint, { headers });
  const rows = getByPath(payload, integration.itemsPath || "items");
  return normalizeRows(rows, integration, syncedAt);
}

async function odooCall(baseUrl: URL, cookie: string, model: string, method: string, args: unknown[], kwargs: Record<string, unknown>) {
  const endpoint = new URL("/web/dataset/call_kw", baseUrl);
  const payload = await fetchJson(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "call",
      params: { model, method, args, kwargs },
      id: crypto.randomUUID(),
    }),
  });
  const result = asRecord(payload);
  if (result.error) throw new Error("Odoo inventory request was rejected.");
  return result.result;
}

async function readOdooInventory(integration: Integration, credentials: Record<string, unknown>, syncedAt: string) {
  const baseUrl = assertPublicHttpsUrl(integration.baseUrl);
  const database = String(integration.account || "");
  const login = String(credentials.username || "");
  const password = String(credentials.apiKey || credentials.password || "");
  if (!database || !login || !password) {
    throw new Error("Odoo secret must include username and apiKey (or password); account name must be the database.");
  }

  const authUrl = new URL("/web/session/authenticate", baseUrl);
  const authResponse = await fetch(authUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "call",
      params: { db: database, login, password },
      id: crypto.randomUUID(),
    }),
    redirect: "error",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!authResponse.ok) throw new Error("Odoo authentication failed.");
  const authPayload = asRecord(await authResponse.json());
  const authResult = asRecord(authPayload.result);
  if (!authResult.uid) throw new Error("Odoo authentication failed; check database/login credentials.");
  const cookieHeader = authResponse.headers.get("set-cookie") || "";
  const sessionCookie = cookieHeader.match(/(?:^|,\s*)(session_id=[^;,\s]+)/i)?.[1];
  if (!sessionCookie) throw new Error("Odoo did not return a session cookie.");

  const products = await odooCall(
    baseUrl,
    sessionCookie,
    "product.product",
    "search_read",
    [[]],
    { fields: ["id", "default_code"], limit: 10000 },
  );
  if (!Array.isArray(products)) throw new Error("Odoo product list was invalid.");
  const skuByProductId = new Map<number, string>();
  for (const value of products) {
    const product = asRecord(value);
    const id = Number(product.id);
    const sku = String(product.default_code || "").trim().toUpperCase();
    if (Number.isFinite(id) && sku) skuByProductId.set(id, sku);
  }

  const quants = await odooCall(
    baseUrl,
    sessionCookie,
    "stock.quant",
    "search_read",
    [[["location_id.usage", "=", "internal"]]],
    { fields: ["product_id", "location_id", "quantity", "reserved_quantity"], limit: 10000 },
  );
  if (!Array.isArray(quants)) throw new Error("Odoo stock list was invalid.");
  const rows = quants.map(value => {
    const quant = asRecord(value);
    const productRef = Array.isArray(quant.product_id) ? quant.product_id : [];
    const locationRef = Array.isArray(quant.location_id) ? quant.location_id : [];
    return {
      sku: skuByProductId.get(Number(productRef[0])) || "",
      warehouse: String(locationRef[1] || integration.location || "Internal"),
      quantity: Math.max(0, Number(quant.quantity || 0) - Number(quant.reserved_quantity || 0)),
    };
  }).filter(row => row.sku);
  const quantSkus = new Set(rows.map(row => row.sku));
  for (const sku of new Set(skuByProductId.values())) {
    if (!quantSkus.has(sku)) {
      rows.push({ sku, warehouse: integration.location || integration.name, quantity: 0 });
    }
  }

  return normalizeRows(rows, {
    ...integration,
    skuField: "sku",
    quantityField: "quantity",
    warehouseField: "warehouse",
  }, syncedAt);
}

Deno.serve(async request => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return response({ error: "Method not allowed." }, 405);

  const authorization = request.headers.get("Authorization") || "";
  const token = authorization.replace(/^Bearer\s+/i, "");
  if (!token) return response({ error: "Authentication required." }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !anonKey) return response({ error: "Function environment is not configured." }, 500);

  const supabase = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: authError } = await supabase.auth.getUser(token);
  if (authError || !userData.user || !ADMIN_EMAILS.has((userData.user.email || "").toLowerCase())) {
    return response({ error: "Admin access required." }, 403);
  }

  const { data: rows, error: readError } = await supabase
    .from(DATA_TABLE)
    .select("key,data")
    .in("key", [INTEGRATIONS_KEY, PRODUCTS_KEY, AVAILABILITY_KEY]);
  if (readError) return response({ error: "Could not read integration settings from Supabase." }, 500);

  const dataByKey = new Map((rows || []).map(row => [row.key, row.data]));
  const integrations = (dataByKey.get(INTEGRATIONS_KEY) || []) as Integration[];
  const products = dataByKey.get(PRODUCTS_KEY) || [];
  if (!Array.isArray(integrations) || integrations.length === 0) {
    return response({ error: "Register at least one integration before syncing." }, 400);
  }
  if (integrations.length > 5) return response({ error: "At most five inventory integrations are supported." }, 400);
  if (!Array.isArray(products)) return response({ error: "Website product data is invalid." }, 500);

  const knownSkus = new Set(products.map((product: Record<string, unknown>) =>
    String(product.sku || "").trim().toUpperCase()
  ).filter(Boolean));
  const oldAvailability = (dataByKey.get(AVAILABILITY_KEY) || {}) as Record<string, InventorySource[]>;
  const availability: Record<string, InventorySource[]> = {};
  for (const [sku, sources] of Object.entries(oldAvailability)) {
    availability[sku] = Array.isArray(sources) ? sources.filter(source =>
      integrations.some(integration => integration.id === source.integrationId)
    ) : [];
    if (!availability[sku].length) delete availability[sku];
  }

  const syncedAt = new Date().toISOString();
  const updatedIntegrations: Integration[] = [];
  for (const integration of integrations) {
    try {
      if (!Number.isInteger(integration.slot) || integration.slot < 1 || integration.slot > 5) {
        throw new Error("System slot is invalid; edit and save this integration again.");
      }
      const secretName = `DOJIYE_SYSTEM_${integration.slot}_CREDENTIALS`;
      const secretValue = Deno.env.get(secretName);
      if (!secretValue) throw new Error(`Missing Supabase Edge Function secret ${secretName}.`);
      let credentials: Record<string, unknown>;
      try {
        credentials = JSON.parse(secretValue);
      } catch {
        throw new Error(`Supabase secret ${secretName} must contain valid JSON.`);
      }
      const sourceInventory = integration.provider === "odoo"
        ? await readOdooInventory(integration, credentials, syncedAt)
        : await readRestInventory(integration, credentials, syncedAt);
      for (const sku of Object.keys(availability)) {
        availability[sku] = availability[sku].filter(source => source.integrationId !== integration.id);
        if (!availability[sku].length) delete availability[sku];
      }
      for (const [sku, sources] of Object.entries(sourceInventory)) {
        if (!knownSkus.has(sku)) continue;
        (availability[sku] ||= []).push(...sources);
      }
      updatedIntegrations.push({
        ...integration,
        syncStatus: "connected",
        lastSyncAt: syncedAt,
        syncError: "",
      });
    } catch (error) {
      const safeMessage = error instanceof Error ? error.message.slice(0, 240) : "Unknown inventory sync error.";
      for (const sources of Object.values(availability)) {
        for (const source of sources) {
          if (source.integrationId === integration.id) source.stale = true;
        }
      }
      updatedIntegrations.push({
        ...integration,
        syncStatus: "error",
        syncError: safeMessage,
      });
      console.error(`Inventory sync failed for integration slot ${integration.slot}:`, safeMessage);
    }
  }

  for (const sources of Object.values(availability)) {
    sources.sort((a, b) => a.name.localeCompare(b.name) || a.location.localeCompare(b.location));
  }

  const { error: saveError } = await supabase.from(DATA_TABLE).upsert([
    { key: INTEGRATIONS_KEY, data: updatedIntegrations },
    { key: AVAILABILITY_KEY, data: availability },
  ], { onConflict: "key" });
  if (saveError) {
    console.error("Inventory snapshot could not be saved:", saveError.message);
    return response({ error: "Inventory data could not be saved to Supabase." }, 500);
  }

  return response({ integrations: updatedIntegrations, availability, syncedAt });
});
