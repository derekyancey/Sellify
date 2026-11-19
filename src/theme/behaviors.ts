/**
 * Storefront interactivity, shared by the live store and the editor preview. Everything uses
 * event delegation on the document, so it keeps working when sections are re-rendered.
 */
export interface StoreApi {
  addToCart(productId: string, quantity: number, variantId?: string): Promise<void> | void;
  setQuantity(productId: string, quantity: number, variantId?: string): Promise<void> | void;
  checkout(provider: "stripe" | "paypal", opts: { discountCode?: string; note?: string }): Promise<void>;
  buyNow(productId: string, quantity: number, variantId?: string): Promise<void>;
  discount(code: string): Promise<string>;           // resolves to a message to show
  search?(q: string): { kind: string; title: string; url: string; image?: string; price?: string }[];
  subscribe(email: string): Promise<void>;
  navigate(url: string): void;
}

export function installBehaviors(doc: Document, api: StoreApi) {
  const win = doc.defaultView!;
  let cartOpen = false;
  const $ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = doc) => root.querySelector<T>(sel);
  const $$ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = doc) => Array.from(root.querySelectorAll<T>(sel));

  const showError = (el: Element | null, msg: string) => {
    const box = el?.closest(".product__info, .cart-drawer, [data-cart-section], .product")?.querySelector<HTMLElement>("[data-cart-error]");
    if (box) { box.textContent = msg; box.hidden = !msg; }
  };
  const setCart = (open: boolean) => {
    cartOpen = open;
    $$("[data-cart-drawer], .cart-drawer-overlay").forEach(el => el.classList.toggle("is-open", open));
    $("[data-cart-drawer]")?.setAttribute("aria-hidden", String(!open));
  };
  const qtyFor = (el: Element) => {
    const input = el.closest("[data-product]")?.querySelector<HTMLInputElement>("[data-qty-input]");
    return Math.max(1, Math.floor(Number(input?.value) || 1));
  };
  const busy = async (btn: HTMLButtonElement, fn: () => Promise<unknown> | unknown) => {
    const label = btn.innerHTML;
    btn.disabled = true; btn.style.opacity = ".6";
    try { await fn(); showError(btn, ""); }
    catch (e) { showError(btn, (e as Error).message || "Something went wrong"); }
    finally { btn.disabled = false; btn.style.opacity = ""; btn.innerHTML = label; }
  };

  doc.addEventListener("click", e => {
    const t = e.target as HTMLElement;
    const el = <T extends HTMLElement = HTMLElement>(sel: string) => t.closest<T>(sel);
    let b: HTMLElement | null;

    if (el("[data-facets-toggle]")) { $("form[data-filters]")?.classList.toggle("is-open"); return; }
    if ((b = el("[data-thumb]"))) { showSlide(b.closest<HTMLElement>("[data-gallery]")!, Number(b.dataset.thumb), false); return; }
    if ((b = el("[data-gallery][data-zoomable] .gallery__slide")) && !t.closest("a")) {
      const g = b.closest<HTMLElement>("[data-gallery]")!;
      lightbox(g, $$(".gallery__slide", g).indexOf(b));
      return;
    }
    if ((b = el("[data-add-to-cart]"))) {
      e.preventDefault();
      const id = b.dataset.addToCart!, vid = b.dataset.variant || undefined;
      busy(b as HTMLButtonElement, async () => { await api.addToCart(id, qtyFor(b!), vid); if ($("[data-cart-drawer]")) setCart(true); });
      return;
    }
    if ((b = el("[data-buy-now]"))) { e.preventDefault(); const id = b.dataset.buyNow!, vid = b.dataset.variant || undefined; busy(b as HTMLButtonElement, () => api.buyNow(id, qtyFor(b!), vid)); return; }
    if ((b = el("[data-open-cart]")) && $("[data-cart-drawer]")) { e.preventDefault(); setCart(true); return; }
    if (el("[data-close-cart]")) { e.preventDefault(); setCart(false); return; }
    if ((b = el("[data-qty-minus],[data-qty-plus]"))) {
      const input = b.closest("[data-qty]")?.querySelector<HTMLInputElement>("input");
      if (input) input.value = String(Math.max(1, (Number(input.value) || 1) + (b.hasAttribute("data-qty-plus") ? 1 : -1)));
      return;
    }
    if ((b = el("[data-line-qty]"))) {
      const key = b.dataset.lineQty!, input = $<HTMLInputElement>(`[data-line-input="${CSS.escape(key)}"]`, b.closest(".cart-line")!);
      setLine(key, Math.max(0, (Number(input?.value) || 0) + Number(b.dataset.delta)));
      return;
    }
    if ((b = el("[data-line-remove]"))) { setLine(b.dataset.lineRemove!, 0); return; }
    if ((b = el("[data-checkout]"))) {
      const scope = b.closest(".cart-drawer, [data-cart-section]") ?? doc;
      const code = $<HTMLInputElement>("[data-discount-input]", scope)?.value.trim();
      const note = $<HTMLTextAreaElement>("[data-cart-note]", scope)?.value.trim();
      const provider = b.dataset.checkout as "stripe" | "paypal";
      busy(b as HTMLButtonElement, () => api.checkout(provider, { discountCode: code || undefined, note: note || undefined }));
      return;
    }
    if ((b = el("[data-apply-discount]"))) {
      const scope = b.closest(".cart-drawer, [data-cart-section]") ?? doc;
      const input = $<HTMLInputElement>("[data-discount-input]", scope), msg = $<HTMLElement>("[data-discount-msg]", scope);
      if (!input?.value.trim() || !msg) return;
      api.discount(input.value.trim()).then(m => { msg.textContent = m; msg.hidden = false; }, err => { msg.textContent = err.message; msg.hidden = false; });
      return;
    }
    if (el("[data-open-search]")) { const m = $("[data-search-modal]"); if (m) { m.hidden = false; $<HTMLInputElement>("input", m)?.focus(); } return; }
    if (el("[data-close-search]")) { const m = $("[data-search-modal]"); if (m) m.hidden = true; return; }
    if (el("[data-close-details]")) { t.closest("details")?.removeAttribute("open"); return; }
    if ((b = el("[data-video]"))) {
      const frame = doc.createElement("iframe");
      frame.src = b.dataset.video!; frame.allow = "autoplay; encrypted-media; picture-in-picture"; frame.allowFullscreen = true;
      b.replaceWith(frame); return;
    }
    if (el("[data-share]")) {
      const url = win.location.href;
      if ((win.navigator as Navigator).share) win.navigator.share({ url, title: doc.title }).catch(() => {});
      else win.navigator.clipboard?.writeText(url).then(() => { t.textContent = "Link copied"; });
      return;
    }
    if ((b = el("[data-prev],[data-next],[data-dot]"))) {
      const show = b.closest<HTMLElement>("[data-slideshow]");
      if (!show) return;
      const slides = $$(".slideshow__slide", show), cur = slides.findIndex(s => s.classList.contains("is-active"));
      const next = b.dataset.dot !== undefined ? Number(b.dataset.dot) : (cur + (b.hasAttribute("data-next") ? 1 : -1) + slides.length) % slides.length;
      goTo(show, next); show.dataset.paused = "1";
    }
  });

  doc.addEventListener("change", e => {
    const t = e.target as HTMLElement;
    if (t.matches("[data-sort]")) {
      const u = new URL((t as HTMLElement).dataset.path || win.location.pathname + win.location.search, "https://store.invalid");
      const v = (t as HTMLSelectElement).value;
      if (v === "manual") u.searchParams.delete("sort"); else u.searchParams.set("sort", v);
      u.searchParams.delete("page");
      api.navigate(u.pathname + u.search);
    }
    if (t.matches("[data-line-input]")) setLine((t as HTMLInputElement).dataset.lineInput!, Math.max(0, Number((t as HTMLInputElement).value) || 0));
    if (t.matches("[data-option]")) selectVariant(t.closest<HTMLElement>("[data-product]"));
    const filters = t.closest<HTMLFormElement>("form[data-filters]");
    if (filters) {
      const q = new URLSearchParams();
      new FormData(filters).forEach((v, k) => { if (String(v).trim() !== "") q.append(k, String(v)); });
      const qs = q.toString();
      api.navigate((filters.getAttribute("action") || win.location.pathname) + (qs ? `?${qs}` : ""));
    }
  });

  /* ---------------- product gallery */
  function showSlide(g: HTMLElement, i: number, scroll = true) {
    const slides = $$(".gallery__slide", g);
    if (!slides[i]) return;
    slides.forEach((x, n) => x.classList.toggle("is-active", n === i));
    $$(".gallery__thumb", g).forEach((x, n) => x.classList.toggle("is-active", n === i));
    $$(".gallery__dots span", g).forEach((x, n) => x.classList.toggle("is-active", n === i));
    const track = $(".gallery__slides", g);
    if (scroll && track && track.scrollWidth > track.clientWidth) track.scrollTo({ left: slides[i].offsetLeft - track.offsetLeft, behavior: "smooth" });
  }
  function showImage(prod: HTMLElement, src: string) {
    const g = $("[data-gallery]", prod); if (!g) return;
    const i = $$(".gallery__slide", g).findIndex(x => x.dataset.src === src);
    if (i >= 0) showSlide(g, i);
    else { const img = $<HTMLImageElement>(".gallery__slide.is-active img", g); if (img) img.src = src; }
  }
  function lightbox(g: HTMLElement, start: number) {
    const srcs = $$(".gallery__slide", g).map(x => x.dataset.src!).filter(Boolean);
    if (!srcs.length) return;
    let i = start;
    const box = doc.createElement("div");
    box.className = "lightbox"; box.setAttribute("role", "dialog"); box.setAttribute("aria-label", "Image viewer");
    const icon = (d: string) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="${d}"/></svg>`;
    const draw = () => {
      box.innerHTML = `<img src="${srcs[i].replace(/"/g, "&quot;")}" alt="">
