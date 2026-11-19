/**
 * Storefront interactivity, shared by the live store and the editor preview. Everything uses
 * event delegation on the document, so it keeps working when sections are re-rendered.
 */
export interface StoreApi {
  addToCart(productId: string, quantity: number): Promise<void> | void;
  setQuantity(productId: string, quantity: number): Promise<void> | void;
  checkout(provider: "stripe" | "paypal", opts: { discountCode?: string; note?: string }): Promise<void>;
  buyNow(productId: string, quantity: number): Promise<void>;
  discount(code: string): Promise<string>;           // resolves to a message to show
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

    if ((b = el("[data-add-to-cart]"))) {
      e.preventDefault();
      const id = b.dataset.addToCart!;
      busy(b as HTMLButtonElement, async () => { await api.addToCart(id, qtyFor(b!)); if ($("[data-cart-drawer]")) setCart(true); });
      return;
    }
    if ((b = el("[data-buy-now]"))) { e.preventDefault(); const id = b.dataset.buyNow!; busy(b as HTMLButtonElement, () => api.buyNow(id, qtyFor(b!))); return; }
    if ((b = el("[data-open-cart]")) && $("[data-cart-drawer]")) { e.preventDefault(); setCart(true); return; }
    if (el("[data-close-cart]")) { e.preventDefault(); setCart(false); return; }
    if ((b = el("[data-qty-minus],[data-qty-plus]"))) {
      const input = b.closest("[data-qty]")?.querySelector<HTMLInputElement>("input");
      if (input) input.value = String(Math.max(1, (Number(input.value) || 1) + (b.hasAttribute("data-qty-plus") ? 1 : -1)));
      return;
    }
    if ((b = el("[data-line-qty]"))) {
      const id = b.dataset.lineQty!, input = $<HTMLInputElement>(`[data-line-input="${CSS.escape(id)}"]`, b.closest(".cart-line")!);
      api.setQuantity(id, Math.max(0, (Number(input?.value) || 0) + Number(b.dataset.delta)));
      return;
    }
    if ((b = el("[data-line-remove]"))) { api.setQuantity(b.dataset.lineRemove!, 0); return; }
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
      const u = new URL(win.location.href);
      const v = (t as HTMLSelectElement).value;
      if (v === "manual") u.searchParams.delete("sort"); else u.searchParams.set("sort", v);
      api.navigate(u.pathname + u.search);
    }
    if (t.matches("[data-line-input]")) api.setQuantity((t as HTMLInputElement).dataset.lineInput!, Math.max(0, Number((t as HTMLInputElement).value) || 0));
  });

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
