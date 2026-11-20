/*!
 * yancey.js: drop-in cart + checkout for your storefront sites.
 *
 * <script src="https://YOUR-YANCEY-DOMAIN/yancey.js"
 *         data-endpoint="https://<region>.cloud.appwrite.io/v1"
 *         data-project="YOUR_PROJECT_ID"
 *         data-site="SITE_ID_FROM_SELLIFY"
 *         data-success-url="/thank-you"></script>
 *
 *   await Yancey.products()                     -> active products for this site
 *   Yancey.cart.add(productId, qty, variantId?) / .remove(productId, variantId?) / .setQuantity(id, n, variantId?)
 *               .items() -> [{ productId, variantId?, quantity }] / .count() / .clear()
 *     (products with several variants need a variantId: product.variants[i].id)
 *   Products come back in one shape whatever format they were saved in (including Shopify imports):
 *     .options [{ name, values }], .variants [{ id, options: ["M", "Red"], title, price, inventory, tracked, imageUrl }],
 *     .images ["https://…"] (extra images after .imageUrl), .tracksInventory (false = always available)
 *   window.addEventListener("yancey:cart", e => e.detail)   // fires on every cart change
 *   await Yancey.config()                       -> { stripe: bool, paypal: bool }
 *   await Yancey.product("handle-or-id")         -> one product (works for unlisted ones too), with .variants and .images
 *   await Yancey.collection("best-sellers")     -> { title, description, products }
 *   await Yancey.catalog()                      -> active + unlisted products (everything sellable), all pages
 *   await Yancey.collections()                  -> all collections for this site
 *   await Yancey.theme()                        -> the live theme ({ name, data }) or null
 *   await Yancey.subscribe("a@b.com")           -> newsletter signup (customer with marketing on)
 *   await Yancey.discount("WELCOME10")          -> { subtotal, discount: { code, amount }, total } or throws
 *   await Yancey.checkout("stripe" | "paypal", { email, discountCode, acceptsMarketing })
 *                                                // redirects to Stripe (card, Apple Pay, Google Pay) or PayPal
 *   Cart-recovery emails link back with ?yancey_cart=…; the cart is restored automatically.
 *   await Yancey.handleReturn()                 -> call on your success page; confirms PayPal payments, clears the cart
 */
