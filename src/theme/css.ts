import { fontStack } from "./fonts";
import type { ThemeDoc } from "./types";
import { bool, num, str } from "./util";

/** CSS variables from theme settings + one class per color scheme. Swapped live in the editor. */
export function themeVars(t: ThemeDoc) {
  const s = t.settings;
  const root = `:root{
--font-heading:${fontStack(s.font_heading)};--font-body:${fontStack(s.font_body)};
--heading-scale:${num(s.heading_scale, 100) / 100};--body-scale:${num(s.body_scale, 100) / 100};
--heading-weight:${str(s.heading_weight, "600")};--heading-case:${str(s.heading_case, "none")};--heading-spacing:${num(s.heading_spacing, 0) / 100}em;
--page-width:${num(s.page_width, 1300)}px;--section-gap:${num(s.section_spacing, 0)}px;--grid-gap:${num(s.grid_gap, 16)}px;
--btn-radius:${num(s.button_radius, 6)}px;--btn-border:${num(s.button_border, 1)}px;--btn-case:${str(s.button_case, "none")};
--btn-shadow:${bool(s.button_shadow) ? "0 4px 14px rgba(0,0,0,.15)" : "none"};
--input-radius:${num(s.input_radius, 6)}px;--input-border:${num(s.input_border, 1)}px;
--card-radius:${num(s.card_radius, 8)}px;--card-shadow:${bool(s.card_shadow) ? "0 6px 24px rgba(0,0,0,.08)" : "none"};--card-align:${str(s.card_align, "left")};
--sale-badge:${str(s.sale_badge_color, "#c0392b")};--logo-width:${num(s.logo_width, 120)}px;
}`;
  const schemes = Object.entries(t.colorSchemes).map(([id, c]) =>
    `.color-${id}{--bg:${c.background};--fg:${c.text};--accent:${c.accent};--btn-bg:${c.button};--btn-fg:${c.button_label};--btn2:${c.secondary_button};--border:${c.border};background:var(--bg);color:var(--fg)}`).join("\n");
  return `${root}\n${schemes}\n${str(s.custom_css)}`;
}

