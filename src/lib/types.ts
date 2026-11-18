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
}

export type TableName = "sites" | "products" | "orders" | "customers";
export type RowOf<T extends TableName> =
  T extends "sites" ? Site : T extends "products" ? Product : T extends "orders" ? Order : Customer;