(function () {
  var me = document.currentScript || document.querySelector("script[data-site][data-project]");
  var cfg = {
    endpoint: (me && me.dataset.endpoint || "https://cloud.appwrite.io/v1").replace(/\/$/, ""),
    project: me && me.dataset.project,
    site: me && me.dataset.site,
    database: (me && me.dataset.database) || "yancey",
    fn: (me && me.dataset.function) || "checkout",
    successUrl: (me && me.dataset.successUrl) || "/thank-you",
  };
  var CART_KEY = "yancey-cart-" + cfg.site;
  var abs = function (u) { return new URL(u, location.href).href; };

  function store(get, val) {
    try {
      if (get) return JSON.parse(localStorage.getItem(CART_KEY) || "[]");
      localStorage.setItem(CART_KEY, JSON.stringify(val));
    } catch (e) { return get ? memory : (memory = val); }
  }
  var memory = [];

  function emit(items) { window.dispatchEvent(new CustomEvent("yancey:cart", { detail: items })); }

  // Lines are keyed by product + variant, so two sizes of one product are separate lines.
  var cart = {
    items: function () { return store(true); },
    count: function () { return cart.items().reduce(function (n, i) { return n + i.quantity; }, 0); },
    setQuantity: function (productId, quantity, variantId) {
      var same = function (i) { return i.productId === productId && (i.variantId || null) === (variantId || null); };
      var items = cart.items(), at = items.findIndex(same), next = items.filter(function (i) { return !same(i); });
      if (quantity > 0) {
        var line = { productId: productId, quantity: Math.min(100, Math.floor(quantity)) };
        if (variantId) line.variantId = variantId;
        next.splice(at < 0 ? next.length : at, 0, line);  // keep the line's position in the cart
      }
      store(false, next); emit(next); return next;
    },
    add: function (productId, quantity, variantId) {
      var cur = cart.items().find(function (i) { return i.productId === productId && (i.variantId || null) === (variantId || null); });
      return cart.setQuantity(productId, (cur ? cur.quantity : 0) + (quantity == null ? 1 : quantity), variantId);
    },
    remove: function (productId, variantId) { return cart.setQuantity(productId, 0, variantId); },
    clear: function () { store(false, []); emit([]); },
  };

  async function call(path, body) {
    var res = await fetch(cfg.endpoint + "/functions/" + cfg.fn + "/executions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Appwrite-Project": cfg.project },
      body: JSON.stringify({ body: JSON.stringify(body || {}), async: false, path: path, method: "POST", headers: { "content-type": "application/json" } }),
    });
    var exec = await res.json();
    if (!res.ok) throw new Error(exec.message || "Checkout is unavailable");
    var data = {};
    try { data = JSON.parse(exec.responseBody || "{}"); } catch (e) { /* non-JSON */ }
    if (exec.responseStatusCode >= 400 || data.error) throw new Error(data.error || "Checkout failed");
    return data;
  }

  async function rows(table, queries) {
    var q = queries.map(function (s, i) { return "queries[" + i + "]=" + encodeURIComponent(JSON.stringify(s)); }).join("&");
    var res = await fetch(cfg.endpoint + "/tablesdb/" + cfg.database + "/tables/" + table + "/rows?" + q, { headers: { "X-Appwrite-Project": cfg.project } });
    var json = await res.json();
    if (!res.ok) throw new Error(json.message || "Could not load " + table);
    return json.rows;
  }

  /**
   * Read a product saved in either format: the app's (options [{name, values}], variant.options ["M"], images ["url"])
   * or a Shopify import (variant.options {"Size": "M"}, variant.image, images [{src}], a lone "Default Title" variant).
   * Mirrors normalizeProduct() in src/lib/variants.ts.
   */
  function parse(p) {
    ["variants", "images", "tags", "options"].forEach(function (k) { if (typeof p[k] === "string") { try { p[k] = JSON.parse(p[k]); } catch (e) { p[k] = null; } } });
    var src = function (v) { return typeof v === "string" ? v : v && (v.src || v.url || v.originalSrc || v.original) || ""; };
    var images = (Array.isArray(p.images) ? p.images : []).map(src).filter(Boolean);
    p.imageUrl = p.imageUrl || images[0] || "";
    p.images = images.filter(function (u, i) { return u !== p.imageUrl && images.indexOf(u) === i; });
    var variants = (Array.isArray(p.variants) ? p.variants : []).filter(function (v) { return v && typeof v === "object"; });
    var options = Array.isArray(p.options) ? p.options.filter(function (o) { return o && o.name; }) : [];
    if (!options.length) {
      variants.forEach(function (v) {
        if (v.options && !Array.isArray(v.options) && typeof v.options === "object") Object.keys(v.options).forEach(function (name) {
          var o = options.find(function (x) { return x.name === name; }) || (options.push({ name: name, values: [] }), options[options.length - 1]);
          if (o.values.indexOf(String(v.options[name])) < 0) o.values.push(String(v.options[name]));
        });
      });
    }
    var keep = options.map(function (o) { return !(o.name.toLowerCase() === "title" && o.values.length <= 1 && (!o.values[0] || o.values[0] === "Default Title")); });
    var real = options.filter(function (_, i) { return keep[i]; });
    p.variants = variants.map(function (v) {
      var vals = Array.isArray(v.options) ? v.options.map(String) : v.options && typeof v.options === "object" ? options.map(function (o) { return String(v.options[o.name] == null ? "" : v.options[o.name]); }) : [];
      vals = real.length ? vals.filter(function (_, i) { return keep[i] !== false; }).slice(0, real.length) : [];
      var out = Object.assign({}, v, { options: vals, price: Number(v.price) || 0, inventory: Math.trunc(Number(v.inventory) || 0), imageUrl: src(v.imageUrl || v.image) || undefined,
        title: vals.length ? vals.join(" / ") : (v.title && v.title !== "Default Title" ? v.title : undefined) });
      delete out.image;
      return out;
    });
    p.options = real;
    if (p.tracksInventory == null) p.tracksInventory = true;
    return p;
  }

  /** Can this product (or one of its variants) be bought now? Untracked stock (digital goods) always can. */
  function available(p, v) {
    if (v) return p.tracksInventory === false || v.tracked === false || v.inventory > 0;
    if (p.variants && p.variants.length) return p.variants.some(function (x) { return available(p, x); });
    return p.tracksInventory === false || p.inventory > 0;
  }

  /** Every row matching the queries, 100 at a time (Appwrite's page size). */
  async function allRows(table, queries) {
    var out = [], cursor = null;
    for (;;) {
      var q = queries.concat([{ method: "limit", values: [100] }]);
      if (cursor) q.push({ method: "cursorAfter", values: [cursor] });
      var page = await rows(table, q);
      out = out.concat(page);
      if (page.length < 100) return out;
      cursor = page[page.length - 1].$id;
    }
  }

  // Active products for listings; collections (by id) may also include unlisted ones, which are buyable by link.
  async function products(ids) {
    var q = [{ method: "equal", attribute: "siteId", values: [cfg.site] }];
    q.push(ids ? { method: "equal", attribute: "$id", values: ids.length ? ids.slice(0, 100) : ["-"] } : { method: "equal", attribute: "status", values: ["active"] });
    var list = (await allRows("products", q)).map(parse);
    return ids ? list.filter(function (p) { return p.status === "active" || p.status === "unlisted"; }) : list;
  }

  /** Everything a storefront can show or sell: active and unlisted products (unlisted ones only by link). */
  async function catalog() {
    var q = [{ method: "equal", attribute: "siteId", values: [cfg.site] }, { method: "equal", attribute: "status", values: ["active", "unlisted"] }];
    return (await allRows("products", q)).map(parse);
  }

  async function product(handleOrId) {
    var q = [{ method: "equal", attribute: "siteId", values: [cfg.site] }, { method: "equal", attribute: "handle", values: [handleOrId] }, { method: "limit", values: [1] }];
    var hit = await rows("products", q);
    if (!hit.length) hit = (await products([handleOrId]));
    var p = hit[0] && parse(hit[0]);
    return p && (p.status === "active" || p.status === "unlisted") ? p : null;
  }

  async function collection(handle) {
    var found = await rows("collections", [{ method: "equal", attribute: "siteId", values: [cfg.site] }, { method: "equal", attribute: "handle", values: [handle] }, { method: "limit", values: [1] }]);
    if (!found.length) throw new Error("Collection not found: " + handle);
    var c = found[0];
    var list = await products(c.productIds || []);
    var order = c.productIds || [];
    list.sort(function (a, b) { return order.indexOf(a.$id) - order.indexOf(b.$id); });
    return { title: c.title, description: c.description, handle: c.handle, products: list };
  }

  async function collections() {
    return allRows("collections", [{ method: "equal", attribute: "siteId", values: [cfg.site] }]);
  }

  /** The live theme (Online store → Themes): { $id, name, data } or null. */
  async function theme() {
    var found = await rows("themes", [{ method: "equal", attribute: "siteId", values: [cfg.site] }, { method: "equal", attribute: "role", values: ["main"] }, { method: "limit", values: [1] }]);
    if (!found.length) return null;
    var t = found[0];
    try { t.data = typeof t.data === "string" ? JSON.parse(t.data) : t.data; } catch (e) { t.data = null; }
    return t;
  }

  function subscribe(email) { return call("/subscribe", { siteId: cfg.site, email: email }); }

  function discount(code, items) {
    return call("/discount", { siteId: cfg.site, items: items || cart.items(), code: code });
  }

  // Restore a cart from a recovery-email link (?yancey_cart=<base64url JSON>).
  (function restoreCart() {
    try {
      var p = new URLSearchParams(location.search), raw = p.get("yancey_cart");
      if (!raw) return;
      var json = atob(raw.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((raw.length + 3) % 4));
      var items = JSON.parse(json).filter(function (i) { return i && typeof i.productId === "string" && i.quantity > 0; })
        .map(function (i) {
          var line = { productId: i.productId, quantity: Math.min(100, Math.floor(i.quantity)) };
          if (typeof i.variantId === "string" && i.variantId) line.variantId = i.variantId;
          return line;
        });
      store(false, items); setTimeout(function () { emit(items); });
      p.delete("yancey_cart");
      history.replaceState(null, "", location.pathname + (p.toString() ? "?" + p : "") + location.hash);
    } catch (e) { /* ignore bad links */ }
  })();

  async function checkout(provider, opts) {
    opts = opts || {};
    var items = opts.items || cart.items();
    if (!items.length) throw new Error("Your cart is empty");
    var success = abs(opts.successUrl || cfg.successUrl);
    var cancel = abs(opts.cancelUrl || location.href);
    var extra = { email: opts.email, discountCode: opts.discountCode || undefined, acceptsMarketing: !!opts.acceptsMarketing };
    var res = provider === "paypal"
      ? await call("/paypal/create", Object.assign({ siteId: cfg.site, items: items, returnUrl: success, cancelUrl: cancel }, extra))
      : await call("/stripe/session", Object.assign({ siteId: cfg.site, items: items, successUrl: success, cancelUrl: cancel }, extra));
    location.href = res.url;
  }

  /** On your success page. PayPal returns with ?token=<orderId>; Stripe with ?checkout=<id> (the webhook records the order). */
  async function handleReturn() {
    var params = new URLSearchParams(location.search);
    if (params.get("token") && params.get("PayerID") !== null) {
      var order = await call("/paypal/capture", { paypalOrderId: params.get("token") });
      cart.clear();
      return Object.assign({ provider: "paypal" }, order);
    }
    if (params.get("checkout")) { cart.clear(); return { provider: "stripe", orderId: params.get("checkout") }; }
    return null;
  }

  window.Yancey = { cart: cart, products: function () { return products(); }, catalog: catalog, product: product, collection: collection, collections: collections, theme: theme, subscribe: subscribe, available: available, discount: discount, checkout: checkout, handleReturn: handleReturn, config: function () { return call("/config", {}); }, settings: cfg };
})();
