import type { ThemeDoc } from "../theme/types";

export interface Base { $id: string; $createdAt: string }

export interface Site extends Base {
  name: string;
  domain?: string;             // e.g. example.com (optional: a store can be created before it has a URL)
  currency: string;            // ISO code, e.g. USD
  cloudflareZoneId?: string;
  hostingSiteId?: string;
  gscProperty?: string;        // e.g. sc-domain:example.com or https://example.com/
  ga4PropertyId?: string;      // numeric GA4 property id
  // Email (Resend). Nothing is sent until ownerEmail is set and emailStatus is "verified".
  ownerEmail?: string;         // where order alerts go + reply-to for customer emails
  senderName?: string;         // "Northline Coffee"
  senderAddress?: string;      // orders@northlinecoffee.com
  emailDomainId?: string;
  emailStatus?: EmailStatus;
  emailReceipts?: boolean;
  emailOwnerAlerts?: boolean;
  emailShipping?: boolean;
  feedProductPath?: string;    // product page path for shopping feeds, e.g. /products/{id}
}
export type EmailStatus = "none" | "pending" | "verified" | "failed";

export type ProductStatus = "active" | "draft" | "archived" | "unlisted";
/** An option like Size with its values ["S", "M", "L"]. */
export interface ProductOption { name: string; values: string[] }
/**
 * One purchasable combination of option values. This is the shape the app works with; products are
 * stored either like this or in the Shopify-import shape (options as {"Size": "M"}, image as `image`),
 * and normalizeProduct() in lib/variants.ts reads both.
 */
export interface Variant {
  id: string;
  options: string[];            // one value per product option, in order ([] for a product without options)
  title?: string;               // "M / Red"; imported variants keep Shopify's title
  price: number;
  compareAtPrice?: number | null;
  sku?: string | null;
  inventory: number;
  tracked?: boolean;            // false: stock isn't counted (digital goods), always available
  imageUrl?: string;
  barcode?: string | null; grams?: number; requiresShipping?: boolean; taxable?: boolean; costPerItem?: number | null;
}
export interface Product extends Base {
  siteId: string;
  title: string;
  description?: string;
  price: number;
  compareAtPrice?: number;
  sku?: string;
  inventory: number;
  status: ProductStatus;
  imageUrl?: string;            // main image (also the first in the gallery)
  images?: string[];            // more images, shown after imageUrl in the product gallery
  options?: ProductOption[];    // empty / missing = no options to choose
  variants?: Variant[];         // price/compareAtPrice/inventory above are roll-ups when present
  tracksInventory?: boolean;    // false: stock isn't counted (digital products); always available
  // richer catalog data (imported from Shopify, or edited here)
  handle?: string; vendor?: string; productType?: string; tags?: string[];
  seoTitle?: string; seoDescription?: string; costPerItem?: number; externalId?: string; source?: string;
}

export interface Customer extends Base {
  siteId: string;
  name: string;
  email?: string;               // a few imported customers only have a phone / Shopify ID
  phone?: string;
  ordersCount: number;
  totalSpent: number;
  acceptsMarketing?: boolean;   // only these customers receive campaigns
  lastOrderAt?: string;
  welcomedAt?: string;
  winbackAt?: string;
  firstName?: string; lastName?: string; acceptsSms?: boolean; address?: Address | null; tags?: string[]; note?: string;
  taxExempt?: boolean; unsubscribedAt?: string; externalId?: string; source?: string;
}
export interface Address { name?: string | null; company?: string | null; address1?: string | null; address2?: string | null; city?: string | null;
  province?: string | null; provinceCode?: string | null; zip?: string | null; country?: string | null; countryCode?: string | null; phone?: string | null }

export type AutomationType = "abandoned_cart" | "welcome" | "winback";
export interface Automation extends Base {
  siteId: string;
  type: AutomationType;
  enabled: boolean;
  delayHours?: number;
  templateId?: string;
  subject?: string;
  lastRunAt?: string;
  sentCount: number;
}

