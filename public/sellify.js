/*!
 * sellify.js: drop-in cart + checkout for your storefront sites.
 *
 * <script src="https://YOUR-DASHBOARD.netlify.app/sellify.js"
 *         data-endpoint="https://<region>.cloud.appwrite.io/v1"
 *         data-project="YOUR_PROJECT_ID"
 *         data-site="SITE_ID_FROM_SELLIFY"
 *         data-success-url="/thank-you"></script>
 *
 *   await Sellify.products()                     -> active products for this site
 *   Sellify.cart.add(productId, qty) / .remove(productId) / .setQuantity(id, n) / .items() / .count() / .clear()
 *   window.addEventListener("sellify:cart", e => e.detail)   // fires on every cart change
 *   await Sellify.config()                       -> { stripe: bool, paypal: bool }
 *   await Sellify.checkout("stripe" | "paypal", { email })   // redirects to Stripe (card, Apple Pay, Google Pay) or PayPal
 *   await Sellify.handleReturn()                 -> call on your success page; confirms PayPal payments, clears the cart
 */
(function () {
  var me = document.currentScript || document.querySelector("script[data-site][data-project]");
  var cfg = {
    endpoint: (me && me.dataset.endpoint || "https://cloud.appwrite.io/v1").replace(/\/$/, ""),
    project: me && me.dataset.project,
    site: me && me.dataset.site,
    database: (me && me.dataset.database) || "sellify",
    fn: (me && me.dataset.function) || "checkout",
    successUrl: (me && me.dataset.successUrl) || "/thank-you",
  };
  var CART_KEY = "sellify-cart-" + cfg.site;
  var abs = function (u) { return new URL(u, location.href).href; };

  function store(get, val) {
    try {
      if (get) return JSON.parse(localStorage.getItem(CART_KEY) || "[]");
      localStorage.setItem(CART_KEY, JSON.stringify(val));
    } catch (e) { return get ? memory : (memory = val); }
  }
  var memory = [];

  function emit(items) { window.dispatchEvent(new CustomEvent("sellify:cart", { detail: items })); }

  var cart = {
    items: function () { return store(true); },
    count: function () { return cart.items().reduce(function (n, i) { return n + i.quantity; }, 0); },
    setQuantity: function (productId, quantity) {
      var items = cart.items().filter(function (i) { return i.productId !== productId; });
      if (quantity > 0) items.push({ productId: productId, quantity: Math.min(100, Math.floor(quantity)) });
      store(false, items); emit(items); return items;
    },
    add: function (productId, quantity) {
      var cur = cart.items().find(function (i) { return i.productId === productId; });
      return cart.setQuantity(productId, (cur ? cur.quantity : 0) + (quantity || 1));
    },
    remove: function (productId) { return cart.setQuantity(productId, 0); },
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

  async function products() {
    var q = [
      JSON.stringify({ method: "equal", attribute: "siteId", values: [cfg.site] }),
      JSON.stringify({ method: "equal", attribute: "status", values: ["active"] }),
      JSON.stringify({ method: "limit", values: [100] }),
    ].map(function (s, i) { return "queries[" + i + "]=" + encodeURIComponent(s); }).join("&");
    var res = await fetch(cfg.endpoint + "/tablesdb/" + cfg.database + "/tables/products/rows?" + q, { headers: { "X-Appwrite-Project": cfg.project } });
    var json = await res.json();
    if (!res.ok) throw new Error(json.message || "Could not load products");
    return json.rows;
  }

  async function checkout(provider, opts) {
    opts = opts || {};
    var items = opts.items || cart.items();
    if (!items.length) throw new Error("Your cart is empty");
    var success = abs(opts.successUrl || cfg.successUrl);
    var cancel = abs(opts.cancelUrl || location.href);
    var res = provider === "paypal"
      ? await call("/paypal/create", { siteId: cfg.site, items: items, returnUrl: success, cancelUrl: cancel, email: opts.email })
      : await call("/stripe/session", { siteId: cfg.site, items: items, successUrl: success, cancelUrl: cancel, email: opts.email });
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

  window.Sellify = { cart: cart, products: products, checkout: checkout, handleReturn: handleReturn, config: function () { return call("/config", {}); }, settings: cfg };
})();
