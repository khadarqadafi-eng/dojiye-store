# Admin subdomain setup

The admin subdomain is served through a Cloudflare Worker that fetches the
existing GitHub Pages site. Keep the repository's `CNAME` set to
`dojiyestore.com`.

## 1. Add the Cloudflare DNS record

In the `dojiyestore.com` Cloudflare zone, add:

- Type: `CNAME`
- Name: `dhabar`
- Target: `dojiyestore.com`
- Proxy status: Proxied (orange cloud)

## 2. Require Cloudflare Access

In Cloudflare Zero Trust, go to **Access → Applications → Add an application
→ Self-hosted**. Set the hostname to `dhabar.dojiyestore.com` and protect the
whole hostname (leave the path empty). Add an **Allow** policy for the email
`khadarqadafi@gmail.com`. Do not add a public/bypass policy.

## 3. Deploy the admin proxy Worker

Create a Cloudflare Worker, paste the contents of
[`cloudflare-admin-proxy.mjs`](./cloudflare-admin-proxy.mjs), and deploy it.
Then add a Worker route for `dhabar.dojiyestore.com/*` in the
`dojiyestore.com` zone and select that Worker.

The Worker serves the existing site through the subdomain and adds the admin
mode to its home page. It does not change the public store at
`https://dojiyestore.com`.

## 4. Verify

Open `https://dhabar.dojiyestore.com` in a private/incognito window:

- Cloudflare Access should require sign-in before the admin page loads.
- The allowed email should reach the existing Supabase admin sign-in.
- The public store should remain available at `https://dojiyestore.com`.

If Access or the Worker route is not configured, the admin subdomain is not
ready for use. The Worker code being present in GitHub does not configure
Cloudflare DNS, Access, or deployment by itself.