export type FinancialStatus = "pending" | "paid" | "partially_refunded" | "refunded" | "voided";
export type FulfillmentStatus = "unfulfilled" | "partial" | "fulfilled" | "cancelled";
export type PaymentProvider = "manual" | "stripe" | "paypal" | "shopify";
export interface LineItem { productId: string | null; variantId?: string | null; title: string; quantity: number; price: number; sku?: string | null; discount?: number | null }
export interface Order extends Base {
  siteId: string;
  number: number;
  customerId?: string;
  customerName: string;
  customerEmail: string;
  items: LineItem[];
  total: number;
  financialStatus: FinancialStatus;
  fulfillmentStatus: FulfillmentStatus;
  paymentProvider?: PaymentProvider;
  paymentRef?: string;              // Stripe PaymentIntent id or PayPal capture id
  discountCode?: string;
  discountAmount?: number;
  // imported order details
  placedAt?: string; externalId?: string; subtotal?: number; shippingTotal?: number; taxTotal?: number; refundedAmount?: number;
  cancelledAt?: string; currency?: string; billingAddress?: Address | null; shippingAddress?: Address | null;
  paymentMethod?: string; source?: string; tags?: string[];
}

/** When the order was placed: the original Shopify date for imported orders. */
export const orderDate = (o: Order) => o.placedAt || o.$createdAt;

export interface Collection extends Base {
  siteId: string;
  title: string;
  handle: string;
  description?: string;
  productIds: string[];
}

export type DiscountType = "percent" | "fixed";
export interface Discount extends Base {
  siteId: string;
  code: string;                 // stored uppercase
  type: DiscountType;
  value: number;                // 10 = 10% or $10
  minSubtotal?: number;
  usageLimit?: number;
  usedCount: number;
  startsAt?: string;
  endsAt?: string;
  active: boolean;
}

export type SegmentField = "totalSpent" | "ordersCount" | "acceptsMarketing" | "daysSinceCreated" | "email";
export type SegmentOp = "gt" | "lt" | "eq" | "contains";
export interface SegmentRule { field: SegmentField; op: SegmentOp; value: string }
export interface Segment extends Base { siteId: string; name: string; rules: SegmentRule[] }

export interface EmailTemplate extends Base {
  siteId: string;
  name: string;
  subject: string;
  html: string;                 // final, inlined HTML
  design?: string;              // GrapesJS project JSON, for re-editing
}

export type CampaignStatus = "draft" | "sending" | "sent" | "failed";
export interface Campaign extends Base {
  siteId: string;
  name: string;
  subject: string;
  templateId: string;
  segmentId: string;            // a saved segment id or a built-in key
  status: CampaignStatus;
  sentCount: number;
  sentAt?: string;
  error?: string;
}

export interface Checkout extends Base {
  siteId: string;
  provider: "stripe" | "paypal";
  providerRef?: string;
  items: { productId: string; variantId?: string; title: string; quantity: number; price: number }[];
  total: number;
  currency?: string;
  status: "open" | "completed" | "expired";
  email?: string;
  discountCode?: string;
  recoveryEmailedAt?: string;
}

/** An online-store theme (see src/theme/types.ts). One per store has role "main": that's the live one. */
export type ThemeRole = "main" | "unpublished";
export interface Theme extends Base {
  siteId: string;
  name: string;
  role: ThemeRole;
  style?: string;               // which starting style it was created from
  data: ThemeDoc;
  savedAt?: string;
  publishedAt?: string;
}

export type TableName = "sites" | "products" | "orders" | "customers" | "collections" | "discounts" | "segments" | "templates" | "campaigns" | "checkouts" | "automations" | "themes";
interface TableMap {
  sites: Site; products: Product; orders: Order; customers: Customer; collections: Collection; discounts: Discount;
  segments: Segment; templates: EmailTemplate; campaigns: Campaign; checkouts: Checkout; automations: Automation; themes: Theme;
}
export type RowOf<T extends TableName> = TableMap[T];
