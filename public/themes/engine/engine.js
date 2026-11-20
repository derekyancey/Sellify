/*!
 * Sellify theme engine: renders a theme's JSON templates into a storefront.
 *
 * A theme is a folder with theme.json (fonts, colors, header, footer), templates/*.json
 * (index.json, product.json, product.<suffix>.json, ...) and an index.html that loads this
 * file. Products, collections, cart and checkout come from Sellify through yancey.js.
 *
 * Routes: /  /products/<handle>  /collections/<handle>  /cart
 * On the store's own domain these are real paths (the host serves index.html for every
 * path). Inside the Sellify dashboard (preview) the route travels in ?page=… instead.
 */
(function () {
  "use strict";
  var me = document.currentScript;
  var params = new URLSearchParams(location.search);
  var root = document.documentElement;
  var THEME = new URL(root.dataset.themeRoot || "./", location.href);   // folder holding theme.json
  var preview = params.has("page") || params.has("preview") || /\/themes\//.test(location.pathname);
  var state = { theme: null, cfg: null, products: null, cache: {} };

  /* ---------------- helpers ---------------- */
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var attr = esc;
  function styleOf(vars, extra) {
    var out = [];
    Object.keys(vars || {}).forEach(function (k) { if (k.indexOf("--") === 0) out.push(k + ":" + vars[k]); });
    if (extra) out.push(extra);
    return out.length ? ' style="' + attr(out.join(";")) + '"' : "";
  }
  function money(n) {
    var cur = (state.cfg && state.cfg.currency) || "USD";
    try { return new Intl.NumberFormat("en-US", { style: "currency", currency: cur }).format(Number(n) || 0); } catch (e) { return "$" + (Number(n) || 0).toFixed(2); }
  }
  /** Turn a storefront path into a link that works here (real path, or ?page= in preview). */
  function href(path) {
    if (!path || /^(https?:|mailto:|tel:|#)/.test(path)) return path || "#";
    if (!preview) return path;
    var q = new URLSearchParams(location.search);
    q.set("page", path);
    return location.pathname + "?" + q.toString();
  }
  function route() {
    if (preview) return params.get("page") || "/";
    var base = (state.cfg && state.cfg.basePath) || "/";
    var p = location.pathname;
    return "/" + (p.indexOf(base) === 0 ? p.slice(base.length) : p).replace(/^\/+/, "");
  }
  async function getJSON(url) {
    var res = await fetch(url, { cache: "no-cache" });
    if (!res.ok) throw new Error(res.status + " " + url);
    return res.json();
  }
  function icon(name) {
    var p = {
      search: '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/>',
      account: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/>',
      cart: '<path d="M5 8h14l-1 12H6L5 8Z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>',
      menu: '<path d="M4 7h16M4 12h16M4 17h10"/>',
      close: '<path d="M6 6l12 12M18 6 6 18"/>',
      caret: '<path d="m6 9 6 6 6-6"/>',
      plus: '<path d="M12 5v14M5 12h14"/>',
      prev: '<path d="m15 6-6 6 6 6"/>',
      next: '<path d="m9 6 6 6-6 6"/>',
      bag: '<path d="M5 8h14l-1 12H6L5 8Z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/><path d="m9.5 14 2 2 3.5-3.5"/>',
    }[name] || "";
    return '<svg class="i i-' + name + '" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">' + p + "</svg>";
  }

  /* ---------------- data ---------------- */
  function loadScript(src, data) {
    return new Promise(function (ok, fail) {
      var s = document.createElement("script");
      s.src = src;
      Object.keys(data || {}).forEach(function (k) { if (data[k]) s.dataset[k] = data[k]; });
      s.onload = ok; s.onerror = function () { fail(new Error("Could not load " + src)); };
      document.head.appendChild(s);
    });
  }
  var hasStore = function () { return !!(window.Yancey && state.cfg.project && state.cfg.site); };
  async function allProducts() {
    if (state.products) return state.products;
    try { state.products = hasStore() ? await Yancey.products() : []; }
    catch (e) { console.error("Could not load products:", e); state.products = []; }
    return state.products;
  }
  async function productByHandle(h) {
    if (state.cache[h] !== undefined) return state.cache[h];
    var list = await allProducts();
    var p = list.find(function (x) { return x.handle === h || x.$id === h; });
    if (!p && hasStore()) p = await Yancey.product(h).catch(function () { return null; });
    return (state.cache[h] = p || null);
  }
  var imagesOf = function (p) {
    var imgs = (p.images || []).map(function (i) { return typeof i === "string" ? { src: i } : i; }).filter(function (i) { return i && i.src; });
    if (!imgs.length && p.imageUrl) imgs = [{ src: p.imageUrl, alt: p.title }];
    return imgs;
  };
  var onSale = function (p) { return p.compareAtPrice && p.compareAtPrice > p.price; };

  /** Products for a collection handle: a Sellify collection if one exists, else matched by tag / type / software. */
  async function collectionProducts(handle) {
    if (hasStore()) {
      try { var c = await Yancey.collection(handle); if (c.products.length) return c; } catch (e) { /* no such collection */ }
    }
    var list = await allProducts();
    var rule = (state.theme.collections || {})[handle] || {};
    var title = rule.title || handle.replace(/-/g, " ").replace(/\b\w/g, function (c) { return c.toUpperCase(); });
    var words = (rule.match || [handle.replace(/^adobe-/, "").replace(/-/g, " ")]).map(function (w) { return w.toLowerCase(); });
    var matches = list.filter(function (p) {
      if (handle === "all") return true;
      if (handle === "sale") return onSale(p);
      if (handle === "free") return Number(p.price) === 0;
      var hay = [p.productType, p.title].concat(p.tags || []).join(" ").toLowerCase();
      return words.some(function (w) { return hay.indexOf(w) >= 0; });
    });
    return { title: title, description: rule.description || "", products: matches };
  }

  /* ---------------- blocks ---------------- */
  function align(node) {
    var s = node.style || {};
    var dir = s["--flex-direction"] || "column";
    var h = s["--horizontal-alignment"] || "", v = s["--vertical-alignment"] || "";
    var vm = s["--vertical-alignment-mobile"] || v;
    var row = dir.indexOf("row") === 0;
    var css = "--jc:" + ((row ? h : v) || "flex-start") + ";--ai:" + ((row ? v : h) || "stretch");
    // On phones a "mobile column" row stacks; then horizontal alignment drives align-items.
    css += ";--jc-m:" + ((node.mobileColumn ? vm : (row ? h : vm)) || "flex-start") + ";--ai-m:" + ((node.mobileColumn || !row ? h : vm) || "stretch");
    return css;
  }
  function sizeClass(node) {
    var s = node.style || {}, sizes = node.sizes || [], w = s["--size-style-width"];
    if (sizes.indexOf("width-fit-content") >= 0 || w === "fit-content") return " w-fit";
    if (sizes.indexOf("width-custom") >= 0 || (w && w !== "100%" && w !== "fill")) return " w-custom";
    if (sizes.indexOf("width-fill") >= 0 || w === "100%") return " w-fill";
    return "";
  }
  function bgMedia(bg) {
    if (!bg) return "";
    var m = bg.video
      ? '<video class="bg-media" src="' + attr(bg.video) + '" poster="' + attr(bg.poster || "") + '" autoplay muted loop playsinline></video>'
      : '<img class="bg-media" src="' + attr(bg.image) + '" alt="" loading="lazy">';
    return m + (bg.overlay ? overlay(bg.overlay) : "");
  }
  function overlay(o) {
    if (!o) return "";
    return '<div class="overlay overlay--' + (o.kind || "solid") + '"' + styleOf(o) + "></div>";
  }

  function block(n, ctx) {
    if (!n) return "";
    if (Array.isArray(n)) return n.map(function (x) { return block(x, ctx); }).join("");
    switch (n.t) {
      case "group": {
        var tag = n.href ? "a" : "div";
        var cls = "g" + sizeClass(n) + (n.mobileColumn ? " m-col" : "") + (n.bg ? " has-bg" : "") + (n.scheme ? " " + n.scheme + " scheme" : "") + ((n.sizes || []).indexOf("height-fill") >= 0 ? " h-fill" : "");
        return "<" + tag + ' class="' + cls + '"' + (n.href ? ' href="' + attr(href(n.href)) + '"' : "") + styleOf(n.style, align(n)) + ">" + bgMedia(n.bg) + block(n.children, ctx) + "</" + tag + ">";
      }
      case "text":
        return '<div class="t t-' + n.cls + sizeClass(n) + '"' + styleOf(n.style) + ">" + linkify(n.html) + "</div>";
      case "title": {
        var p = ctx.product;
        return '<div class="t t-' + (n.cls || "h1") + '"' + styleOf(n.style) + "><h1>" + esc(p ? p.title : "") + "</h1></div>";
      }
      case "description":
        return '<div class="t t-rte product-description"' + styleOf(n.style) + ">" + linkify((ctx.product && ctx.product.description) || "") + "</div>";
      case "price":
        return '<div class="price-block"' + styleOf(n.style) + ' data-price>' + priceHTML(ctx.product, ctx.variant) + "</div>";
      case "buy":
        return buyBlock(ctx);
      case "variants":
        ctx.pickerShown = true;
        return variantPicker(ctx.product);
      case "button":
        return '<a class="btn btn--' + n.variant + sizeClass(n) + '" href="' + attr(href(n.href)) + '"' + styleOf(n.style) + ">" + esc(n.label) + "</a>";
      case "image": {
        var src = n.image, alt = n.alt || "";
        if (n.dynamic === "featured" && ctx.product) { var f = imagesOf(ctx.product)[0]; if (f) { src = f.src; alt = f.alt || ctx.product.title; } }
        var img = '<img src="' + attr(src) + '" alt="' + attr(alt) + '" loading="lazy">';
        return (n.href ? '<a class="media-block' + sizeClass(n) + '" href="' + attr(href(n.href)) + '"' : '<div class="media-block' + sizeClass(n) + '"') + styleOf(n.style) + ">" + img + (n.href ? "</a>" : "</div>");
      }
      case "video":
        return '<div class="media-block' + sizeClass(n) + '"' + styleOf(n.style) + '><video src="' + attr(n.video) + '" poster="' + attr(n.poster || "") + '" autoplay muted loop playsinline></video></div>';
      case "icon":
        return '<div class="icon-block"><img src="' + attr(n.src) + '" alt="" loading="lazy"' + styleOf(n.style) + "></div>";
      case "logo":
        return '<a class="logo-block" href="' + attr(href("/")) + '"><img src="' + attr(state.theme.logo) + '" alt="' + attr(state.theme.name) + '"></a>';
      case "accordion":
        return '<div class="accordion' + (n.plus ? " accordion--plus" : "") + (n.dividers !== false ? " accordion--dividers" : "") + '"' + styleOf(n.style) + ">" +
          n.items.map(function (it) {
            return "<details" + (it.open ? " open" : "") + "><summary><span>" + esc(it.title) + "</span>" + icon(n.plus ? "plus" : "caret") + '</summary><div class="details-content">' + block(it.children, ctx) + "</div></details>";
          }).join("") + "</div>";
      case "compare":
        return '<div class="compare"' + styleOf(n.style) + ' data-compare><img src="' + attr(n.before) + '" alt="Before"><div class="compare__after"><img src="' + attr(n.after) + '" alt="After"></div><div class="compare__handle" role="slider" tabindex="0" aria-label="Before and after" aria-valuemin="0" aria-valuemax="100" aria-valuenow="50"></div></div>';
      case "jumbo":
        return '<div class="jumbo" data-jumbo' + styleOf(n.style) + "><span>" + esc(n.text) + "</span></div>";
      case "html":
        return (n.css ? "<style>" + n.css + "</style>" : "") + n.html;
      default:
        return "";
    }
  }
  function linkify(html) {   // internal links inside rich text follow the preview's routing
    if (!preview || !html) return html || "";
    return html.replace(/href="(\/[^"]*)"/g, function (_, p) { return 'href="' + attr(href(p)) + '"'; });
  }
  function priceHTML(p, v) {
    if (!p) return "";
    var price = v ? v.price : p.price, cmp = v ? (v.compareAtPrice != null ? v.compareAtPrice : p.compareAtPrice) : p.compareAtPrice;
    var sale = cmp && cmp > price;
    return '<span class="price">' + money(price) + "</span>" + (sale ? ' <s class="compare-at">' + money(cmp) + "</s>" : "");
  }
  function buyBlock(ctx) {
    var p = ctx.product;
    if (!p) return "";
    var picker = ctx.pickerShown ? "" : variantPicker(p);
    return picker + '<div class="buy-buttons"><button type="button" class="btn btn--primary btn--atc" data-add="' + attr(p.$id) + '">' + icon("cart") + "<span>Add to cart</span></button></div>";
  }

  function variantPicker(p) {
    var vs = ((p && p.variants) || []).filter(function (v) { return v.title && v.title !== "Default Title"; });
    if (vs.length < 2) return "";
    return '<div class="variant-picker"><span class="variant-picker__label">' + esc(Object.keys(vs[0].options || { Option: 1 })[0]) + '</span><div class="variant-picker__opts">' +
      vs.map(function (v, i) { return '<button type="button" class="variant' + (i === 0 ? " is-selected" : "") + '" data-variant="' + attr(v.id) + '">' + esc(v.title) + "</button>"; }).join("") + "</div></div>";
  }

  /* ---------------- product cards ---------------- */
  function card(p) {
    var imgs = imagesOf(p);
    return '<div class="card"><a class="card__media" href="' + attr(href("/products/" + (p.handle || p.$id))) + '">' +
      (imgs[0] ? '<img src="' + attr(imgs[0].src) + '" alt="' + attr(imgs[0].alt || p.title) + '" loading="lazy">' : '<div class="card__placeholder"></div>') +
      (onSale(p) ? '<span class="badge">Sale</span>' : "") + "</a>" +
      '<a class="card__title" href="' + attr(href("/products/" + (p.handle || p.$id))) + '">' + esc(p.title) + "</a>" +
      '<div class="card__price">' + priceHTML(p) + "</div></div>";
  }
  function cardRow(list, carousel) {
    if (!list.length) return '<p class="empty">No products yet.</p>';
    return '<div class="' + (carousel ? "carousel" : "grid") + '" ' + (carousel ? "data-carousel" : "") + ">" + list.map(card).join("") + "</div>" +
      (carousel ? '<div class="carousel__nav"><button type="button" data-dir="-1" aria-label="Previous">' + icon("prev") + '</button><button type="button" data-dir="1" aria-label="Next">' + icon("next") + "</button></div>" : "");
  }

  /* ---------------- sections ---------------- */
  async function section(s, ctx) {
    var open = '<section class="sec sec--' + s.type + " " + (s.scheme || "scheme-1") + ' scheme" id="' + attr(s.id) + '"' + styleOf(s.style) + ">";
    switch (s.type) {
      case "hero": {
        var media = (s.media || []).map(function (m) {
          var vis = m.desktop && !m.mobile ? " only-desktop" : m.mobile && !m.desktop ? " only-mobile" : "";
          return '<div class="hero__media' + vis + '">' + (m.video
            ? '<video src="' + attr(m.video) + '" poster="' + attr(m.poster || "") + '" autoplay muted loop playsinline></video>'
            : '<img src="' + attr(m.image) + '" alt="' + attr(m.alt || "") + '"' + (ctx.first ? "" : ' loading="lazy"') + ">") + "</div>";
        }).join("");
        ctx.first = false;
        return open + (s.href ? '<a class="hero__link" href="' + attr(href(s.href)) + '" aria-label="Open"></a>' : "") + '<div class="hero__media-grid">' + media + overlay(s.overlay) + '</div><div class="hero__content page-width"' + styleOf(s.style) + ">" + block(s.content, ctx) + "</div></section>";
      }
      case "marquee": {
        var items = block(s.items, ctx);
        return open + '<div class="marquee"><div class="marquee__track"><div class="marquee__items">' + items + '</div><div class="marquee__items" aria-hidden="true">' + items + "</div></div></div></section>";
      }
      case "section":
        return open + bgMedia(s.bg) + '<div class="sec__inner' + (s.full ? " full-width" : " page-width") + '">' + block(s.content, ctx) + "</div></section>";
      case "product-list": {
        var list = [];
        for (var i = 0; i < (s.products || []).length; i++) { var p = await productByHandle(s.products[i]); if (p) list.push(p); }
        return open + '<div class="page-width">' + (s.header ? block(s.header, ctx) : "") + cardRow(list, s.carousel) + "</div></section>";
      }
      case "collection-list":
        return open + '<div class="page-width"><div class="collections collections--' + s.variant + '">' + s.items.map(function (c) {
          return '<a class="collection-card"' + styleOf(s.cardStyle) + ' href="' + attr(href(c.href)) + '">' + (c.image ? '<img src="' + attr(c.image) + '" alt="' + attr(c.title) + '" loading="lazy">' : "") +
            (c.showTitle !== false && !c.image ? "<span>" + esc(c.title) + "</span>" : '<span class="visually-hidden">' + esc(c.title) + "</span>") + "</a>";
        }).join("") + "</div></div></section>";
      case "layered-slideshow":
        return open + '<div class="page-width"><div class="layered" data-layered>' + s.slides.map(function (sl, i) {
          return '<div class="layered__slide' + (i === 0 ? " is-active" : "") + '" data-i="' + i + '">' + bgMedia(sl.bg) + '<div class="layered__shade"></div><div class="layered__content">' + block(sl.content, ctx) + '</div><button type="button" class="layered__tab" aria-label="Show slide ' + (i + 1) + '">' + icon("plus") + "</button></div>";
        }).join("") + "</div></div></section>";
      case "blog-posts":
        return open + '<div class="page-width">' + (s.header ? block(s.header, ctx) : "") + '<div class="posts">' + s.posts.map(function (p) {
          var link = state.theme.blogBase ? state.theme.blogBase.replace(/\/$/, "") + p.href : p.href;
          return '<a class="post" href="' + attr(link) + '">' + (p.image ? '<img src="' + attr(p.image) + '" alt="" loading="lazy">' : "") + "<h3>" + esc(p.title) + '</h3><p class="post__meta">' + esc(p.meta.join(" | ")) + "</p></a>";
        }).join("") + "</div></div></section>";
      case "main-product":
        return open + mainProduct(s, ctx) + "</section>";
      case "product-recommendations": {
        var all = await allProducts(), me = ctx.product;
        var related = all.filter(function (p) { return !me || (p.$id !== me.$id && (p.productType === me.productType || (p.tags || []).some(function (t) { return (me.tags || []).indexOf(t) >= 0; }))); }).slice(0, 4);
        if (related.length < 4) related = related.concat(all.filter(function (p) { return (!me || p.$id !== me.$id) && related.indexOf(p) < 0; }).slice(0, 4 - related.length));
        return open + '<div class="page-width"><h3 class="rec__title">' + esc(s.heading || "You may also like") + "</h3>" + cardRow(related, false) + "</div></section>";
      }
      case "slideshow":
        return open + '<div class="slideshow" data-slideshow>' + s.slides.map(function (sl, i) {
          return '<div class="slideshow__slide' + (i === 0 ? " is-active" : "") + '">' + bgMedia(sl.bg) + '<div class="page-width slideshow__content">' + block(sl.content, ctx) + "</div></div>";
        }).join("") + (s.slides.length > 1 ? '<div class="slideshow__nav"><button type="button" data-dir="-1">' + icon("prev") + '</button><button type="button" data-dir="1">' + icon("next") + "</button></div>" : "") + "</div></section>";
      case "media-with-content":
        return open + '<div class="page-width mwc mwc--' + (s.mediaPosition || "left") + '"><div class="mwc__media">' + bgMedia(s.media) + '</div><div class="mwc__content">' + block(s.content, ctx) + "</div></div></section>";
      case "custom":
        return s.html;   // the merchant's own section markup, with its own styles
      case "collection":
        return open + await collectionPage(ctx.collection) + "</section>";
      default:
        return "";
    }
  }

  function mainProduct(s, ctx) {
    var p = ctx.product, g = s.gallery || {}, imgs = imagesOf(p);
    var gallery;
    if (g.layout === "carousel") {
      gallery = '<div class="gallery gallery--carousel" data-gallery><div class="gallery__stage">' +
        imgs.map(function (im, i) { return '<div class="gallery__slide' + (i === 0 ? " is-active" : "") + '"><img src="' + attr(im.src) + '" alt="' + attr(im.alt || p.title) + '"' + (i ? ' loading="lazy"' : "") + "></div>"; }).join("") +
        (imgs.length > 1 ? '<button type="button" class="gallery__arrow gallery__arrow--prev" data-dir="-1" aria-label="Previous image">' + icon("prev") + '</button><button type="button" class="gallery__arrow gallery__arrow--next" data-dir="1" aria-label="Next image">' + icon("next") + "</button>" : "") + "</div>" +
        (g.thumbnails && imgs.length > 1 ? '<div class="gallery__thumbs">' + imgs.map(function (im, i) { return '<button type="button" class="' + (i === 0 ? "is-active" : "") + '" data-i="' + i + '"><img src="' + attr(im.src) + '" alt="" loading="lazy"></button>'; }).join("") + "</div>" : "") + "</div>";
    } else {
      gallery = '<div class="gallery gallery--grid" style="--cols:' + (g.columns || 2) + '">' + imgs.map(function (im, i) { return '<div class="gallery__cell"><img src="' + attr(im.src) + '" alt="' + attr(im.alt || p.title) + '"' + (i ? ' loading="lazy"' : "") + "></div>"; }).join("") + "</div>";
    }
    return '<div class="page-width product product--media-' + (s.mediaPosition || "left") + " product--" + (s.split || "half") + '" data-product="' + attr(p.$id) + '">' +
      '<div class="product__media"' + styleOf(g.style) + ">" + gallery + '</div><div class="product__details">' + block(s.details, ctx) + "</div></div>";
  }

  async function collectionPage(c) {
    return '<div class="page-width"><h1 class="collection__title">' + esc(c.title) + "</h1>" + (c.description ? '<div class="t t-rte">' + c.description + "</div>" : "") + cardRow(c.products, false) + "</div>";
  }

  /* ---------------- header, footer, cart ---------------- */
  function header(transparent) {
    var t = state.theme, h = t.header || {};
    function item(m) {
      if (m.children && m.children.length) {
        return '<li class="nav__item has-sub"><button type="button" class="nav__link" aria-expanded="false">' + esc(m.title) + '</button><div class="mega"><div class="mega__inner page-width">' +
          m.children.map(function (c) {
            return '<div class="mega__col"><a class="mega__heading" href="' + attr(href(c.href)) + '">' + esc(c.title) + "</a>" +
              (c.children || []).map(function (cc) { return '<a href="' + attr(href(cc.href)) + '">' + esc(cc.title) + "</a>"; }).join("") + "</div>";
          }).join("") + "</div></div></li>";
      }
      var active = route() === m.href ? " is-active" : "";
      return '<li class="nav__item"><a class="nav__link' + active + '" href="' + attr(href(m.href)) + '">' + esc(m.title) + "</a></li>";
    }
    var drawer = (h.menu || []).map(function (m) {
      if (!m.children) return '<a href="' + attr(href(m.href)) + '">' + esc(m.title) + "</a>";
      return "<details><summary>" + esc(m.title) + icon("caret") + "</summary>" + m.children.map(function (c) {
        return '<a class="sub" href="' + attr(href(c.href)) + '">' + esc(c.title) + "</a>" + (c.children || []).map(function (cc) { return '<a class="sub2" href="' + attr(href(cc.href)) + '">' + esc(cc.title) + "</a>"; }).join("");
      }).join("") + "</details>";
    }).join("");
    return '<header class="site-header ' + (h.scheme || "scheme-2") + " scheme" + (transparent ? " is-transparent" : "") + '"><div class="site-header__row page-width">' +
      '<button type="button" class="hdr-icon only-mobile" data-open="menu" aria-label="Menu">' + icon("menu") + "</button>" +
      '<button type="button" class="hdr-icon only-mobile" data-open="search" aria-label="Search">' + icon("search") + "</button>" +
      '<a class="logo" href="' + attr(href("/")) + '"><img src="' + attr(t.logo) + '" alt="' + attr(t.name) + '"></a>' +
      '<nav class="nav only-desktop" aria-label="Main"><ul>' + (h.menu || []).map(item).join("") + "</ul></nav>" +
      '<div class="hdr-actions"><button type="button" class="hdr-icon only-desktop" data-open="search" aria-label="Search">' + icon("search") + "</button>" +
      '<a class="hdr-icon" href="' + attr(h.accountUrl || "#") + '" aria-label="Account">' + icon("account") + "</a>" +
      '<button type="button" class="hdr-icon cart-btn" data-open="cart" aria-label="Cart">' + icon("cart") + '<span class="cart-count" data-cart-count hidden></span></button></div></div>' +
      '<div class="menu-drawer scheme-1 scheme" data-drawer="menu"><button type="button" class="hdr-icon drawer-close" data-close aria-label="Close">' + icon("close") + "</button><nav>" + drawer + "</nav></div></header>";
  }
  function footer() {
    var f = state.theme.footer || {}, year = new Date().getFullYear();
    return '<footer class="site-footer"><div class="footer ' + (f.scheme || "scheme-2") + ' scheme"><div class="page-width footer__cols" style="--cols:' + (f.menus || []).length + '">' +
      (f.menus || []).map(function (m) {
        return '<div class="footer__col"><h2>' + esc(m.title) + "</h2><ul>" + m.links.map(function (l) { return '<li><a href="' + attr(href(l.href)) + '">' + esc(l.title) + "</a></li>"; }).join("") + "</ul></div>";
      }).join("") + "</div></div>" +
      '<div class="footer-utils ' + (f.utilitiesScheme || "scheme-1") + ' scheme"><div class="page-width footer-utils__row"><span>© ' + year + ' <a href="' + attr(href("/")) + '">' + esc(f.copyright || state.theme.name) + "</a></span>" +
      (f.policies && f.policies.length ? '<details class="policies"><summary>Terms and Policies</summary><div>' + f.policies.map(function (l) { return '<a href="' + attr(href(l.href)) + '">' + esc(l.title) + "</a>"; }).join("") + "</div></details>" : "") +
      "<span></span></div></div></footer>";
  }
  function cartDrawer() {
    return '<div class="drawer-backdrop" data-close></div><aside class="cart-drawer scheme-1 scheme" data-drawer="cart" aria-label="Cart"><div class="cart-drawer__head"><h2>Cart</h2><button type="button" class="hdr-icon" data-close aria-label="Close">' + icon("close") + '</button></div><div class="cart-drawer__body" data-cart-body></div></aside>' +
      '<div class="search-panel scheme-1 scheme" data-drawer="search"><div class="page-width"><input type="search" placeholder="Search" aria-label="Search" data-search><button type="button" class="hdr-icon" data-close aria-label="Close">' + icon("close") + '</button></div><div class="page-width search-results" data-search-results></div></div>';
  }
  async function renderCart() {
    var body = document.querySelector("[data-cart-body]");
    if (!body || !window.Yancey) return;
    var items = Yancey.cart.items(), list = await allProducts();
    var count = Yancey.cart.count();
    document.querySelectorAll("[data-cart-count]").forEach(function (b) { b.textContent = count; b.hidden = !count; });
    if (!items.length) { body.innerHTML = '<p class="cart-empty">Your cart is empty</p><a class="btn btn--primary" href="' + attr(href("/collections/all")) + '">Continue shopping</a>'; return; }
    var total = 0;
    var rows = items.map(function (it) {
      var p = list.find(function (x) { return x.$id === it.productId; }) || { title: "Item", price: 0 };
      var v = (p.variants || []).find(function (x) { return x.id === it.variantId; });
      var price = v ? v.price : p.price; total += price * it.quantity;
      var img = imagesOf(p)[0];
      return '<div class="cart-line">' + (img ? '<img src="' + attr(img.src) + '" alt="">' : "<span></span>") + '<div><div class="cart-line__title">' + esc(p.title) + "</div>" + (v && v.title !== "Default Title" ? '<div class="cart-line__variant">' + esc(v.title) + "</div>" : "") +
        '<div class="cart-line__qty"><button type="button" data-qty="' + attr(it.productId) + '" data-v="' + attr(it.variantId || "") + '" data-n="' + (it.quantity - 1) + '">−</button><span>' + it.quantity + '</span><button type="button" data-qty="' + attr(it.productId) + '" data-v="' + attr(it.variantId || "") + '" data-n="' + (it.quantity + 1) + '">+</button></div></div><div>' + money(price * it.quantity) + "</div></div>";
    }).join("");
    body.innerHTML = rows + '<div class="cart-total"><span>Estimated total</span><strong>' + money(total) + '</strong></div><input class="cart-discount" placeholder="Discount code" data-discount><button type="button" class="btn btn--primary btn--block" data-checkout="stripe">Check out</button><button type="button" class="btn btn--secondary btn--block" data-checkout="paypal">PayPal</button><p class="cart-error" data-cart-error></p>';
  }

  /* ---------------- interactions ---------------- */
  function openDrawer(name) {
    document.querySelectorAll("[data-drawer]").forEach(function (d) { d.classList.toggle("is-open", d.dataset.drawer === name); });
    document.body.classList.toggle("drawer-open", !!name);
    if (name === "cart") renderCart();
    if (name === "search") setTimeout(function () { var i = document.querySelector("[data-search]"); if (i) i.focus(); }, 50);
  }
  function wire(ctx) {
    document.addEventListener("click", async function (e) {
      var t = e.target.closest("button, a, summary");
      if (!t) return;
      if (t.dataset.open) { e.preventDefault(); openDrawer(t.dataset.open); return; }
      if (t.hasAttribute("data-close")) { openDrawer(null); return; }
      if (t.classList.contains("variant")) {
        t.parentNode.querySelectorAll(".variant").forEach(function (b) { b.classList.toggle("is-selected", b === t); });
        ctx.variant = (ctx.product.variants || []).find(function (v) { return v.id === t.dataset.variant; });
        document.querySelectorAll("[data-price]").forEach(function (el) { el.innerHTML = priceHTML(ctx.product, ctx.variant); });
        return;
      }
      if (t.dataset.add) {
        if (!window.Yancey) return;
        var vs = (ctx.product && ctx.product.variants) || [];
        var vid = ctx.variant ? ctx.variant.id : vs.length === 1 && vs[0].title !== "Default Title" ? vs[0].id : vs.length > 1 ? vs[0].id : vs[0] && vs[0].id;
        Yancey.cart.add(t.dataset.add, 1, (ctx.product.variants || []).length ? vid : undefined);
        t.classList.add("is-added"); setTimeout(function () { t.classList.remove("is-added"); }, 1200);
        openDrawer("cart");
        return;
      }
      if (t.dataset.qty) { Yancey.cart.setQuantity(t.dataset.qty, Number(t.dataset.n), t.dataset.v || undefined); renderCart(); return; }
      if (t.dataset.checkout) {
        var err = document.querySelector("[data-cart-error]"), code = (document.querySelector("[data-discount]") || {}).value;
        t.disabled = true; if (err) err.textContent = "";
        try { await Yancey.checkout(t.dataset.checkout, { discountCode: code || undefined }); } catch (x) { if (err) err.textContent = x.message; t.disabled = false; }
        return;
      }
      if (t.classList.contains("nav__link") && t.tagName === "BUTTON") {
        var li = t.parentNode, open = !li.classList.contains("is-open");
        document.querySelectorAll(".nav__item.is-open").forEach(function (x) { x.classList.remove("is-open"); });
        li.classList.toggle("is-open", open); t.setAttribute("aria-expanded", open);
        return;
      }
      if (t.classList.contains("layered__tab")) { var sl = t.closest(".layered__slide"); sl.parentNode.querySelectorAll(".layered__slide").forEach(function (x) { x.classList.toggle("is-active", x === sl); }); return; }
      if (t.dataset.dir && t.closest("[data-carousel], .carousel__nav")) {
        var row = t.closest(".page-width").querySelector("[data-carousel]");
        row.scrollBy({ left: Number(t.dataset.dir) * row.clientWidth * 0.8, behavior: "smooth" }); return;
      }
      var gal = t.closest("[data-gallery]");
      if (gal && (t.dataset.dir || t.dataset.i)) {
        var slides = gal.querySelectorAll(".gallery__slide"), thumbs = gal.querySelectorAll(".gallery__thumbs button");
        var cur = [].findIndex.call(slides, function (x) { return x.classList.contains("is-active"); });
        var next = t.dataset.i ? Number(t.dataset.i) : (cur + Number(t.dataset.dir) + slides.length) % slides.length;
        slides.forEach(function (x, i) { x.classList.toggle("is-active", i === next); });
        thumbs.forEach(function (x, i) { x.classList.toggle("is-active", i === next); });
        return;
      }
      var ss = t.closest("[data-slideshow]");
      if (ss && t.dataset.dir) {
        var ssl = ss.querySelectorAll(".slideshow__slide"), c2 = [].findIndex.call(ssl, function (x) { return x.classList.contains("is-active"); });
        var n2 = (c2 + Number(t.dataset.dir) + ssl.length) % ssl.length;
        ssl.forEach(function (x, i) { x.classList.toggle("is-active", i === n2); });
        return;
      }
      // keep internal navigation inside the preview
      if (preview && t.tagName === "A") {
        var h = t.getAttribute("href") || "";
        if (h.charAt(0) === "/" && h.indexOf("?page=") < 0 && !/\/themes\//.test(h)) { e.preventDefault(); location.href = href(h); }
      }
    });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") openDrawer(null); });
    window.addEventListener("yancey:cart", function () { renderCart(); });

    var search = document.querySelector("[data-search]"), out = document.querySelector("[data-search-results]");
    if (search) search.addEventListener("input", async function () {
      var q = search.value.trim().toLowerCase(), list = await allProducts();
      var hits = q ? list.filter(function (p) { return (p.title + " " + (p.tags || []).join(" ") + " " + (p.productType || "")).toLowerCase().indexOf(q) >= 0; }).slice(0, 8) : [];
      out.innerHTML = q ? (hits.length ? '<div class="grid">' + hits.map(card).join("") + "</div>" : "<p>No results</p>") : "";
    });

    // header turns solid once you scroll past the hero
    var hdr = document.querySelector(".site-header");
    var onScroll = function () { hdr.classList.toggle("is-scrolled", scrollY > 40); };
    addEventListener("scroll", onScroll, { passive: true }); onScroll();

    // before / after sliders (theme blocks and the merchant's own "ritual-ba" section)
    document.querySelectorAll("[data-compare], .ritual-ba__stage").forEach(function (stage) {
      var after = stage.querySelector(".compare__after, .ritual-ba__after"), handle = stage.querySelector(".compare__handle, .ritual-ba__handle"), divider = stage.querySelector(".ritual-ba__divider");
      if (!after || !handle) return;
      var drag = false;
      var set = function (x) {
        var r = stage.getBoundingClientRect(), pct = Math.max(0, Math.min(100, ((x - r.left) / r.width) * 100));
        after.style.width = pct + "%"; handle.style.left = pct + "%"; if (divider) divider.style.left = pct + "%";
        handle.setAttribute("aria-valuenow", Math.round(pct));
      };
      stage.addEventListener("pointerdown", function (e) { drag = true; set(e.clientX); stage.setPointerCapture(e.pointerId); });
      stage.addEventListener("pointermove", function (e) { if (drag) set(e.clientX); });
      stage.addEventListener("pointerup", function () { drag = false; });
      handle.addEventListener("keydown", function (e) {
        var cur = parseFloat(handle.style.left) || 50, r = stage.getBoundingClientRect();
        if (e.key === "ArrowLeft" || e.key === "ArrowRight") { e.preventDefault(); set(r.left + r.width * (cur + (e.key === "ArrowLeft" ? -2 : 2)) / 100); }
      });
    });
    document.querySelectorAll(".ritual-ba__nav-item").forEach(function (item, i, all) {
      item.addEventListener("click", function () {
        var sec = item.closest(".claude-b4-after, section") || document;
        sec.querySelectorAll(".ritual-ba__comparison").forEach(function (c, j) { c.classList.toggle("active", j === i); });
        all.forEach(function (x) { x.classList.toggle("active", x === item); });
      });
    });
    // the merchant's AI "definition panel" blocks
    document.querySelectorAll("[class*='ai-definition-panel-'][class$='__term'], [class*='__term'][class*='ai-definition-panel-']").forEach(function (term) {
      var root = term.parentNode, def = root.querySelector("[class*='__definition']"), ic = root.querySelector("[class*='__icon']");
      var toggle = function () { var on = !def.classList.contains("expanded"); def.classList.toggle("expanded", on); if (ic) ic.classList.toggle("rotated", on); term.setAttribute("aria-expanded", on); };
      term.addEventListener("click", toggle);
      term.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(); } });
    });
    // big headline that fills its width
    document.querySelectorAll("[data-jumbo]").forEach(function (j) {
      var span = j.firstChild, fit = function () { span.style.fontSize = "100px"; span.style.fontSize = Math.max(24, (100 * j.clientWidth) / Math.max(1, span.scrollWidth)) + "px"; };
      fit(); addEventListener("resize", fit);
    });
    // autoplay hero videos only when visible
    if ("IntersectionObserver" in window) {
      var io = new IntersectionObserver(function (es) { es.forEach(function (en) { if (en.isIntersecting) en.target.play && en.target.play().catch(function () {}); else en.target.pause && en.target.pause(); }); });
      document.querySelectorAll("video[autoplay]").forEach(function (v) { io.observe(v); });
    }
  }

  /* ---------------- boot ---------------- */
  async function templateFor(name) {
    try { return await getJSON(new URL("templates/" + name + ".json", THEME)); }
    catch (e) { if (name.indexOf("product.") === 0) return getJSON(new URL("templates/product.json", THEME)); throw e; }
  }
  function notice(msg) { return '<div class="page-width notice">' + msg + "</div>"; }

  async function boot() {
    var theme = state.theme = await getJSON(new URL("theme.json", THEME));
    var store = await getJSON(new URL("store.json", THEME)).catch(function () { return {}; });
    var cfg = state.cfg = {
      endpoint: params.get("endpoint") || store.endpoint, project: params.get("project") || store.project, site: params.get("site") || store.site,
      currency: store.currency || "USD", basePath: store.basePath || "/", yancey: params.get("yancey") || store.yancey || new URL("../../yancey.js", me.src).href,
      successUrl: store.successUrl,
    };
    applyTheme(theme);
    if (cfg.project && cfg.site) await loadScript(cfg.yancey, { endpoint: cfg.endpoint, project: cfg.project, site: cfg.site, successUrl: cfg.successUrl }).catch(function () {});

    var path = route(), ctx = { first: true }, tpl, title = theme.name;
    var m = path.match(/^\/products\/([^/?#]+)/), c = path.match(/^\/collections\/([^/?#]+)/);
    if (m) {
      ctx.product = await productByHandle(decodeURIComponent(m[1]));
      if (!ctx.product) { tpl = { sections: [] }; ctx.missing = "We couldn't find that product."; }
      else {
        var suffix = params.get("template") || ctx.product.templateSuffix;
        tpl = await templateFor(suffix ? "product." + suffix : "product");
        title = ctx.product.seoTitle || ctx.product.title + " – " + theme.name;
      }
    } else if (c) {
      ctx.collection = await collectionProducts(decodeURIComponent(c[1]));
      tpl = { sections: [{ id: "collection", type: "collection", scheme: theme.collectionScheme || "scheme-2" }] };
      title = ctx.collection.title + " – " + theme.name;
    } else if (path === "/" || path === "/cart") {
      tpl = await templateFor("index");
    } else {
      tpl = { sections: [] };
      ctx.missing = 'This page isn’t part of the theme yet. <a href="' + attr(href("/")) + '">Back to the home page</a>.';
    }
    document.title = title;
    var html = "";
    for (var i = 0; i < tpl.sections.length; i++) html += await section(tpl.sections[i], ctx);
    var transparent = tpl.sections[0] && tpl.sections[0].type === "hero" && theme.header && theme.header.transparentOverHero;
    var app = document.getElementById("app");
    app.innerHTML = header(transparent) + "<main id=\"main\">" + (ctx.missing ? notice(ctx.missing) : html) + "</main>" + footer() + cartDrawer();
    if (!hasStore()) app.insertAdjacentHTML("afterbegin", '<div class="preview-bar">Preview without store data: open it from Sellify (Online store → Themes) to see your products.</div>');
    wire(ctx);
    renderCart();
    if (path === "/cart") openDrawer("cart");
    document.body.classList.add("is-ready");
  }

  function applyTheme(t) {
    var css = [], f = t.fonts || {};
    if (f.googleFontsUrl) { var l = document.createElement("link"); l.rel = "stylesheet"; l.href = f.googleFontsUrl; document.head.appendChild(l); }
    css.push(":root{--font-body--family:" + f.body + ";--font-heading--family:" + f.heading + ";--font-subheading--family:" + (f.subheading || f.heading) + ";--font-accent--family:" + (f.accent || f.body) + ";" +
      Object.keys(t.type || {}).map(function (k) { return "--size-" + k + ":" + t.type[k] + "px"; }).join(";") + "}");
    Object.keys(t.schemes || {}).forEach(function (k) {
      var s = t.schemes[k];
      css.push("." + k + "{--color-background:" + s.background + ";--color-foreground:" + s.foreground + ";--color-foreground-heading:" + (s.heading || s.foreground) +
        ";--color-border-rgb:" + rgb(s.border || s.foreground) + ";--color-foreground-rgb:" + rgb(s.foreground) + ";--btn-bg:" + s.buttonBackground + ";--btn-fg:" + s.buttonText +
        ";--btn2-bg:" + (s.secondaryButtonBackground || "transparent") + ";--btn2-fg:" + (s.secondaryButtonText || s.foreground) + ";--btn-border:" + (s.buttonBorder || s.buttonBackground) + "}");
    });
    if (t.css) css.push(t.css);
    var st = document.createElement("style"); st.textContent = css.join("\n"); document.head.appendChild(st);
    if (t.favicon) { var ic = document.createElement("link"); ic.rel = "icon"; ic.href = t.favicon; document.head.appendChild(ic); }
  }
  function rgb(c) {
    c = String(c || "#000").trim();
    var m = c.match(/^#([0-9a-f]{6})([0-9a-f]{2})?$/i);
    if (m) { var n = parseInt(m[1], 16); return ((n >> 16) & 255) + " " + ((n >> 8) & 255) + " " + (n & 255); }
    var r = c.match(/rgba?\(([^)]+)\)/); if (r) { var p = r[1].split(/[ ,/]+/); return p[0] + " " + p[1] + " " + p[2]; }
    return "0 0 0";
  }

  boot().catch(function (e) {
    console.error(e);
    document.getElementById("app").innerHTML = '<div class="notice">This store could not load: ' + esc(e.message) + "</div>";
  });
})();
