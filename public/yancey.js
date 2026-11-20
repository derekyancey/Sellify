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
 *   await Yancey.collection("best-sellers")     -> { title, description, image, seoTitle, seoDescription, products } (in the collection's sort order)
 *
 *   Shopify's URLs work as they are: build the storefront on the same paths and every old link, bookmark and
 *   search result keeps working.
 *   Yancey.route(location.pathname)             -> { type: "product"|"collection"|"page"|"blog"|"article"|"cart"|"search"|"home"|…, handle, blog, tag, collection }
 *   Yancey.urls.product(p) / .collection(c) / .page(p) / .blog(handle) / .article(a)   -> "/products/handle", …
 *   await Yancey.redirect()                     -> follows a URL redirect for this page (Online store → URL redirects), else null.
 *                                                  Call it on your 404 page, or first thing on every page.
 *   await Yancey.page("about-us")               -> { title, bodyHtml, seoTitle, seoDescription } or null
 *   await Yancey.blog("news", { tag })          -> { handle, title, articles: [...] } newest first (no bodies, for listings)
 *   await Yancey.article("news", "what-is-a-lut") -> one post with bodyHtml, or null
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
    var base = [{ method: "equal", attribute: "siteId", values: [cfg.site] }, { method: "limit", values: [100] }];
    if (!ids) return (await rows("products", base.concat([{ method: "equal", attribute: "status", values: ["active"] }]))).map(parse);
    var list = [];
    for (var i = 0; i < ids.length; i += 100) // Appwrite caps a query at 100 values
      list = list.concat(await rows("products", base.concat([{ method: "equal", attribute: "$id", values: ids.slice(i, i + 100) }])));
    return list.map(parse).filter(function (p) { return p.status === "active" || p.status === "unlisted"; });
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
    if (!found.length || found[0].published === false) throw new Error("Collection not found: " + handle);
    var c = found[0];
    var list = await products(c.productIds || []);
    var order = c.productIds || [];
    list.sort(function (a, b) { return order.indexOf(a.$id) - order.indexOf(b.$id); });
    return { title: c.title, description: c.description, handle: c.handle, image: c.imageUrl || null,
      seoTitle: c.seoTitle || c.title, seoDescription: c.seoDescription || null, products: list };
  }

  // ------------------------------------------------------------------ Shopify-style URLs, pages and blogs
  var urls = {
    product: function (p) { return "/products/" + (p.handle || p.$id); },
    collection: function (c) { return "/collections/" + (c.handle || c); },
    page: function (p) { return "/pages/" + (p.handle || p); },
    blog: function (h) { return "/blogs/" + h; },
    article: function (a) { return "/blogs/" + a.blogHandle + "/" + a.handle; },
  };

  /** The redirect table's form of a path: no host, lower case, no trailing slash; query kept. */
  function normalize(path) {
    var s = String(path || "/").replace(/^[a-z]+:\/\/[^/?#]+/i, "").split("#")[0];
    if (s.charAt(0) !== "/") s = "/" + s;
    var q = s.indexOf("?"), p = (q < 0 ? s : s.slice(0, q)).replace(/\/{2,}/g, "/").toLowerCase();
    if (p.length > 1) p = p.replace(/\/+$/, "");
    try { p = decodeURI(p); } catch (e) { /* keep */ }
    return q < 0 || q === s.length - 1 ? p : p + s.slice(q);
  }

  function route(path) {
    var parts = normalize(path || location.pathname).split("?")[0].split("/").filter(Boolean), a = parts[0], b = parts[1], c = parts[2], d = parts[3];
    if (!a) return { type: "home" };
    if (a === "products" && b) return { type: "product", handle: b };
    if (a === "collections" && b && c === "products" && d) return { type: "product", handle: d, collection: b };
    if (a === "collections") return { type: "collection", handle: b || "all" };
    if (a === "pages" && b) return { type: "page", handle: b };
    if (a === "blogs" && b && c === "tagged" && d) return { type: "blog", blog: b, tag: d };
    if (a === "blogs" && b && c) return { type: "article", blog: b, handle: c };
    if (a === "blogs" && b) return { type: "blog", blog: b };
    if (a === "cart" || a === "search" || a === "account") return { type: a };
    if (a === "policies" && b) return { type: "policy", handle: b };
    return { type: "other" };
  }

  /** Look up a redirect for this URL (with its query string first, then without) and go there. */
  async function redirect(path) {
    var full = normalize(path || (location.pathname + location.search)), base = full.split("?")[0];
    var found = await rows("redirects", [{ method: "equal", attribute: "siteId", values: [cfg.site] },
      { method: "equal", attribute: "path", values: full === base ? [base] : [full, base] }, { method: "limit", values: [2] }]);
    var hit = found.find(function (r) { return r.path === full; }) || found[0];
    if (!hit || normalize(hit.target) === full) return null;
    if (!path) location.replace(hit.target);
    return hit.target;
  }

  async function page(handle) {
    var found = await rows("pages", [{ method: "equal", attribute: "siteId", values: [cfg.site] }, { method: "equal", attribute: "handle", values: [String(handle).toLowerCase()] }, { method: "limit", values: [1] }]);
    var p = found[0];
    return p && p.published !== false ? p : null;
  }

  function parseArticle(a) { if (typeof a.tags === "string") { try { a.tags = JSON.parse(a.tags); } catch (e) { a.tags = []; } } return a; }

  async function blog(handle, opts) {
    var q = [{ method: "equal", attribute: "siteId", values: [cfg.site] }, { method: "equal", attribute: "blogHandle", values: [handle] },
      { method: "select", values: ["$id", "blogHandle", "blogTitle", "handle", "title", "summaryHtml", "author", "tags", "imageUrl", "publishedAt", "published", "seoDescription"] }];
    var list = (await allRows("articles", q)).map(parseArticle).filter(function (a) { return a.published !== false; });
    var tag = opts && opts.tag && String(opts.tag).toLowerCase();
    if (tag) list = list.filter(function (a) { return (a.tags || []).some(function (t) { return t.toLowerCase().replace(/[^a-z0-9]+/g, "-") === tag || t.toLowerCase() === tag; }); });
    list.sort(function (x, y) { return String(y.publishedAt || "").localeCompare(String(x.publishedAt || "")); });
    return { handle: handle, title: (list[0] && list[0].blogTitle) || handle, articles: list };
  }

  async function article(blogHandle, handle) {
    var found = await rows("articles", [{ method: "equal", attribute: "siteId", values: [cfg.site] }, { method: "equal", attribute: "blogHandle", values: [blogHandle] },
      { method: "equal", attribute: "handle", values: [String(handle).toLowerCase()] }, { method: "limit", values: [1] }]);
    var a = found[0] && parseArticle(found[0]);
    return a && a.published !== false ? a : null;
  }

  /** Every row matching the queries, 100 at a time. */
  async function allRows(table, queries) {
    var out = [], cursor = null;
    for (;;) {
      var q = queries.concat([{ method: "limit", values: [100] }]);
      if (cursor) q.push({ method: "cursorAfter", values: [cursor] });
      var pageRows = await rows(table, q);
      out = out.concat(pageRows);
      if (pageRows.length < 100) return out;
      cursor = pageRows[pageRows.length - 1].$id;
    }
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

  window.Yancey = { cart: cart, products: function () { return products(); }, product: product, collection: collection, discount: discount,
    route: route, urls: urls, redirect: redirect, page: page, blog: blog, article: article, checkout: checkout, handleReturn: handleReturn, config: function () { return call("/config", {}); }, settings: cfg };
})();
