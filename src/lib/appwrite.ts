import { Account, Client, Functions, Storage, TablesDB } from "appwrite";

const env = import.meta.env;
export const config = {
  endpoint: env.VITE_APPWRITE_ENDPOINT || "https://cloud.appwrite.io/v1",
  projectId: env.VITE_APPWRITE_PROJECT_ID || "",
  databaseId: env.VITE_APPWRITE_DATABASE_ID || "yancey",
  functionId: env.VITE_APPWRITE_FUNCTION_ID || "site-ops",
  bucketId: env.VITE_APPWRITE_BUCKET_ID || "files",
  downloadsBucketId: env.VITE_APPWRITE_DOWNLOADS_BUCKET_ID || "downloads",  // private: digital products
  checkoutPublicUrl: (env.VITE_CHECKOUT_PUBLIC_URL || "").replace(/\/$/, ""),   // the checkout function's domain
  pagespeedKey: env.VITE_PAGESPEED_API_KEY || "",
};

/** No Appwrite project configured -> run on sample data stored in localStorage. */
export const isDemo = !config.projectId;

export const client = new Client().setEndpoint(config.endpoint);
if (!isDemo) client.setProject(config.projectId);

export const account = new Account(client);
export const tables = new TablesDB(client);
export const functions = new Functions(client);
export const storage = new Storage(client);
