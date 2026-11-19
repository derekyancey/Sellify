# Yancey

A Shopify-style admin for **all of your websites** in one place. Switch between sites from the top bar; each one gets:

| Section | Pages | Powered by (free tier) |
| --- | --- | --- |
| **Home** | KPIs, setup checklist, to-dos | Appwrite, GA4 |
| **Orders** | All orders, Drafts, Abandoned checkouts (one-click recovery email) | Appwrite, Resend |
| **Products** | All products with **variants** (up to 3 options like Size / Color, price, stock, SKU and image per variant), Collections, Inventory (bulk stock per variant) | Appwrite |
| **Customers** | All customers (marketing opt-in), Segments (rule builder) | Appwrite |
| **Marketing** | Campaigns (send to a segment), Email designer (drag-and-drop), Automations (cart reminder, welcome, win-back) | [GrapesJS](https://github.com/GrapesJS/grapesjs) (BSD), Resend, Appwrite scheduled function |
| **Discounts** | Percent/fixed codes with minimums, limits, dates, applied at checkout | Stripe coupons, PayPal |
| **Content** | Files (images for products and emails) | Appwrite Storage |
| **Analytics / SEO** | GA4, Search Console, crawler, PageSpeed, sitemaps | Google, Python crawler |
| **Finance** | Per-store sales, refunds, discounts, net and payment-method split, monthly chart, CSV for your accountant; Stripe/PayPal balances, fees and payouts | Yancey orders, Stripe + PayPal reporting APIs (read-only) |
| **Online store** | Themes library and a Shopify-style **theme editor**: sections and blocks, theme settings, pages, menus, live preview, one-click publish | Built in (see below), Appwrite Sites |
| **Sales channels** | Google & YouTube and TikTok (product feed), or embed the cart on your own site | yancey.js, Merchant Center free listings |
| **Infrastructure** | Domain & DNS, Deploys | Cloudflare, Appwrite Sites |
| **Checkout** | Cards, Apple Pay, Google Pay, PayPal | Stripe Checkout, PayPal |

### Roadmap (shown in-app as "soon")

Each planned page already describes its free approach. In brief:

| Planned | Free approach |
| --- | --- |
| Shipping labels | Shippo / EasyPost APIs: pay per label, no monthly fee |
| Gift cards, Purchase orders, Transfers, Companies | Custom tables in Appwrite, no third-party cost |
| Attribution | UTM tags + GA4 source/medium joined with orders |
| Blog | Posts table + blog/article templates in the theme editor |
| Point of sale | Stripe Terminal / Tap to Pay (per transaction) |

```
 Browser (React + Vite + Tailwind, hosted on Appwrite Sites)
   │  Appwrite Web SDK (login session)
   ├──► Appwrite Database ── sites · products · orders · customers
   ├──► Appwrite Function "site-ops" (Python) ── Cloudflare · Appwrite Sites · Search Console · GA4 · crawler
   └──► PageSpeed Insights API (called directly, it's public)
```

API tokens only live on the Python function, never in the browser. The function only answers signed-in members of the `admins` team.

## Try it now (demo mode)

```bash
npm install
npm run dev
```

With no `VITE_APPWRITE_PROJECT_ID` set, the app runs on sample data for two stores, saved in your browser. Reset it under **Store settings**.

## Your setup: Yancey at realniggafoods.com

**realniggafoods.com hosts Yancey itself**, the way shopify.com hosts Shopify. You sign in there and see all of your websites as **stores**. Each store has its own **Store settings**, where you add or change its URL; a store can be created before it has one.

Everything runs on **Appwrite** (database, login, files, functions and hosting) plus **Cloudflare** (DNS). The domain is already on Cloudflare, so there's no Namecheap step:

1. **Host the dashboard on Appwrite Sites:** run `appwrite push sites` (the `yancey` site in `appwrite.json`: Vite, static, `npm run build`, output `dist`, fallback `index.html`). Or in the console use *Sites → Create site → Connect Git repository → this repo* with the same settings, which redeploys on every push. Add the `VITE_*` variables from `.env.example` under the site's *Settings → Environment variables*.
2. **Add the domain:** *Sites → yancey → Domains → Add domain* → `realniggafoods.com` (and `www.realniggafoods.com`). Appwrite shows the DNS record to create.
3. **Cloudflare → realniggafoods.com → DNS:** create the records Appwrite shows. Use a `CNAME` at the root, which Cloudflare flattens. Set them to **DNS only** (grey cloud) so Appwrite can issue the HTTPS certificate. Leave the MX, SPF, DMARC and Google verification records alone.
4. **Appwrite → Overview → Platforms:** add Web platforms for `realniggafoods.com`, `www.realniggafoods.com` and `localhost`.
5. Open https://realniggafoods.com, sign in, then **Add store** for each website and give each its URL under **Store settings**.

**Stores hosted on Appwrite Sites, too:** copy the CNAME target Appwrite shows into `APPWRITE_SITES_CNAME_TARGET` on the `site-ops` function. After that, each store's **Domain & DNS → Point to Appwrite Sites** adds the store's domain and `www` to its Appwrite site and creates the DNS-only CNAMEs in Cloudflare in one click.

Store emails (receipts, campaigns) are sent from each store's own domain, never from realniggafoods.com.

### Live configuration (as set up)

| Piece | Value |
| --- | --- |
| Appwrite project | `6afd3365001c9a7ecfc6` at `https://nyc.cloud.appwrite.io/v1` (free plan) |
| Dashboard | Appwrite site `6afd3429003b9012de47`, deploys from `main`, serving `realniggafoods.com` and `www.realniggafoods.com` |
| Functions | `site-ops` (admin-only, runs automations hourly) and `checkout` (public, at `https://checkout.realniggafoods.com`), both deploying from `main` |
| DNS (Cloudflare) | `@`, `www` and `checkout` are `CNAME appwrite.network` (DNS only); a CAA record lets Appwrite issue certificates; DMARC, SPF and Google verification are kept |
| Already set | site `VITE_*` variables, `ADMIN_TEAM_ID`, `APPWRITE_SITES_CNAME_TARGET`, `UNSUBSCRIBE_SECRET` (both functions), `CHECKOUT_PUBLIC_URL` |
| Still to add | `CLOUDFLARE_API_TOKEN`, `GOOGLE_OAUTH_CLIENT_ID` and `GOOGLE_OAUTH_CLIENT_SECRET` (site-ops); `RESEND_API_KEY`, Stripe and PayPal keys (both); `STRIPE_WEBHOOK_SECRET` (checkout) |

Free-plan limits that shaped this: 2 functions, no cron (hourly interval instead), and 3 web platforms.

## Going live

### 1. Appwrite (database + login)
1. Create a project at [cloud.appwrite.io](https://cloud.appwrite.io). Under **Overview → Integrations → Platforms** add a **Web** platform for `localhost` and your dashboard's domain (`realniggafoods.com`).
2. Create an API key (**Overview → Integrations → API keys**) with the `databases`, `tables`, `teams` and `users` scopes, then run:
   ```bash
   pip install -r appwrite/requirements.txt
   APPWRITE_ENDPOINT=https://<region>.cloud.appwrite.io/v1 APPWRITE_PROJECT_ID=... APPWRITE_API_KEY=... \
   ADMIN_EMAIL=you@example.com ADMIN_PASSWORD='a-strong-password' python appwrite/setup.py
   ```
   This creates the tables and your login, and is safe to re-run. Then turn off public sign-ups under **Auth → Security** if you like (logins are created by you anyway).
3. Copy `.env.example` to `.env` and fill in the endpoint and project ID.

### 2. The Python functions (`site-ops` and `checkout`)

`python appwrite/deploy_functions.py` creates both from `appwrite.json`. Set `GIT_INSTALLATION_ID` and `GIT_REPOSITORY_ID` (from your site's Git settings) so they redeploy on every push.
Deploy it with the Appwrite CLI (`npm i -g appwrite-cli`, `appwrite login`, set `projectId` in `appwrite.json`, then `appwrite push functions`), or connect this repo in the console (**Functions → Create → Git**, runtime Python 3.12, root `appwrite/functions/site-ops`, entrypoint `src/main.py`, build command `pip install -r requirements.txt`, execute access `team:admins`, scope `teams.read`).

Set these function environment variables:

| Variable | Where to get it |
| --- | --- |
| `ADMIN_TEAM_ID` | `admins` (created by setup.py) |
| `CLOUDFLARE_API_TOKEN` | Cloudflare → My Profile → API Tokens → custom token with **Zone:Read, DNS:Edit, Cache Purge:Purge** for all zones (add **Zone:Edit** if you want "Add to Cloudflare") |
| `CLOUDFLARE_ACCOUNT_ID` | Only needed for "Add to Cloudflare"; shown on your Cloudflare dashboard sidebar |
| `APPWRITE_SITES_CNAME_TARGET` | The CNAME value Appwrite shows under *Sites → (site) → Domains → Add domain* |
| `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET` | See below: lets each store connect its own Google account |

**Google (free): each store connects its own Google account.** Set this up once:
1. In [Google Cloud console](https://console.cloud.google.com), create a project and enable the **Google Search Console API**, **Google Analytics Data API** and **Google Analytics Admin API**.
2. Under **OAuth consent screen**, choose *External* and add yourself as the contact. Then click **Publish app** ("In production"). In *Testing* mode Google expires the connection every 7 days. For your own stores, the "unverified app" notice Google shows is fine; just click *Continue*.
3. Under **Credentials → Create credentials → OAuth client ID**, choose *Web application* and add the authorized redirect URI `https://realniggafoods.com/oauth/google` (plus `http://localhost:5173/oauth/google` for local development).
4. Put the client ID and secret on the `site-ops` function as `GOOGLE_OAUTH_CLIENT_ID` and `GOOGLE_OAUTH_CLIENT_SECRET` (mark the secret as *secret*), then redeploy it.
5. In Yancey, open each store's **Store settings → Connections → Connect Google account**, sign in with the account that owns that site's Analytics and Search Console, then pick its GA4 property and Search Console site from the lists.

Refresh tokens live in the `connections` table, which has no client permissions, so only `site-ops` can read them. Disconnecting revokes access at Google. Optionally, `GOOGLE_SERVICE_ACCOUNT_JSON` still works as a shared fallback for stores that don't connect an account.

### 3. Each store's domain → Cloudflare → Appwrite Sites
1. In Yancey, **Your stores → Add store**, then under **Store settings → Store URL** add the domain and click **Add to Cloudflare** (or **Find by domain** if it's already there).
2. If the domain is registered at Namecheap: **Domain List → Manage → Nameservers → Custom DNS**, and enter the two Cloudflare nameservers Yancey shows. Activation usually takes under an hour.
3. Pick the store's Appwrite site under **Connections**, then on **Domain & DNS** click **Point to Appwrite Sites**.

### 4. Host the dashboard on Appwrite Sites
`appwrite push sites` deploys the `yancey` site from `appwrite.json`. Or connect this repo under *Sites → Create site* so it redeploys on every push. Add the `VITE_*` variables from `.env.example` under the site's *Settings → Environment variables*, and add its domain as a Web platform in Appwrite. See "Your setup" above for realniggafoods.com.

## Taking payments: Stripe, Apple Pay, Google Pay, PayPal

```
 Storefront (yancey.js)                     checkout function (Python, public)            Stripe / PayPal
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
4. **On each storefront:** add the site's domain as a Web platform in Appwrite, then paste the snippet from **Store settings → Sell on your site**. `examples/storefront.html` is a complete starter page with a product grid, cart, and Stripe and PayPal buttons.

```js
await Yancey.products();                 // active products for this site
Yancey.cart.add(productId);              // cart lives in localStorage; listen for "yancey:cart"
await Yancey.checkout("stripe");         // or "paypal", which redirects to pay
const order = await Yancey.handleReturn(); // on your success page: confirms PayPal and clears the cart
```

**Test before launching:** use Stripe test mode (card `4242 4242 4242 4242`) and a PayPal sandbox buyer account. Then switch to live keys and `PAYPAL_ENV=live`.

## Email (receipts, order alerts, shipping notices)

Email is a setup step for each site (**Store settings → Email**, also linked from the checklist on the store's Home). **Nothing is sent until it's finished:**

1. **Your email:** where new-order alerts go and where customers' replies land. It's pre-filled from your login, but you must confirm it.
2. **Verify your domain:** Yancey registers the store's domain with [Resend](https://resend.com) (free: 3,000 emails/month, 100/day) and adds the DKIM/SPF records to Cloudflare for you. These go on `resend._domainkey` and `send.` subdomains, so your existing mailbox records (MX at the root) aren't touched.
3. **Test and choose:** send yourself a test, then toggle receipts, new-order alerts and shipping emails.

Setup: create a Resend account, make an API key with **Full access** (it needs to add domains), and set `RESEND_API_KEY` on **both** the `site-ops` and `checkout` functions. Then re-run `python appwrite/setup.py` to add the email columns.

`emails.py` exists in both function folders because each Appwrite function deploys on its own. Keep the two copies identical.

## Marketing email, discounts, files

- **Who gets marketing email:** only customers with **Subscribed** ticked, either opted in at checkout (`acceptsMarketing`) or set by you on the Customers page. Every campaign must include an `{{unsubscribe_url}}` link. Each recipient gets a signed one-click unsubscribe link plus a `List-Unsubscribe` header.
- **Function settings:**
  - Set `UNSUBSCRIBE_SECRET` (any long random string) on **both** functions.
  - Set `CHECKOUT_PUBLIC_URL` (the checkout function's domain) on `site-ops`.
  - Resend's free plan sends **100 emails a day**; the campaign screen warns you above that.
- **Discounts:** checked server-side at checkout. Stripe receives a one-off coupon for the exact amount, and PayPal gets a discount breakdown. Storefronts can preview codes with `Yancey.discount(code)`.
- **Files:** `setup.py` creates a public-read `files` bucket. Uploads appear in the email designer's image picker.
- **Cart recovery:** abandoned carts come from expired Stripe sessions (enable the `checkout.session.expired` webhook event) and from unpaid carts older than an hour. The reminder email links back with `?yancey_cart=…`, and `yancey.js` restores the cart from it.

Re-run `python appwrite/setup.py` after pulling: it adds the new tables (collections, discounts, segments, templates, campaigns), the new columns and the bucket.

## Automations and product feeds

- **Automations** (`appwrite/functions/site-ops/src/automations.py`): the `site-ops` function runs every hour (`"interval": 60` in `appwrite.json`; the free plan allows hourly or longer, and cron needs a paid plan), and those scheduled runs send due automation emails. This keeps Yancey within Appwrite's free plan of 2 functions.
  - **Abandoned-cart reminder:** unpaid checkouts with an email, after N hours, within 7 days. Sent once, and skipped if the customer has bought since.
  - **Welcome email:** new subscribers, sent once.
  - **Win-back email:** subscribers whose last order is older than N days; once per gap between orders.
  - **Settings:** each one is switched on per site under **Marketing → Automations**, which also has *Preview due emails* (a dry run) and *Run now*. These use `site-ops`' `RESEND_API_KEY`, `UNSUBSCRIBE_SECRET`, `CHECKOUT_PUBLIC_URL` and optionally `AUTOMATION_MAX_PER_RUN` (default 50).
- **Product feed:** the checkout function serves `/feed.xml?site=<id>` in Google Merchant Center format, which TikTok, Pinterest and Meta also accept. Set `VITE_CHECKOUT_PUBLIC_URL` so the dashboard can show the URL. Set each site's product page path under **Sales channels → Google & YouTube**. Products without an image are left out, because Google requires one.
- **Shared code:** `appwrite/shared/` is the single source for code used by several functions. Run `python appwrite/sync_shared.py` after editing it, and `--check` before deploying.

## Product variants

Open a product → **Variants → Add options like size or color**. Type values (Enter or comma between them) and Yancey creates one variant per combination, up to 3 options and 100 variants. Editing options keeps existing variants' prices and stock. Each variant has its own price, compare-at price, stock, SKU and image; *Set for all variants* fills price or stock in one go. The product's own price and stock become roll-ups (cheapest price, total stock), so lists and reports keep working.

- **Checkout** prices and stock-checks every line by variant on the server, and paid orders decrement that variant's stock. Order lines, receipts, Stripe and PayPal show "House Blend — 2lb / Ground".
- **Storefront:** the product page's *Variant picker* block (pills or dropdown, sold-out values crossed out) switches price, stock, image and the URL (`?variant=`) live. Product cards show "From $X" and *Choose options* instead of quick add. `yancey.js` cart lines carry `variantId`: `Yancey.cart.add(productId, qty, variantId)`.
- **Inventory**, **Create order** and the **product feed** work per variant. The feed lists each variant with `item_group_id`, plus `size`/`color` when options use those names.
- Setup: re-run `python appwrite/setup.py` (adds the `options`, `variants` and `images` columns to products) and redeploy both functions.

**Product media:** each product has a gallery (upload, drop files, or paste URLs; drag to reorder; the first image is the main one). Variants pick their image from the gallery. On the storefront the product page shows main image + thumbnails or a stacked grid on desktop, a swipeable slider with dots on mobile, and a zoom lightbox (arrow keys, Escape). Choosing a variant jumps to its image. Product cards show the second image on hover (Theme settings → Product cards).

## Storefront search and filters

- **Collection and search pages** filter by availability, price range and every product option (Size, Color…, with counts), using Shopify's URL scheme (`?filter.v.option.size=M&filter.v.price.lte=40`). Active filters show as removable chips with *Clear all*; there's pagination and sorting. In the theme editor: *Product grid → Enable filtering*, sidebar or horizontal layout. On phones the filters sit behind a *Filter* button.
- **Predictive search:** the header search suggests products (with image and price), collections and pages as customers type. It also matches SKUs and option values. Turn it off under *Header → Show search suggestions*.
- **Editor on smaller screens:** below 1024px wide, a selected section's settings open in the left panel with a back arrow.

## Online store: themes and the theme editor

**Sales channels → Online store** works like Shopify's *Online Store → Themes*: a current (live) theme, a theme library, **Add theme** (four starting styles: Meridian, Pantry, Noir, Bloom), upload/download a theme file, duplicate, rename, preview and publish. **Customize** opens the editor:

- **Sidebar:** the page's sections in three groups (Header, Template, Footer), each section expandable to its blocks. Drag to reorder (also between groups), eye icon to hide, **Add section** / **Add block**. The section picker searches by name and shows a live preview of each section with your colors and fonts.
- **Settings panel:** every section and block has schema-driven settings (text, rich text, images, links, products, collections, menus, colors, color schemes, ranges, alignment…). Sections also have per-section **Custom CSS** and can be renamed.
- **Preview:** click any section or block to select it; the blue toolbar moves, duplicates, hides or removes it. **Double-click text to edit it in place.** Toggle the inspector off to click through the store like a shopper (links switch the editor to that template; the cart works). Desktop, mobile and full-screen views.
- **Page selector:** Home, product, collection, collections list, cart, search, order confirmation, 404, and your own **pages** (*Create page* makes `/pages/<handle>` built from sections). Product and collection templates let you choose which product or collection to preview.
- **Theme settings:** logo and favicon, editable color schemes, typography (32 Google Fonts + system fonts), layout, animations, buttons, inputs, product cards, badges, social links, search, cart (drawer or page, note, discount field, free-shipping bar), SEO and custom CSS.
- **Menus** are edited from the editor (pencil next to any menu setting), with nested sub-items.
- Undo/redo (⌘Z / ⇧⌘Z), save (⌘S), unsaved-change warning, and unsaved work is kept in the browser and offered back if a tab closes.

**Sections:** announcement bar, header, footer, image banner, slideshow, rich text, image with text, multicolumn, collage, collapsible content (FAQ), video, email signup, testimonials, logo list, scrolling text, countdown timer, contact form, custom HTML, spacer, featured collection, featured product, collection list, related products, plus the template sections (product information with 11 block types, collection banner and product grid with sorting, collections list, cart, 404).

**Going live:** **Publish to *domain*** pre-renders every page (home, each product and collection, your pages, cart, search) into static HTML, bundles `storefront.js` and `yancey.js`, and uploads it as a new deployment of the store's Appwrite site (the `site-ops` route `/hosting/upload-storefront`). Pages are crawlable and fast; in the browser `storefront.js` then reloads the live theme, products and stock, re-renders only what changed, and runs the cart drawer, checkout (Stripe, Apple Pay, Google Pay, PayPal), discount codes and email signup (the `checkout` function's new `/subscribe` route; subscribers land in Customers with marketing on, so the welcome automation picks them up). Products added later still work without republishing because the site's fallback file is set to `index.html`, which renders any URL. Set it by hand under *Sites → (site) → Settings* if the function couldn't.

Setup after pulling: run `python appwrite/setup.py` (adds the `themes` table, public-read so storefronts can load the live theme) and redeploy both functions. `npm run build` now also builds `dist/storefront.js` from `src/theme/runtime.ts`.

How it's built: the theme format mirrors Shopify's Online Store 2.0 JSON templates (section groups, templates, `settings`/`blocks`/`block_order`, schemas with presets), so the editor is generic over section schemas in `src/theme/sections/`. We looked at open-source builders (GrapesJS, already used for email; Puck; Craft.js), but those are free-form canvases. Shopify's editor is schema-driven sections and blocks, so we built that model directly: one renderer (`src/theme/render.ts`) produces the HTML for the editor preview, the publish step and the live store.

```
src/theme/
  types.ts      theme document + section schema types
  sections/     every section: schema (settings, blocks, presets) + render()
  render.ts     theme + route + data -> HTML
  settings.ts   theme settings schema, color schemes
  presets.ts    the four starting styles
  ops.ts        immutable editor operations (undo/redo friendly)
  behaviors.ts  cart drawer, quantity, slideshow, countdown… (live store + preview)
  runtime.ts    storefront.js
src/pages/online-store/   Themes page, ThemeEditor and its panels
```

## Finance

Each store's **Finance** page shows that store's sales, refunds, discounts, net and split by payment method. These come from Yancey's own orders, with a 30-day, 90-day or 1-year view and **Export for accountant** (CSV). Below that, **Payment accounts** shows your Stripe and PayPal balances, fees, refunds and recent payouts. Those are read-only, come from the processors, and are shared by every store that uses the account. They appear once `STRIPE_SECRET_KEY` / `PAYPAL_CLIENT_ID` + `PAYPAL_CLIENT_SECRET` are set on `site-ops`. PayPal's figures need the *Transaction search* permission on the PayPal app.

## Project layout
```
src/                       React dashboard
  lib/nav.ts               sidebar sections, sub-pages and the "planned" roadmap
  lib/segments.ts          segment rules engine
  lib/data.ts              data layer (Appwrite or demo) + calls to the Python function
  lib/demo.ts              sample data and mocked integration responses
  pages/                   one file per screen
public/yancey.js          storefront cart + checkout script (served by the dashboard)
examples/storefront.html   starter storefront page
appwrite/setup.py          creates the database schema, team and admin user
appwrite/shared/           code shared by functions (sync with appwrite/sync_shared.py)
appwrite/functions/site-ops/src/automations.py   scheduled cart / welcome / win-back emails
appwrite/functions/checkout/src/
  main.py                  public checkout routes + Stripe webhook
  payments.py              Stripe Checkout and PayPal Orders v2
  store.py                 cart pricing, idempotent order creation
appwrite/functions/site-ops/src/
  main.py                  router, auth check, Cloudflare + Appwrite Sites hosting
  google_apis.py           Search Console + GA4
  crawler.py               SEO crawler
```