<button data-lb-close aria-label="Close">${icon("M6 6l12 12M18 6 6 18")}</button>
${srcs.length > 1 ? `<button data-lb-prev aria-label="Previous image">${icon("m15 6-6 6 6 6")}</button><button data-lb-next aria-label="Next image">${icon("m9 6 6 6-6 6")}</button><div class="lightbox__count">${i + 1} / ${srcs.length}</div>` : ""}`;
    };
    const close = () => { box.parentNode?.removeChild(box); doc.removeEventListener("keydown", key, true); doc.documentElement.style.overflow = ""; };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.stopPropagation(); close(); }
      if (e.key === "ArrowRight") { i = (i + 1) % srcs.length; draw(); }
      if (e.key === "ArrowLeft") { i = (i - 1 + srcs.length) % srcs.length; draw(); }
    };
    box.addEventListener("click", e => {
      const t = e.target as HTMLElement;
      if (t.closest("[data-lb-next]")) { i = (i + 1) % srcs.length; draw(); }
      else if (t.closest("[data-lb-prev]")) { i = (i - 1 + srcs.length) % srcs.length; draw(); }
      else close();
    });
    draw(); doc.body.appendChild(box); doc.addEventListener("keydown", key, true);
    doc.documentElement.style.overflow = "hidden";
  }
  doc.addEventListener("scroll", e => {
    const track = e.target as HTMLElement;
    if (!(track instanceof win.HTMLElement) || !track.classList?.contains("gallery__slides")) return;
    const i = Math.round(track.scrollLeft / Math.max(1, track.clientWidth));
    $$(".gallery__dots span", track.parentElement!).forEach((x, n) => x.classList.toggle("is-active", n === i));
  }, true);

  /** Cart line keys are "productId:variantId". */
  const setLine = (key: string, q: number) => { const [pid, vid] = key.split(":"); return api.setQuantity(pid, q, vid || undefined); };

  /** After an option changes: find the matching variant and update price, stock, image, buttons and the URL. */
  type V = { id: string; options: string[]; price: number; compareAtPrice?: number; inventory: number; imageUrl?: string };
  function selectVariant(prod: HTMLElement | null) {
    if (!prod?.dataset.variants) return;
    const variants: V[] = JSON.parse(prod.dataset.variants);
    const chosen: string[] = [];
    for (const input of $$<HTMLInputElement | HTMLSelectElement>("[data-option]", prod)) {
      const i = Number(input.dataset.option);
      if (input instanceof HTMLSelectElement || (input as HTMLInputElement).checked) chosen[i] = input.value;
    }
    chosen.forEach((v, i) => { const l = $(`[data-option-label="${i}"]`, prod); if (l) l.textContent = v; });
    const v = variants.find(x => x.options.every((o, i) => o === chosen[i]));
    const cur = prod.dataset.currency || "USD";
    const fmt = (n: number) => { try { return new Intl.NumberFormat(undefined, { style: "currency", currency: cur }).format(n); } catch { return n.toFixed(2); } };
    const sold = !v || v.inventory <= 0;
    const priceBox = $("[data-price] .price", prod);
    if (priceBox && v) {
      const sale = !!v.compareAtPrice && v.compareAtPrice > v.price;
      priceBox.className = `price price--large${sale ? " price--sale" : ""}`;
      priceBox.innerHTML = `${sale ? `<s class="price__compare">${fmt(v.compareAtPrice!)}</s>` : ""}<span class="price__current">${fmt(v.price)}</span>`;
    }
    const inv = $("[data-inventory]", prod);
    if (inv) {
      const t = Number(inv.dataset.threshold) || 0, n = v?.inventory ?? 0, count = inv.dataset.showCount === "1";
      inv.className = `inventory-note ${!v ? "out" : n <= 0 ? "out" : n <= t ? "low" : ""}`;
      inv.textContent = !v ? "Unavailable" : n <= 0 ? "Out of stock" : n <= t ? (count ? `Low stock: ${n} left` : "Low stock") : (count ? `${n} in stock` : "In stock");
    }
    for (const btn of $$<HTMLButtonElement>("[data-add-to-cart], [data-buy-now]", prod)) {
      if (v) btn.dataset.variant = v.id;
      if (btn.hasAttribute("data-add-to-cart")) { btn.disabled = sold; btn.textContent = !v ? "Unavailable" : sold ? "Sold out" : "Add to cart"; }
      else btn.hidden = sold;
    }
    if (v?.imageUrl) showImage(prod, v.imageUrl);
    if (v && prod.hasAttribute("data-update-url")) {
      try { const u = new URL(win.location.href); u.searchParams.set("variant", v.id); win.history.replaceState(null, "", u.pathname + u.search + u.hash); } catch { /* preview iframe */ }
    }
  }

  doc.addEventListener("submit", e => {
    const f = e.target as HTMLFormElement;
    if (f.matches("[data-newsletter]")) {
      e.preventDefault();
      const email = (f.elements.namedItem("email") as HTMLInputElement).value;
      const msg = f.parentElement?.querySelector<HTMLElement>(".form-msg");
      Promise.resolve(api.subscribe(email)).then(() => { f.reset(); if (msg) { msg.textContent = "Thanks for subscribing!"; msg.hidden = false; } },
        err => { if (msg) { msg.textContent = err.message; msg.hidden = false; } });
    } else if (f.matches("[data-contact]")) {
      e.preventDefault();
      const d = new FormData(f), to = f.dataset.contact || "";
      const body = `Name: ${d.get("name") ?? ""}\nEmail: ${d.get("email") ?? ""}\nPhone: ${d.get("phone") ?? ""}\n\n${d.get("message") ?? ""}`;
      win.location.href = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent("Message from " + doc.title)}&body=${encodeURIComponent(body)}`;
    } else if (f.getAttribute("action") === "/search") {
      e.preventDefault();
      const q = (f.elements.namedItem("q") as HTMLInputElement).value.trim();
      api.navigate(`/search${q ? `?q=${encodeURIComponent(q)}` : ""}`);
    }
  });

  /* predictive search */
  let searchTimer = 0;
  doc.addEventListener("input", e => {
    const input = e.target as HTMLInputElement;
    if (!input.matches?.("[data-predictive-input]") || !api.search) return;
    win.clearTimeout(searchTimer);
    searchTimer = win.setTimeout(() => {
      const box = input.closest("[data-search-modal]")?.querySelector<HTMLElement>("[data-predictive]");
      if (!box) return;
      const q = input.value.trim();
      if (!q) { box.innerHTML = ""; return; }
      const results = api.search!(q);
      const esc = (v: unknown) => String(v ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
      const group = (kind: string, title: string) => {
        const rows = results.filter(r => r.kind === kind);
        return rows.length ? `<div class="predictive__group"><h3>${title}</h3>${rows.map(r => `<a class="predictive__item" href="${esc(r.url)}">${kind === "product" ? `<span class="predictive__img">${r.image ? `<img src="${esc(r.image)}" alt="" loading="lazy">` : ""}</span>` : ""}<span class="predictive__title">${esc(r.title)}</span>${r.price ? `<span class="predictive__price">${esc(r.price)}</span>` : ""}</a>`).join("")}</div>` : "";
      };
      box.innerHTML = `${group("product", "Products")}<div class="predictive__side">${group("collection", "Collections")}${group("page", "Pages")}</div>
<a class="predictive__all" href="/search?q=${encodeURIComponent(q)}">${results.length ? "Search for" : "No quick matches. Search for"} “${esc(q)}” →</a>`;
    }, 120);
  });

  doc.addEventListener("keydown", e => { if (e.key === "Escape") { setCart(false); const m = $("[data-search-modal]"); if (m) m.hidden = true; } });

  /* slideshows, announcements, countdowns: one timer that re-reads the DOM each tick */
  function goTo(show: HTMLElement, i: number) {
    $$(".slideshow__slide", show).forEach((s, n) => s.classList.toggle("is-active", n === i));
    $$(".slideshow__dot", show).forEach((s, n) => s.classList.toggle("is-active", n === i));
  }
  let tick = 0;
  const timer = win.setInterval(() => {
    tick++;
    for (const show of $$("[data-slideshow][data-autoplay]")) {
      if (show.dataset.paused) continue;
      const every = Number(show.dataset.autoplay) || 5;
      if (tick % every) continue;
      const slides = $$(".slideshow__slide", show), cur = slides.findIndex(s => s.classList.contains("is-active"));
      goTo(show, (cur + 1) % slides.length);
    }
    for (const bar of $$("[data-rotate]")) {
      if (tick % (Number(bar.dataset.rotate) || 5)) continue;
      const slides = $$(".announcement__slide", bar), cur = slides.findIndex(s => !s.hidden);
      slides.forEach((s, n) => { s.hidden = n !== (cur + 1) % slides.length; });
    }
    updateCountdowns();
  }, 1000);
  function updateCountdowns() {
    for (const c of $$("[data-countdown]")) {
      const end = new Date(c.dataset.countdown!).getTime(), left = Math.max(0, end - Date.now());
      if (!left && c.dataset.ended && !c.dataset.done) {
        c.dataset.done = "1";
        const box = $(".countdown", c); if (box) box.outerHTML = `<p>${c.dataset.ended.replace(/[<>&]/g, "")}</p>`;
        continue;
      }
      const parts: Record<string, number> = { d: Math.floor(left / 864e5), h: Math.floor(left / 36e5) % 24, m: Math.floor(left / 6e4) % 60, s: Math.floor(left / 1e3) % 60 };
      for (const [k, v] of Object.entries(parts)) { const n = $(`[data-cd="${k}"]`, c); if (n) n.textContent = String(v).padStart(2, "0"); }
    }
  }

  /* sticky header that hides on scroll down */
  let lastY = 0;
  const onScroll = () => {
    const h = $("[data-sticky='scroll-up']"), y = win.scrollY;
    if (h) h.classList.toggle("is-hidden", y > lastY && y > 200);
    lastY = y;
  };
  win.addEventListener("scroll", onScroll, { passive: true });

  /* reveal on scroll */
  const io = "IntersectionObserver" in win ? new win.IntersectionObserver(entries => {
    for (const en of entries) if (en.isIntersecting) { en.target.classList.add("is-visible"); io?.unobserve(en.target); }
  }, { rootMargin: "0px 0px -60px 0px" }) : null;

  function refresh() {
    for (const el of $$("[data-reveal]:not(.is-visible)")) io ? io.observe(el) : el.classList.add("is-visible");
    if (cartOpen) setCart(true);
    updateCountdowns();
  }
  refresh();

  return {
    refresh,
    openCart: () => setCart(true),
    closeCart: () => setCart(false),
    destroy() { win.clearInterval(timer); win.removeEventListener("scroll", onScroll); io?.disconnect(); },
  };
}
