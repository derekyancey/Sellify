export interface Base { $id: string; $createdAt: string }

export interface Site extends Base {
  name: string;
  domain: string;              // e.g. example.com
  currency: string;            // ISO code, e.g. USD
  cloudflareZoneId?: string;
  netlifySiteId?: string;
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

export type ProductStatus = "active" | "draft" | "archived";
export interface Product extends Base {
  siteId: string;
  title: string;
  description?: string;
  price: number;
  compareAtPrice?: number;
  sku?: string;
  inventory: number;
  status: ProductStatus;
  imageUrl?: string;
}

export interface Customer extends Base {
  siteId: string;
  name: string;
  email: string;
  phone?: string;
  ordersCount: number;
  totalSpent: number;
  acceptsMarketing?: boolean;   // only these customers receive campaigns
  lastOrderAt?: string;
  welcomedAt?: string;
  winbackAt?: string;
}

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

export type FinancialStatus = "pending" | "paid" | "refunded";
export type FulfillmentStatus = "unfulfilled" | "fulfilled" | "cancelled";
export type PaymentProvider = "manual" | "stripe" | "paypal";
export interface LineItem { productId: string; title: string; quantity: number; price: number }
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
}

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
  items: { productId: string; title: string; quantity: number; price: number }[];
  total: number;
  currency?: string;
  status: "open" | "completed" | "expired";
  email?: string;
  discountCode?: string;
  recoveryEmailedAt?: string;
}

export type TableName = "sites" | "products" | "orders" | "customers" | "collections" | "discounts" | "segments" | "templates" | "campaigns" | "checkouts" | "automations";
interface TableMap {
  sites: Site; products: Product; orders: Order; customers: Customer; collections: Collection; discounts: Discount;
  segments: Segment; templates: EmailTemplate; campaigns: Campaign; checkouts: Checkout; automations: Automation;
}
export type RowOf<T extends TableName> = TableMap[T];
