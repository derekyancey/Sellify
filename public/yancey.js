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
 *   Yancey.cart.add(productId, qty, variantId?) / .remove(productId, variantId?) / .setQuantity(id, n, variantId?) / .items() / .count() / .clear()
 *     (products with several variants need a variantId: product.variants[i].id)
 *   window.addEventListener("yancey:cart", e => e.detail)   // fires on every cart change
 *   await Yancey.config()                       -> { stripe: bool, paypal: bool }
 *   await Yancey.product("handle-or-id")         -> one product (works for unlisted ones too), with .variants and .images
 *   await Yancey.collection("best-sellers")     -> { title, description, products }
 *   await Yancey.discount("WELCOME10")          -> { subtotal, discount: { code, amount }, total } or throws
 *   await Yancey.checkout("stripe" | "paypal", { email, discountCode, acceptsMarketing })
 *                                                // redirects to Stripe (card, Apple Pay, Google Pay) or PayPal
 *   await Yancey.checkout("free", { email, name }) // $0 carts (free products or a 100% code): no payment, email required;
 *                                                // goes straight to your success page
 *   await Yancey.total({ discountCode })         -> the server's total for the cart; 0 means use "free"
 *   Cart-recovery emails link back with ?yancey_cart=…; the cart is restored automatically.
 *   await Yancey.handleReturn()                 -> call on your success page; confirms PayPal payments, clears the cart.
 *                                                Resolves to { orderId, number, downloads: [{ name, url, size, remaining, expiresAt }] }
 *                                                (downloads = personal links for digital products; they're also in the receipt email)
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

  function parse(p) {
    ["variants", "images", "tags"].forEach(function (k) { if (typeof p[k] === "string") { try { p[k] = JSON.parse(p[k]); } catch (e) { p[k] = []; } } });
    return p;
  }

  // Active products for listings; collections (by id) may also include unlisted ones, which are buyable by link.
  async function products(ids) {
    var q = [{ method: "equal", attribute: "siteId", values: [cfg.site] }, { method: "limit", values: [100] }];
    q.push(ids ? { method: "equal", attribute: "$id", values: ids.length ? ids : ["-"] } : { method: "equal", attribute: "status", values: ["active"] });
    var list = (await rows("products", q)).map(parse);
    return ids ? list.filter(function (p) { return p.status === "active" || p.status === "unlisted"; }) : list;
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
        .map(function (i) { var l = { productId: i.productId, quantity: Math.min(100, Math.floor(i.quantity)) }; if (i.variantId) l.variantId = i.variantId; return l; });
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
    if (provider === "free") {
      if (!opts.email) throw new Error("Enter your email address to get your order");
      var free = await call("/free/checkout", Object.assign({ siteId: cfg.site, items: items, successUrl: success, name: opts.name }, extra));
      cart.clear();
      location.href = free.url;
      return free;
    }
    var res = provider === "paypal"
      ? await call("/paypal/create", Object.assign({ siteId: cfg.site, items: items, returnUrl: success, cancelUrl: cancel }, extra))
      : await call("/stripe/session", Object.assign({ siteId: cfg.site, items: items, successUrl: success, cancelUrl: cancel }, extra));
    location.href = res.url;
  }

  async function total(opts) {
    opts = opts || {};
    return (await call("/discount", { siteId: cfg.site, items: opts.items || cart.items(), code: opts.discountCode || undefined })).total;
  }

  var wait = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };

  /** Order status + download links, for the buyer who placed it (needs the key from the success URL). */
  async function order(checkoutId, key, waitMs) {
    var deadline = Date.now() + (waitMs == null ? 15000 : waitMs);
    for (;;) {  // Stripe's webhook can land a few seconds after the buyer is back
      var o = await call("/order", { checkoutId: checkoutId, key: key });
      if (o.status === "completed" || o.status === "expired" || Date.now() > deadline) return o;
      await wait(1500);
    }
  }

  /** On your success page. PayPal returns with ?token=<orderId>; Stripe with ?checkout=<id> (the webhook records the order). */
  async function handleReturn() {
    var params = new URLSearchParams(location.search);
    if (params.get("token") && params.get("PayerID") !== null) {
      var captured = await call("/paypal/capture", { paypalOrderId: params.get("token") });
      cart.clear();
      return Object.assign({ provider: "paypal", downloads: [] }, captured);
    }
    if (params.get("checkout")) {
      cart.clear();
      var base = { orderId: params.get("checkout"), downloads: [] };
      if (!params.get("key")) return Object.assign({ provider: "stripe" }, base);
      try { return Object.assign(base, await order(params.get("checkout"), params.get("key"))); }
      catch (e) { return base; }  // the order email still has everything
    }
    return null;
  }

  window.Yancey = { cart: cart, products: function () { return products(); }, product: product, collection: collection, discount: discount, checkout: checkout, total: total, order: order, handleReturn: handleReturn, config: function () { return call("/config", {}); }, settings: cfg };
})();
