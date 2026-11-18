/** Merge tags replaced per recipient when a campaign is sent. */
export const MERGE_TAGS = [
  { tag: "{{first_name}}", label: "Customer first name" },
  { tag: "{{store_name}}", label: "Store name" },
  { tag: "{{store_url}}", label: "Store URL" },
  { tag: "{{unsubscribe_url}}", label: "Unsubscribe link (required)" },
];

export const starterTemplate = (store: string, url: string) => `
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:24px 0;font-family:Helvetica,Arial,sans-serif">
  <tr><td align="center">
    <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden">
      <tr><td style="padding:24px 32px;font-size:20px;font-weight:bold;color:#18181b">{{store_name}}</td></tr>
      <tr><td style="padding:0 32px"><img src="https://placehold.co/496x220/16a34a/ffffff?text=New+arrivals" width="496" style="display:block;width:100%;border-radius:8px" alt=""/></td></tr>
      <tr><td style="padding:24px 32px 8px;font-size:22px;font-weight:bold;color:#18181b">Hi {{first_name}}, something new just landed</td></tr>
      <tr><td style="padding:0 32px 24px;font-size:15px;line-height:1.6;color:#3f3f46">Write a short, friendly note about what's new, a sale, or a story from the shop.</td></tr>
      <tr><td style="padding:0 32px 32px"><a href="{{store_url}}" style="display:inline-block;background:#18181b;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:bold">Shop now</a></td></tr>
    </table>
    <p style="font-size:12px;color:#71717a;margin:16px 0 0">You're getting this because you signed up at ${store}${url ? ` (${url})` : ""}.<br/><a href="{{unsubscribe_url}}" style="color:#71717a">Unsubscribe</a></p>
  </td></tr>
</table>`.trim();