export const BASE_CSS = String.raw`
*,*::before,*::after{box-sizing:border-box}
[hidden]{display:none!important}
html{-webkit-text-size-adjust:100%;scroll-behavior:smooth}
body{margin:0;font-family:var(--font-body);font-size:calc(16px*var(--body-scale));line-height:1.6;background:var(--bg,#fff);color:var(--fg,#111);-webkit-font-smoothing:antialiased}
img{max-width:100%;display:block}
a{color:inherit}
button,input,select,textarea{font:inherit;color:inherit}
h1,h2,h3,h4,.h1,.h2,.h3{font-family:var(--font-heading);font-weight:var(--heading-weight);text-transform:var(--heading-case);letter-spacing:var(--heading-spacing);line-height:1.15;margin:0 0 .5em}
.h0{font-size:calc(clamp(2.4rem,6vw,4.6rem)*var(--heading-scale))}
h1,.h1{font-size:calc(clamp(2rem,4.5vw,3.4rem)*var(--heading-scale))}
h2,.h2{font-size:calc(clamp(1.6rem,3vw,2.4rem)*var(--heading-scale))}
h3,.h3{font-size:calc(1.2rem*var(--heading-scale))}
.hxs{font-size:calc(1rem*var(--heading-scale))}
p{margin:0 0 1em}
.rte>*:last-child{margin-bottom:0}
.rte a{color:var(--accent)}
.page-width{max-width:var(--page-width);margin:0 auto;padding:0 clamp(16px,4vw,48px)}
.page-width--narrow{max-width:780px}
.section{padding-top:var(--pt,36px);padding-bottom:var(--pb,36px)}
main>.shopify-section+.shopify-section,main>[data-yt-section]+[data-yt-section]{margin-top:var(--section-gap)}
.caption{font-size:.8rem;letter-spacing:.12em;text-transform:uppercase;opacity:.75;margin-bottom:.6em}
.subdued{opacity:.72}
.center{text-align:center}.left{text-align:left}.right{text-align:right}
.visually-hidden{position:absolute!important;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}
.title-row{display:flex;align-items:end;justify-content:space-between;gap:16px;margin-bottom:24px;flex-wrap:wrap}
.title-row h2{margin:0}

/* buttons */
.button{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:46px;padding:0 28px;border-radius:var(--btn-radius);border:var(--btn-border) solid var(--btn-bg);background:var(--btn-bg);color:var(--btn-fg);text-decoration:none;font-weight:600;font-size:.95rem;letter-spacing:.02em;text-transform:var(--btn-case);cursor:pointer;box-shadow:var(--btn-shadow);transition:transform .15s,opacity .15s}
.button:hover{opacity:.88}.button:active{transform:translateY(1px)}
.button--secondary{background:transparent;color:var(--btn2);border-color:var(--btn2)}
.button--small{min-height:36px;padding:0 16px;font-size:.85rem}
.button--full{width:100%}
.button[disabled]{opacity:.45;cursor:not-allowed}
.buttons{display:flex;flex-wrap:wrap;gap:12px;margin-top:20px}
.center .buttons,.buttons.center{justify-content:center}.right .buttons{justify-content:flex-end}
.link-arrow{font-weight:600;text-decoration:underline;text-underline-offset:4px}
.paypal-button{background:#ffc439;border-color:#ffc439;color:#111}

/* inputs */
.field{display:flex;flex-direction:column;gap:6px;margin-bottom:12px}
.input,.select,.textarea{width:100%;min-height:46px;padding:10px 14px;border:var(--input-border) solid color-mix(in srgb,var(--fg) 35%,transparent);border-radius:var(--input-radius);background:transparent}
.textarea{min-height:110px}
.input:focus,.select:focus,.textarea:focus{outline:2px solid color-mix(in srgb,var(--fg) 30%,transparent);outline-offset:1px}
.inline-form{display:flex;gap:8px;max-width:480px}
.center .inline-form{margin-left:auto;margin-right:auto}
.inline-form .input{flex:1}

/* media */
.media{position:relative;overflow:hidden;background:color-mix(in srgb,var(--fg) 6%,var(--bg));border-radius:inherit}
.media img{width:100%;height:100%;object-fit:cover}
.media:not([style]) img{height:auto}
.media--placeholder{display:grid;place-items:center;min-height:200px;color:var(--fg)}
.media--placeholder[style]{min-height:0}
.placeholder-svg{width:70%;height:70%;max-height:420px}

/* grid & cards */
.grid{display:grid;gap:calc(var(--grid-gap)*1.5) var(--grid-gap);grid-template-columns:repeat(var(--cols-m,2),minmax(0,1fr))}
@media(min-width:750px){.grid{grid-template-columns:repeat(var(--cols,4),minmax(0,1fr))}}
.slider-mobile{}
@media(max-width:749px){.slider-mobile{display:flex;overflow-x:auto;scroll-snap-type:x mandatory;padding-bottom:8px}.slider-mobile>*{flex:0 0 72%;scroll-snap-align:start}}
.card{position:relative;text-align:var(--card-align);border-radius:var(--card-radius);transition:transform .25s}
.card__link{position:absolute;inset:0;z-index:1}
.card__media{position:relative;border-radius:var(--card-radius);overflow:hidden}
.card__media .media img{transition:transform .5s}
.card__second{position:absolute;inset:0;opacity:0;transition:opacity .35s}
.card__second .media{height:100%}
.card:hover .card__second{opacity:1}
.hover-lift .card:hover{transform:translateY(-4px)}
.hover-zoom .card:hover .card__media img{transform:scale(1.05)}
.card--card{background:color-mix(in srgb,var(--fg) 4%,var(--bg));padding:10px;box-shadow:var(--card-shadow)}
.card--standard .card__media{box-shadow:var(--card-shadow)}
.card__info{padding:12px 2px 4px}
.card__title{font-family:var(--font-body);font-size:1rem;font-weight:500;letter-spacing:0;text-transform:none;margin:0 0 4px}
.card__quick{position:relative;z-index:2;margin-top:10px;width:100%}
.card--minimal .card__info{padding-top:8px}
.badge{position:absolute;z-index:2;font-size:.75rem;font-weight:600;padding:3px 10px;border-radius:40px;background:var(--sale-badge);color:#fff}
.badge.top-left{top:10px;left:10px}.badge.top-right{top:10px;right:10px}.badge.bottom-left{bottom:10px;left:10px}
.badge--sold{background:var(--fg);color:var(--bg)}
.price{display:flex;gap:8px;align-items:baseline;flex-wrap:wrap}
.card .price{justify-content:var(--card-align)}
.price__compare{opacity:.6;font-size:.9em}
.price--sale .price__current{color:var(--sale-badge)}
.price--large{font-size:1.25rem}

/* reveal */
.reveal [data-reveal]{opacity:0;transform:translateY(24px);transition:opacity .7s ease,transform .7s ease}
.reveal [data-reveal].is-visible{opacity:1;transform:none}

/* announcement */
.announcement{font-size:.85rem;text-align:center;padding:10px 0;position:relative}
.announcement__slides{display:grid}
.announcement__slide{grid-area:1/1;transition:opacity .4s;margin:0}
.announcement__slide[hidden]{display:block!important;opacity:0;pointer-events:none}
.announcement a{text-decoration:underline;text-underline-offset:3px}
.announcement .social{position:absolute;right:clamp(16px,4vw,48px);top:50%;transform:translateY(-50%)}
@media(max-width:749px){.announcement .social{display:none}}

/* header */
.site-header{position:relative;z-index:40;border-bottom:1px solid transparent}
.site-header.has-border{border-bottom-color:var(--border)}
.site-header.is-sticky{position:sticky;top:0}
.site-header.is-hidden{transform:translateY(-100%)}
.site-header{transition:transform .3s}
.header{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:16px;min-height:72px}
.header--left{grid-template-columns:auto 1fr auto}
.header--left .header__nav{justify-self:start;padding-left:24px}
.header--center .header__logo{grid-column:2;justify-self:center}
.header--center .header__nav{grid-column:1;grid-row:1;justify-self:start}
.header__logo{font-family:var(--font-heading);font-size:1.45rem;font-weight:var(--heading-weight);text-decoration:none;display:flex;align-items:center;margin:0}
.header__logo img{width:var(--logo-width);height:auto}
.header__nav ul{list-style:none;margin:0;padding:0;display:flex;gap:24px;flex-wrap:wrap}
.header__nav a,.header__nav summary{text-decoration:none;font-size:.95rem;cursor:pointer;list-style:none;display:flex;align-items:center;gap:4px}
.header__nav summary::-webkit-details-marker{display:none}
.header__nav summary svg{width:14px}
.header__nav a:hover{text-decoration:underline;text-underline-offset:5px}
.header__nav details{position:relative}
.header__nav details>ul{position:absolute;top:calc(100% + 12px);left:-16px;min-width:200px;flex-direction:column;gap:10px;padding:16px;background:var(--bg);border:1px solid var(--border);border-radius:8px;box-shadow:0 10px 30px rgba(0,0,0,.08)}
.header__icons{display:flex;justify-content:flex-end;align-items:center;gap:6px}
.icon-btn{display:inline-grid;place-items:center;width:42px;height:42px;border:0;background:none;cursor:pointer;position:relative;text-decoration:none;border-radius:50%}
.icon-btn:hover{background:color-mix(in srgb,var(--fg) 7%,transparent)}
.icon-btn svg{width:22px;height:22px}
.cart-count{position:absolute;top:3px;right:1px;min-width:18px;height:18px;padding:0 5px;border-radius:9px;background:var(--btn-bg);color:var(--btn-fg);font-size:.68rem;font-weight:700;display:grid;place-items:center}
.menu-drawer-toggle{display:none}
.menu-drawer{display:none}
@media(max-width:749px){
 .header,.header--left,.header--center{grid-template-columns:auto 1fr auto}
 .header__nav{display:none}
 .menu-drawer,.menu-drawer-toggle{display:inline-grid}
 .header .header__logo{grid-column:2;justify-self:center}
 .header--left .header__logo{justify-self:start}
}
.menu-drawer summary{list-style:none}
.menu-drawer__panel{position:fixed;inset:0 20% 0 0;max-width:380px;background:var(--bg);z-index:60;padding:24px;overflow:auto;box-shadow:0 0 40px rgba(0,0,0,.2)}
.menu-drawer__panel ul{list-style:none;padding:0;margin:24px 0}
.menu-drawer__panel li a{display:block;padding:10px 0;font-size:1.2rem;text-decoration:none;border-bottom:1px solid var(--border)}
.menu-drawer__panel ul ul{margin:0 0 0 14px}
.menu-drawer__panel ul ul a{font-size:1rem}
.search-modal{position:fixed;inset:0 0 auto 0;z-index:70;background:var(--bg);padding:24px 0;border-bottom:1px solid var(--border);box-shadow:0 12px 30px rgba(0,0,0,.1)}
.search-modal[hidden]{display:none}
.predictive{display:grid;gap:8px 32px;margin-top:16px;max-height:70vh;overflow:auto}
.predictive:empty{display:none}
@media(min-width:750px){.predictive{grid-template-columns:2fr 1fr}.predictive__all{grid-column:1/-1}}
.predictive__group h3{font-family:var(--font-body);font-size:.75rem;letter-spacing:.1em;text-transform:uppercase;opacity:.6;margin:8px 0}
.predictive__item{display:flex;align-items:center;gap:12px;padding:8px;border-radius:8px;text-decoration:none}
.predictive__item:hover,.predictive__item:focus{background:color-mix(in srgb,var(--fg) 6%,transparent)}
.predictive__img{width:48px;height:48px;border-radius:6px;overflow:hidden;flex-shrink:0;background:color-mix(in srgb,var(--fg) 6%,var(--bg))}
.predictive__img img{width:100%;height:100%;object-fit:cover}
.predictive__title{flex:1}.predictive__price{font-size:.9rem;opacity:.8}
.predictive__all{display:block;padding:12px 8px;border-top:1px solid var(--border);font-weight:600;text-decoration:none}
.search-modal form{display:flex;gap:8px;align-items:center}
.overlay{position:fixed;inset:0;background:rgba(0,0,0,.4);z-index:55}

/* banners */
.banner{position:relative;display:grid;overflow:hidden}
.banner>*{grid-area:1/1}
.banner__media{position:relative;z-index:0}
.banner__media .media{height:100%;border-radius:0}
.banner__media .media img{height:100%}
.banner--small{min-height:320px}.banner--medium{min-height:480px}.banner--large{min-height:680px}.banner--full{min-height:100vh}
.banner--adapt .banner__media .media img{height:auto}
.banner__overlay{z-index:1;background:#000;pointer-events:none}
.banner__content{position:relative;z-index:2;display:flex;padding:clamp(24px,5vw,64px)}
.banner__box{max-width:640px}
.banner__box.has-box{background:var(--bg);color:var(--fg);padding:clamp(24px,4vw,48px);border-radius:calc(var(--card-radius)*1.5)}
.banner__box:not(.has-box){color:#fff}
.banner__box:not(.has-box) .button{--btn-bg:#fff;--btn-fg:#111;--btn2:#fff}
.pos-top-left{align-items:flex-start;justify-content:flex-start}.pos-top-center{align-items:flex-start;justify-content:center}.pos-top-right{align-items:flex-start;justify-content:flex-end}
.pos-middle-left{align-items:center;justify-content:flex-start}.pos-middle-center{align-items:center;justify-content:center}.pos-middle-right{align-items:center;justify-content:flex-end}
.pos-bottom-left{align-items:flex-end;justify-content:flex-start}.pos-bottom-center{align-items:flex-end;justify-content:center}.pos-bottom-right{align-items:flex-end;justify-content:flex-end}
@media(max-width:749px){.banner--stack-mobile{display:block}.banner--stack-mobile .banner__content{padding:24px 16px}.banner--stack-mobile .banner__box{color:var(--fg)}.banner--stack-mobile .banner__overlay{display:none}.banner--stack-mobile .banner__box:not(.has-box) .button{--btn-bg:inherit;--btn-fg:inherit;--btn2:inherit}}

/* slideshow */
.slideshow{position:relative}
.slideshow__track{display:grid}
.slideshow__slide{grid-area:1/1;transition:opacity .6s}
.slideshow__slide:not(.is-active){opacity:0;pointer-events:none}
.slideshow__controls{display:flex;justify-content:center;align-items:center;gap:12px;padding:12px}
.slideshow__dot{width:10px;height:10px;border-radius:50%;border:1px solid currentColor;background:transparent;padding:0;cursor:pointer}
.slideshow__dot.is-active{background:currentColor}
.slideshow__arrow{width:34px;height:34px;border:0;background:none;cursor:pointer;display:grid;place-items:center}
.slideshow__arrow svg{width:20px}

/* image with text */
.iwt{display:grid;gap:clamp(24px,5vw,64px);align-items:center}
@media(min-width:750px){.iwt{grid-template-columns:1fr 1fr}.iwt--right .iwt__media{order:2}}
.iwt__media{border-radius:var(--card-radius);overflow:hidden}
.iwt__media.h-small .media{aspect-ratio:4/3}.iwt__media.h-medium .media{aspect-ratio:1/1}.iwt__media.h-large .media{aspect-ratio:4/5}
.iwt__content.has-box{background:color-mix(in srgb,var(--fg) 5%,var(--bg));padding:clamp(24px,4vw,56px);border-radius:var(--card-radius)}
.iwt__content.v-top{align-self:start}.iwt__content.v-bottom{align-self:end}

/* multicolumn */
.multicolumn .grid{--cols-m:1}
.column{display:flex;flex-direction:column;gap:12px}
.column--bg{background:color-mix(in srgb,var(--fg) 5%,var(--bg));padding:24px;border-radius:var(--card-radius)}
.column__media{border-radius:var(--card-radius);overflow:hidden}
.column__media.w-third{width:33%}.column__media.w-half{width:50%}
.center .column__media{margin:0 auto}
.column__icon svg{width:36px;height:36px}
.center .column__icon{margin:0 auto}
.column h3{margin:0}

/* product */
.product{display:grid;gap:clamp(24px,5vw,64px)}
@media(min-width:750px){.product{grid-template-columns:var(--media-w,55%) 1fr}.product--right .product__media{order:2}}
.product__media{display:grid;gap:10px;align-content:start;min-width:0}
.gallery__slides{display:grid;gap:10px}
.gallery__slide{position:relative;border-radius:var(--card-radius);overflow:hidden}
.gallery[data-zoomable] .gallery__slide{cursor:zoom-in}
.gallery--thumbnails .gallery__slide:not(.is-active){display:none}
.gallery--stacked .gallery__slides{grid-template-columns:1fr 1fr}
.gallery--stacked .gallery__slide:first-child{grid-column:1/-1}
.gallery__thumbs{display:grid;grid-template-columns:repeat(auto-fill,minmax(64px,1fr));gap:8px}
.gallery__thumb{padding:0;border:1px solid var(--border);border-radius:calc(var(--card-radius)/2);overflow:hidden;cursor:pointer;background:none;aspect-ratio:1/1;opacity:.7}
.gallery__thumb img{width:100%;height:100%;object-fit:cover}
.gallery__thumb.is-active,.gallery__thumb:hover{opacity:1;border-color:var(--fg)}
.gallery__dots{display:none;justify-content:center;gap:6px}
.gallery__dots span{width:6px;height:6px;border-radius:50%;background:currentColor;opacity:.25}
.gallery__dots span.is-active{opacity:.9}
@media(max-width:749px){
 .gallery__slides,.gallery--stacked .gallery__slides{display:flex;overflow-x:auto;scroll-snap-type:x mandatory;gap:8px;scrollbar-width:none}
 .gallery__slides::-webkit-scrollbar{display:none}
 .gallery__slide,.gallery--thumbnails .gallery__slide:not(.is-active){display:block;flex:0 0 100%;scroll-snap-align:center}
 .gallery__thumbs{display:none}.gallery__dots{display:flex}
}
.lightbox{position:fixed;inset:0;z-index:200;background:rgba(0,0,0,.92);display:flex;align-items:center;justify-content:center}
.lightbox img{max-width:92vw;max-height:88vh;object-fit:contain;cursor:zoom-out}
.lightbox button{position:absolute;border:0;background:rgba(255,255,255,.12);color:#fff;width:44px;height:44px;border-radius:50%;display:grid;place-items:center;cursor:pointer}
.lightbox button:hover{background:rgba(255,255,255,.25)}.lightbox button svg{width:22px}
.lightbox [data-lb-close]{top:16px;right:16px}.lightbox [data-lb-prev]{left:16px;top:50%}.lightbox [data-lb-next]{right:16px;top:50%}
.lightbox__count{position:absolute;bottom:18px;left:0;right:0;text-align:center;color:#fff;font-size:.85rem;opacity:.75}
.product__media .media{border-radius:var(--card-radius)}
.product__info{display:flex;flex-direction:column;gap:18px;align-self:start}
@media(min-width:750px){.product__info.is-sticky{position:sticky;top:96px}}
.product__info>*{margin:0}
.product__title{margin:0}
.qty{display:inline-flex;align-items:center;border:var(--input-border) solid color-mix(in srgb,var(--fg) 35%,transparent);border-radius:var(--input-radius);height:46px}
.qty button{width:42px;height:100%;border:0;background:none;cursor:pointer;display:grid;place-items:center}
.qty button svg{width:16px}
.qty input{width:44px;text-align:center;border:0;background:none;-moz-appearance:textfield}
.qty input::-webkit-inner-spin-button{-webkit-appearance:none}
.variant-picker{display:flex;flex-direction:column;gap:14px}
.variant-picker__group{border:0;margin:0;padding:0}
.variant-picker__label{display:block;font-size:.85rem;margin-bottom:8px;opacity:.85}
.variant-picker .select{width:auto;min-width:200px}
.pills{display:flex;flex-wrap:wrap;gap:8px}
.pill{position:relative;cursor:pointer}
.pill input{position:absolute;opacity:0;width:1px;height:1px}
.pill span{display:inline-flex;align-items:center;min-height:40px;padding:0 18px;border:var(--input-border) solid color-mix(in srgb,var(--fg) 30%,transparent);border-radius:40px;font-size:.92rem;transition:background .15s,color .15s}
.pill:hover span{border-color:var(--fg)}
.pill input:checked+span{background:var(--fg);color:var(--bg);border-color:var(--fg)}
.pill input:focus-visible+span{outline:2px solid var(--accent);outline-offset:2px}
.pill--soldout span{text-decoration:line-through;opacity:.5}
.cart-line__variant{font-size:.85rem;opacity:.75}
.buy-buttons{display:flex;flex-direction:column;gap:10px}
.inventory-note{font-size:.9rem;display:flex;align-items:center;gap:8px}
.inventory-note::before{content:"";width:8px;height:8px;border-radius:50%;background:#2e9e5b}
.inventory-note.low::before{background:#e0a100}.inventory-note.out::before{background:#c0392b}
.accordion{border-top:1px solid var(--border)}
.accordion:last-child{border-bottom:1px solid var(--border)}
.accordion summary{display:flex;align-items:center;gap:10px;padding:16px 0;cursor:pointer;list-style:none;font-weight:500}
.accordion summary::-webkit-details-marker{display:none}
.accordion summary .chev{margin-left:auto;width:18px;transition:transform .2s}
.accordion[open] summary .chev{transform:rotate(180deg)}
.accordion summary .ico svg{width:20px;height:20px}
.accordion__content{padding:0 0 18px}
.share{display:flex;gap:10px;align-items:center;font-size:.9rem}
.share button{border:0;background:none;text-decoration:underline;cursor:pointer;padding:0}
.trust{display:flex;flex-direction:column;gap:8px;font-size:.92rem}
.trust div{display:flex;gap:8px;align-items:center}.trust svg{width:20px;height:20px}

/* collection */
.collection-toolbar{display:flex;justify-content:flex-start;align-items:center;gap:12px;margin-bottom:24px;flex-wrap:wrap;font-size:.9rem}
.collection-toolbar .select{min-height:38px;padding:6px 12px;width:auto}
.empty-state{padding:48px 0;text-align:center}
.collection{display:grid;gap:32px}
@media(min-width:750px){.collection--vertical{grid-template-columns:220px minmax(0,1fr)}}
.collection__main{min-width:0}
.collection--horizontal .facets{display:flex;flex-wrap:wrap;gap:12px}
.collection--horizontal .facet{border:1px solid var(--border);border-radius:var(--input-radius);position:relative}
.collection--horizontal .facet summary{padding:8px 14px}
.collection--horizontal .facet[open] .facet__body{position:absolute;z-index:20;top:calc(100% + 6px);left:0;min-width:240px;background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:14px;box-shadow:0 10px 30px rgba(0,0,0,.1)}
.facet{border-bottom:1px solid var(--border)}
.facet summary{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:14px 0;cursor:pointer;list-style:none;font-weight:500;font-size:.95rem}
.facet summary::-webkit-details-marker{display:none}
.facet summary .chev{width:16px;transition:transform .2s}.facet[open] summary .chev{transform:rotate(180deg)}
.facet__body{padding:0 0 14px;display:flex;flex-direction:column;gap:8px}
.facet__check{display:flex;align-items:center;gap:8px;font-size:.92rem;cursor:pointer}
.facet__check input{width:16px;height:16px;accent-color:var(--fg)}
.facet__check input:disabled+span{opacity:.45}
.facet__price{display:flex;align-items:center;gap:8px}.facet__price .input{min-height:38px;padding:6px 10px}
.facets-toggle{display:none}
@media(max-width:749px){.facets-toggle{display:inline-flex}.collection .facets{display:none}.collection .facets.is-open{display:block}.collection--horizontal .facets.is-open{display:flex}}
.chips{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin:-8px 0 20px}
.chip{display:inline-flex;gap:6px;align-items:center;padding:4px 12px;border:1px solid var(--border);border-radius:40px;font-size:.85rem;text-decoration:none}
.chip:hover{border-color:var(--fg)}
.sort-by{display:flex;align-items:center;gap:8px;margin-left:auto}
.pagination{display:flex;justify-content:center;align-items:center;gap:6px;margin-top:40px}
.pagination a,.pagination span{min-width:40px;height:40px;display:grid;place-items:center;border-radius:var(--input-radius);text-decoration:none}
.pagination a:hover{background:color-mix(in srgb,var(--fg) 7%,transparent)}
.pagination span[aria-current]{border:1px solid var(--fg);font-weight:600}
.pagination svg{width:18px}

/* cart */
.cart-lines{width:100%;border-collapse:collapse}
.cart-line{display:grid;grid-template-columns:96px 1fr auto;gap:16px;padding:18px 0;border-bottom:1px solid var(--border);align-items:center}
.cart-line .media{border-radius:calc(var(--card-radius)/2);aspect-ratio:1/1}
.cart-line__title{font-weight:500;text-decoration:none}
.cart-line__remove{border:0;background:none;text-decoration:underline;cursor:pointer;font-size:.85rem;padding:0;opacity:.7}
.cart-summary{display:flex;flex-direction:column;gap:12px;max-width:420px;margin-left:auto;margin-top:24px}
.cart-summary__row{display:flex;justify-content:space-between;font-size:1.1rem}
.cart-error{color:#c0392b;font-size:.9rem}
.free-ship{font-size:.9rem}
.free-ship__bar{height:6px;background:color-mix(in srgb,var(--fg) 12%,transparent);border-radius:3px;overflow:hidden;margin-top:6px}
.free-ship__bar span{display:block;height:100%;background:var(--accent)}
.cart-drawer{position:fixed;top:0;right:0;bottom:0;width:min(420px,92vw);z-index:80;display:flex;flex-direction:column;transform:translateX(100%);transition:transform .3s;box-shadow:-10px 0 40px rgba(0,0,0,.15)}
.cart-drawer.is-open{transform:none}
.cart-drawer__head{display:flex;justify-content:space-between;align-items:center;padding:18px 24px;border-bottom:1px solid var(--border)}
.cart-drawer__head h2{margin:0;font-size:1.3rem}
.cart-drawer__body{flex:1;overflow:auto;padding:0 24px}
.cart-drawer__foot{padding:18px 24px;border-top:1px solid var(--border);display:flex;flex-direction:column;gap:10px}
.cart-drawer .cart-line{grid-template-columns:72px 1fr auto}
.cart-drawer-overlay{position:fixed;inset:0;background:rgba(0,0,0,.4);z-index:79;opacity:0;pointer-events:none;transition:opacity .3s}
.cart-drawer-overlay.is-open{opacity:1;pointer-events:auto}

/* misc sections */
.faq{max-width:900px;margin:0 auto}
.faq--split{display:grid;gap:40px;max-width:none}
@media(min-width:990px){.faq--split{grid-template-columns:1fr 2fr}}
.testimonials .grid{--cols-m:1}
.testimonial{padding:28px;border-radius:var(--card-radius);background:color-mix(in srgb,var(--fg) 5%,var(--bg));display:flex;flex-direction:column;gap:14px}
.stars{display:flex;gap:2px;color:var(--accent)}.stars svg{width:16px}
.testimonial blockquote{margin:0;font-size:1.1rem;line-height:1.5}
.testimonial__author{display:flex;align-items:center;gap:10px;font-weight:600;font-size:.92rem}
.testimonial__author .media{width:40px;height:40px;border-radius:50%;min-height:0}
.logos{display:flex;flex-wrap:wrap;justify-content:center;align-items:center;gap:clamp(24px,5vw,64px)}
.logos img{max-height:var(--logo-h,48px);width:auto;filter:var(--logo-filter,none);opacity:.9}
.logos .media--placeholder{width:120px;height:48px;min-height:0;border-radius:6px}
.marquee{overflow:hidden;white-space:nowrap;display:flex}
.marquee__track{display:flex;flex-shrink:0;gap:48px;padding-right:48px;animation:marquee var(--speed,30s) linear infinite}
.marquee--reverse .marquee__track{animation-direction:reverse}
.marquee__item{font-family:var(--font-heading);font-size:var(--size,2rem);display:flex;align-items:center;gap:48px}
.marquee__item::after{content:"✦";font-size:.6em;opacity:.6}
@keyframes marquee{to{transform:translateX(-100%)}}
@media(prefers-reduced-motion:reduce){.marquee__track{animation:none}}
.countdown{display:flex;justify-content:center;gap:clamp(12px,3vw,32px);margin:24px 0}
.countdown__unit{display:flex;flex-direction:column;align-items:center;min-width:72px}
.countdown__num{font-family:var(--font-heading);font-size:calc(clamp(2rem,6vw,3.6rem)*var(--heading-scale));line-height:1;font-variant-numeric:tabular-nums}
.countdown__label{font-size:.75rem;letter-spacing:.12em;text-transform:uppercase;opacity:.7;margin-top:6px}
.video{position:relative;aspect-ratio:16/9;border-radius:var(--card-radius);overflow:hidden;background:#000}
.video iframe,.video video{position:absolute;inset:0;width:100%;height:100%;border:0}
.video__cover{position:absolute;inset:0;border:0;padding:0;cursor:pointer;background:none}
.video__cover .media{height:100%;border-radius:0}
.video__play{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:72px;height:72px;border-radius:50%;background:rgba(255,255,255,.92);color:#111;display:grid;place-items:center}
.video__play svg{width:28px;margin-left:4px}
.divider{border:0;border-top:1px solid var(--border);margin:0}
.contact-form{max-width:720px;margin:0 auto}
.contact-form .row{display:grid;gap:12px}
@media(min-width:750px){.contact-form .row{grid-template-columns:1fr 1fr}}
.form-status{padding:12px 16px;border-radius:var(--input-radius);background:color-mix(in srgb,var(--accent) 15%,transparent);margin-bottom:16px}
.collage{display:grid;gap:var(--grid-gap)}
@media(min-width:750px){.collage{grid-template-columns:2fr 1fr;grid-auto-rows:minmax(200px,auto)}.collage>*:first-child{grid-row:span 2}.collage--right>*:first-child{order:2}}
.collage .media{height:100%;border-radius:var(--card-radius)}

/* footer */
.footer{font-size:.92rem}
.footer__blocks{display:grid;gap:32px;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));padding-bottom:40px}
.footer h2{font-size:1rem;font-family:var(--font-body);font-weight:600;letter-spacing:.02em;text-transform:none}
.footer ul{list-style:none;padding:0;margin:0;display:flex;flex-direction:column;gap:8px}
.footer a{text-decoration:none;opacity:.85}.footer a:hover{opacity:1;text-decoration:underline}
.footer__bottom{display:flex;justify-content:space-between;align-items:center;gap:16px;flex-wrap:wrap;padding-top:24px;border-top:1px solid var(--border);font-size:.8rem}
.social{display:flex;gap:4px;flex-wrap:wrap}
.social__link{width:36px;height:36px;display:grid;place-items:center;opacity:.85}
.social__link svg{width:20px;height:20px}
.payment-icons{display:flex;gap:6px;flex-wrap:wrap}
.payment-icons span{border:1px solid var(--border);border-radius:4px;padding:2px 8px;font-size:.72rem;font-weight:700;letter-spacing:.04em}
.footer .inline-form{margin-top:12px}

/* editor-only */
.yt-empty{padding:40px;text-align:center;border:1px dashed color-mix(in srgb,var(--fg) 30%,transparent);border-radius:8px;font-size:.9rem;opacity:.7}
`;
