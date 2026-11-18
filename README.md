# Sellify

A Shopify-style admin for **all of your websites** in one place. Switch between sites from the top bar; each one gets:

| Section | Pages | Powered by (free tier) |
| --- | --- | --- |
| **Home** | KPIs, setup checklist, to-dos | Appwrite, GA4 |
| **Orders** | All orders, Drafts, Abandoned checkouts (one-click recovery email) | Appwrite, Resend |
| **Products** | All products, Collections, Inventory (bulk stock) | Appwrite |
| **Customers** | All customers (marketing opt-in), Segments (rule builder) | Appwrite |
| **Marketing** | Campaigns (send to a segment), Email designer (drag-and-drop) | [GrapesJS](https://github.com/GrapesJS/grapesjs) (BSD), Resend |
| **Discounts** | Percent/fixed codes with minimums, limits, dates, applied at checkout | Stripe coupons, PayPal |
| **Content** | Files (images for products and emails) | Appwrite Storage |
| **Analytics / SEO** | GA4, Search Console, crawler, PageSpeed, sitemaps | Google, Python crawler |
| **Sales channels** | Online store (embed snippet) | sellify.js |
| **Infrastructure** | Domain & DNS, Deploys | Cloudflare, Netlify |
| **Checkout** | Cards, Apple Pay, Google Pay, PayPal | Stripe Checkout, PayPal |

### Roadmap (shown in-app as "soon")

Each planned page already describes its free approach. In brief:

| Planned | Free approach |
| --- | --- |
| Shipping labels | Shippo / EasyPost APIs: pay per label, no monthly fee |
| Gift cards, Purchase orders, Transfers, Companies, Menus | Custom tables in Appwrite, no third-party cost |
| Automations | Appwrite scheduled functions (cron) reusing the recovery and campaign senders |
| Attribution | UTM tags + GA4 source/medium joined with orders |
| Blog & pages | [Decap CMS](https://decapcms.org) (open source, Git-based, made for Netlify) |
| Finance | Stripe Balance/Payouts + PayPal Reporting APIs (read-only) |
| Google & YouTube, TikTok | Free Merchant Center listings from a product feed served by the checkout function |
| Point of sale | Stripe Terminal / Tap to Pay (per transaction) |

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

## Taking payments: Stripe, Apple Pay, Google Pay, PayPal

```
 Storefront (sellify.js)                     checkout function (Python, public)            Stripe / PayPal
   cart ──► /stripe/session or /paypal/create ──► reprices the cart from Appwrite ──► hosted payment page
   ◄────────────────── redirect back to your success page ◄──────────────────────────────┘
   Stripe: webhook ──► /stripe/webhook (signature checked) ──┐
   PayPal: success page ──► /paypal/capture ─────────────────┴──► order + customer created, stock reduced
```

- **Stripe Checkout** covers cards, **Apple Pay** and **Google Pay** on one hosted page. Turn the wallets on in Stripe → Settings → Payment methods. Because the page is on Stripe's domain, there's no Apple Pay domain verification to do.
- **PayPal** uses the Orders v2 API with redirect-and-capture.
- Prices, stock, currency and the redirect domain are always checked on the server. Each order's ID is the checkout's ID, so a repeated webhook, capture or page reload can never create a second order.
- **Refunds:** the Refund button on an order sends the refund through Stripe or PayPal.

### Set up
1. **Run `python appwrite/setup.py` again.** It adds the `checkouts` table and the payment columns on orders.
2. **Deploy the `checkout` function** (`appwrite push functions`, or connect it in the console: root `appwrite/functions/checkout`, entrypoint `src/main.py`, execute access **Any**, scopes `rows.read` and `rows.write`). Set:

   | Variable | Where to get it |
   | --- | --- |
   | `UNSUBSCRIBE_SECRET` | Any long random string (same value on `site-ops`) |
   | `STRIPE_SECRET_KEY` | Stripe → Developers → API keys (start with `sk_test_…`) |
   | `STRIPE_WEBHOOK_SECRET` | Stripe → Developers → Webhooks → Add endpoint `https://<checkout function domain>/stripe/webhook`, events `checkout.session.completed`, `checkout.session.async_payment_succeeded` and `checkout.session.expired`. Copy the `whsec_…` value. |
   | `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET` | [developer.paypal.com](https://developer.paypal.com) → Apps & Credentials |
   | `PAYPAL_ENV` | `sandbox` while testing, `live` when you launch |
   | `SHIP_TO_COUNTRIES` | Optional, e.g. `US,CA`. Asks buyers for a shipping address. |
   | `ALLOWED_RETURN_HOSTS` | Optional extra hostnames allowed as success or cancel URLs |

   The function's domain is shown under the function's **Domains** tab in Appwrite.
3. **Enable refunds from the dashboard:** set `STRIPE_SECRET_KEY`, `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET` and `PAYPAL_ENV` on the `site-ops` function too.
4. **On each storefront:** add the site's domain as a Web platform in Appwrite, then paste the snippet from **Sites & settings → Sell on your site**. `examples/storefront.html` is a complete starter page with a product grid, cart, and Stripe and PayPal buttons.

```js
await Sellify.products();                 // active products for this site
Sellify.cart.add(productId);              // cart lives in localStorage; listen for "sellify:cart"
await Sellify.checkout("stripe");         // or "paypal", which redirects to pay
const order = await Sellify.handleReturn(); // on your success page: confirms PayPal and clears the cart
```

**Test before launching:** use Stripe test mode (card `4242 4242 4242 4242`) and a PayPal sandbox buyer account. Then switch to live keys and `PAYPAL_ENV=live`.

## Email (receipts, order alerts, shipping notices)

Email is a setup step for each site (**Sites & settings → Email**, also linked from the checklist on Home). **Nothing is sent until it's finished:**

1. **Your email:** where new-order alerts go and where customers' replies land. It's pre-filled from your login, but you must confirm it.
2. **Verify your domain:** Sellify registers the store's domain with [Resend](https://resend.com) (free: 3,000 emails/month, 100/day) and adds the DKIM/SPF records to Cloudflare for you. These go on `resend._domainkey` and `send.` subdomains, so your existing mailbox records (MX at the root) aren't touched.
3. **Test and choose:** send yourself a test, then toggle receipts, new-order alerts and shipping emails.

Setup: create a Resend account, make an API key with **Full access** (it needs to add domains), and set `RESEND_API_KEY` on **both** the `site-ops` and `checkout` functions. Then re-run `python appwrite/setup.py` to add the email columns.

`emails.py` exists in both function folders because each Appwrite function deploys on its own. Keep the two copies identical.

## Marketing email, discounts, files

- **Who gets marketing email:** only customers with **Subscribed** ticked, either opted in at checkout (`acceptsMarketing`) or set by you on the Customers page. Every campaign must include an `{{unsubscribe_url}}` link. Each recipient gets a signed one-click unsubscribe link plus a `List-Unsubscribe` header.
- **Function settings:**
  - Set `UNSUBSCRIBE_SECRET` (any long random string) on **both** functions.
  - Set `CHECKOUT_PUBLIC_URL` (the checkout function's domain) on `site-ops`.
  - Resend's free plan sends **100 emails a day**; the campaign screen warns you above that.
- **Discounts:** checked server-side at checkout. Stripe receives a one-off coupon for the exact amount, and PayPal gets a discount breakdown. Storefronts can preview codes with `Sellify.discount(code)`.
- **Files:** `setup.py` creates a public-read `files` bucket. Uploads appear in the email designer's image picker.
- **Cart recovery:** abandoned carts come from expired Stripe sessions (enable the `checkout.session.expired` webhook event) and from unpaid carts older than an hour. The reminder email links back with `?sellify_cart=…`, and `sellify.js` restores the cart from it.

Re-run `python appwrite/setup.py` after pulling: it adds the new tables (collections, discounts, segments, templates, campaigns), the new columns and the bucket.

## Project layout
```
src/                       React dashboard
  lib/nav.ts               sidebar sections, sub-pages and the "planned" roadmap
  lib/segments.ts          segment rules engine
  lib/data.ts              data layer (Appwrite or demo) + calls to the Python function
  lib/demo.ts              sample data and mocked integration responses
  pages/                   one file per screen
public/sellify.js          storefront cart + checkout script (served by the dashboard)
examples/storefront.html   starter storefront page
appwrite/setup.py          creates the database schema, team and admin user
appwrite/functions/checkout/src/
  main.py                  public checkout routes + Stripe webhook
  payments.py              Stripe Checkout and PayPal Orders v2
  store.py                 cart pricing, idempotent order creation
appwrite/functions/site-ops/src/
  main.py                  router, auth check, Cloudflare + Netlify
  google_apis.py           Search Console + GA4
  crawler.py               SEO crawler
```
