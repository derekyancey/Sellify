import type { LucideIcon } from "lucide-react";
import { BarChart3, Box, Globe, Home, Landmark, Megaphone, FileImage, Percent, Rocket, Search, ShoppingCart, Store, Users } from "lucide-react";

/** A page that isn't built yet: which free / open-source tool (or custom build) we'll use. */
export interface Planned { what: string; approach: string; links?: { label: string; href: string }[] }
export interface NavChild { to: string; label: string; planned?: Planned }
export interface NavItem { to: string; label: string; icon: LucideIcon; end?: boolean; children?: NavChild[]; planned?: Planned }
export interface NavGroup { group?: string; items: NavItem[] }

export const NAV: NavGroup[] = [
  { items: [
    { to: "/", label: "Home", icon: Home, end: true },
    { to: "/orders", label: "Orders", icon: ShoppingCart, children: [
      { to: "/orders/drafts", label: "Drafts" },
      { to: "/orders/abandoned", label: "Abandoned checkouts" },
      { to: "/orders/shipping-labels", label: "Shipping labels", planned: {
        what: "Buy and print discounted USPS/UPS/FedEx labels from an order, and email the tracking number.",
        approach: "Shippo or EasyPost APIs: no monthly fee, you pay per label. Called from the site-ops Python function; tracking goes into the existing shipping email.",
        links: [{ label: "Shippo API", href: "https://docs.goshippo.com" }, { label: "EasyPost API", href: "https://docs.easypost.com" }] } },
    ] },
    { to: "/products", label: "Products", icon: Box, children: [
      { to: "/products/collections", label: "Collections" },
      { to: "/products/inventory", label: "Inventory" },
      { to: "/products/gift-cards", label: "Gift cards", planned: {
        what: "Sell and redeem gift cards at checkout.",
        approach: "Custom: a gift card is a product whose paid order issues a code in a giftCards table; checkout redeems it like a discount with a running balance. No third-party cost." } },
      { to: "/products/purchase-orders", label: "Purchase orders", planned: {
        what: "Order stock from suppliers and receive it into inventory.",
        approach: "Custom tables (suppliers, purchaseOrders) in Appwrite; receiving a PO increments inventory. PDF export via the browser's print-to-PDF." } },
      { to: "/products/transfers", label: "Transfers", planned: {
        what: "Move stock between locations.",
        approach: "Custom: add a locations table and per-location stock; only worth it once you have more than one stock location." } },
    ] },
    { to: "/customers", label: "Customers", icon: Users, children: [
      { to: "/customers/segments", label: "Segments" },
      { to: "/customers/companies", label: "Companies", planned: {
        what: "B2B accounts with multiple buyers, net terms and price lists.",
        approach: "Custom: a companies table linked to customers, plus per-company discount rules reused from Discounts." } },
    ] },
    { to: "/marketing/campaigns", label: "Marketing", icon: Megaphone, children: [
      { to: "/marketing/campaigns", label: "Campaigns" },
      { to: "/marketing/designer", label: "Email designer" },
      { to: "/marketing/automations", label: "Automations" },
      { to: "/marketing/attribution", label: "Attribution", planned: {
        what: "Which channels and campaigns drive sales.",
        approach: "Free: UTM tags on campaign links + GA4 source/medium reports (already connected), joined with Yancey orders by date." } },
    ] },
    { to: "/discounts", label: "Discounts", icon: Percent },
    { to: "/content/files", label: "Content", icon: FileImage, children: [
      { to: "/content/files", label: "Files" },
      { to: "/content/blog", label: "Blog & pages", planned: {
        what: "Write blog posts and pages for your sites.",
        approach: "Decap CMS (open source, Git-based, made for Netlify) edits Markdown in each site's repo; Netlify rebuilds on save.",
        links: [{ label: "Decap CMS", href: "https://decapcms.org" }] } },
      { to: "/content/menus", label: "Menus", planned: {
        what: "Edit navigation menus without touching code.",
        approach: "Custom: a menus table read by yancey.js (Yancey.menu('main')), so storefronts render it at runtime." } },
    ] },
  ] },
  { group: "Insights", items: [
    { to: "/analytics", label: "Analytics", icon: BarChart3 },
    { to: "/seo", label: "SEO", icon: Search },
    { to: "/finance", label: "Finance", icon: Landmark, planned: {
      what: "Balances, payouts, fees and taxes collected across Stripe and PayPal.",
      approach: "Read-only from the Stripe Balance/Payouts API and PayPal Reporting API via site-ops; CSV export for your accountant." } },
  ] },
  { group: "Sales channels", items: [
    { to: "/channels/online-store", label: "Online store", icon: Store },
    { to: "/channels/google", label: "Google & YouTube", icon: Globe },
    { to: "/channels/tiktok", label: "TikTok", icon: Globe },
    { to: "/channels/pos", label: "Point of sale", icon: Store, planned: {
      what: "Take in-person payments.",
      approach: "Stripe Terminal (pay per transaction, no monthly fee) or a 'Tap to Pay' phone; orders land in Yancey like online ones." } },
  ] },
  { group: "Infrastructure", items: [
    { to: "/domains", label: "Domain & DNS", icon: Globe },
    { to: "/deploys", label: "Deploys", icon: Rocket },
  ] },
];

export const plannedPages = NAV.flatMap(g => g.items.flatMap(i => [
  ...(i.planned ? [{ to: i.to, label: i.label, planned: i.planned }] : []),
  ...(i.children ?? []).filter(c => c.planned).map(c => ({ to: c.to, label: c.label, planned: c.planned! })),
]));
