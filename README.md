# Sellify

A Shopify-style admin for **all of your websites** in one place. Switch between sites from the top bar; each one gets:

| Area | What you can do | Powered by (free tier) |
| --- | --- | --- |
| **Home** | Revenue, orders, AOV, sessions, to-do alerts (unfulfilled orders, low stock) | Appwrite, GA4 |
| **Orders / Products / Customers** | Full CRUD, draft orders, fulfil / refund, CSV export | Appwrite Database |
| **Analytics** | Sessions, users, sources, top pages; Google clicks, impressions, CTR, position, top queries | Google Analytics 4, Google Search Console |
| **SEO** | Site crawler (broken links, redirects, titles, metas, H1s, canonicals, noindex, alt text, thin/slow pages), Lighthouse scores, sitemap submit | Python crawler, PageSpeed Insights, Search Console |
| **Domain & DNS** | Nameserver status with Namecheap instructions, DNS record editor, cache purge, one-click "point to Netlify" | Cloudflare |
| **Deploys** | Deploy history, trigger / clear-cache deploys, SSL status | Netlify |

```
 Browser (React + Vite + Tailwind, hosted on Netlify)
   │  Appwrite Web SDK (login session)
   ├──► Appwrite Database ── sites · products · orders · customers
   ├──► Appwrite Function "site-ops" (Python) ── Cloudflare · Netlify · Search Console · GA4 · crawler
   └──► PageSpeed Insights API (called directly, it's public)
```

API tokens only live on the Python function, never in the browser. The function only answers signed-in members of the `admins` team.

## Try it now (demo mode)

```bash
npm install
npm run dev
```

With no `VITE_APPWRITE_PROJECT_ID` set, the app runs on sample data for two stores, saved in your browser. Reset it under **Sites & settings**.

## Going live

### 1. Appwrite (database + login)
1. Create a project at [cloud.appwrite.io](https://cloud.appwrite.io). Under **Overview → Integrations → Platforms** add a **Web** platform for `localhost` and your dashboard's domain (e.g. `admin.yourdomain.com` or `*.netlify.app`).
2. Create an API key (**Overview → Integrations → API keys**) with the `databases`, `tables`, `teams` and `users` scopes, then run:
   ```bash
   pip install -r appwrite/requirements.txt
   APPWRITE_ENDPOINT=https://<region>.cloud.appwrite.io/v1 APPWRITE_PROJECT_ID=... APPWRITE_API_KEY=... \
   ADMIN_EMAIL=you@example.com ADMIN_PASSWORD='a-strong-password' python appwrite/setup.py
   ```
   This creates the tables and your login, and is safe to re-run. Then turn off public sign-ups under **Auth → Security** if you like (logins are created by you anyway).
3. Copy `.env.example` to `.env` and fill in the endpoint and project ID.

### 2. The Python function (`appwrite/functions/site-ops`)
Deploy it with the Appwrite CLI (`npm i -g appwrite-cli`, `appwrite login`, set `projectId` in `appwrite.json`, then `appwrite push functions`), or connect this repo in the console (**Functions → Create → Git**, runtime Python 3.12, root `appwrite/functions/site-ops`, entrypoint `src/main.py`, build command `pip install -r requirements.txt`, execute access `team:admins`, scope `teams.read`).

Set these function environment variables:

| Variable | Where to get it |
| --- | --- |
| `ADMIN_TEAM_ID` | `admins` (created by setup.py) |
| `CLOUDFLARE_API_TOKEN` | Cloudflare → My Profile → API Tokens → custom token with **Zone:Read, DNS:Edit, Cache Purge:Purge** for all zones (add **Zone:Edit** if you want "Add to Cloudflare") |
| `CLOUDFLARE_ACCOUNT_ID` | Only needed for "Add to Cloudflare"; shown on your Cloudflare dashboard sidebar |
| `NETLIFY_AUTH_TOKEN` | Netlify → User settings → Applications → Personal access tokens |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | See below. Paste the whole JSON key file. |

**Google (free):** in [Google Cloud console](https://console.cloud.google.com) create a project, enable the **Google Search Console API** and **Google Analytics Data API**, create a service account and download a JSON key. Then add the service account's email (shown in **Sites & settings → Integration status**) as a user in each **Search Console property** (Full) and each **GA4 property** (Viewer).

### 3. Each Namecheap domain → Cloudflare → Netlify
1. In Sellify, **Sites & settings → Add site**, type the domain and click **Add to Cloudflare** (or add it in Cloudflare yourself and click **Find by domain**).
2. In Namecheap: **Domain List → Manage → Nameservers → Custom DNS**, and enter the two Cloudflare nameservers Sellify shows. Activation usually takes under an hour.
3. Pick the Netlify site, save, then on **Domain & DNS** click **Point to Netlify**. It creates DNS-only CNAMEs for the root and `www` and registers the domain on Netlify so it can issue the SSL certificate.

### 4. Host the dashboard on Netlify
Import this repo into Netlify (build settings come from `netlify.toml`) and add the `VITE_*` variables from `.env.example` under **Site configuration → Environment variables**. Remember to add the Netlify URL as a Web platform in Appwrite.

## Selling on your sites
Products are publicly readable, so a storefront can list them with the Appwrite Web SDK:

```js
const { rows } = await new TablesDB(client).listRows({ databaseId: "sellify", tableId: "products",
  queries: [Query.equal("siteId", "<site id>"), Query.equal("status", "active")] });
```

Orders and customers are admin-only. For checkout, use a payment provider (Stripe, PayPal, etc.) and write the order to Appwrite from its webhook. That webhook isn't built yet.

## Project layout
```
src/                       React dashboard
  lib/data.ts              data layer (Appwrite or demo) + calls to the Python function
  lib/demo.ts              sample data and mocked integration responses
  pages/                   one file per screen
appwrite/setup.py          creates the database schema, team and admin user
appwrite/functions/site-ops/src/
  main.py                  router, auth check, Cloudflare + Netlify
  google_apis.py           Search Console + GA4
  crawler.py               SEO crawler
```
