import { BrowserRouter, Link, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/Auth";
import { SiteProvider, useSite, useStorePath, useStores } from "./context/Site";
import AppShell from "./components/AppShell";
import StoresHome from "./pages/StoresHome";
import StoreSettings from "./pages/StoreSettings";
import Account from "./pages/Account";
import Finance from "./pages/Finance";
import Import from "./pages/Import";
import GoogleCallback from "./pages/GoogleCallback";
import Layout from "./components/Layout";
import { Loading } from "./components/ui";
import Login from "./pages/Login";
import HomePage from "./pages/Home";
import Orders from "./pages/Orders";
import Products from "./pages/Products";
import Customers from "./pages/Customers";
import Analytics from "./pages/Analytics";
import Seo from "./pages/Seo";
import Deploys from "./pages/Deploys";
import Planned from "./pages/Planned";
import Abandoned from "./pages/orders/Abandoned";
import Collections from "./pages/products/Collections";
import CollectionEditor from "./pages/products/CollectionEditor";
import Inventory from "./pages/products/Inventory";
import Segments from "./pages/customers/Segments";
import Discounts from "./pages/Discounts";
import Files from "./pages/content/Files";
import Designer from "./pages/marketing/Designer";
import Campaigns from "./pages/marketing/Campaigns";
import OnlineStore from "./pages/channels/OnlineStore";
import Feed from "./pages/channels/Feed";
import Automations from "./pages/marketing/Automations";
import { plannedPages } from "./lib/nav";
import ErrorBoundary from "./components/ErrorBoundary";

function Guarded() {
  const { user, loading } = useAuth();
  if (loading) return <div className="p-8"><Loading /></div>;
  if (!user) return <Navigate to="/login" replace />;
  return (
    <SiteProvider>
      <Routes>
        <Route path="stores" element={<Shell><StoresHome /></Shell>} />
        <Route path="account" element={<Shell><Account /></Shell>} />
        <Route path="oauth/google" element={<Shell><GoogleCallback /></Shell>} />
        <Route path="stores/:storeId/*" element={<StoreRoutes />} />
        <Route path="*" element={<Navigate to="/stores" replace />} />
      </Routes>
    </SiteProvider>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  const { loading } = useStores();
  return <AppShell>{loading ? <Loading label="Loading your stores…" /> : children}</AppShell>;
}

/** Everything inside one store. Paths are relative to /stores/:storeId. */
function StoreRoutes() {
  const { site, loading } = useSite();
  if (loading) return <div className="p-8"><Loading label="Loading your store…" /></div>;
  if (!site) return <Navigate to="/stores" replace />;
  const needsUrl = (el: React.ReactNode) => site.domain ? el : <NoUrl />;
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<HomePage />} />
        <Route path="settings" element={<StoreSettings />} />
        <Route path="import" element={<Import />} />
        <Route path="orders" element={<Orders />} />
        <Route path="orders/drafts" element={<Orders key="drafts" drafts />} />
        <Route path="orders/abandoned" element={<Abandoned />} />
        <Route path="products" element={<Products />} />
        <Route path="products/collections" element={<Collections />} />
        <Route path="products/collections/:id" element={<CollectionEditor />} />
        <Route path="products/inventory" element={<Inventory />} />
        <Route path="customers" element={<Customers />} />
        <Route path="customers/segments" element={<Segments />} />
        <Route path="marketing" element={<Navigate to="campaigns" replace />} />
        <Route path="marketing/campaigns" element={<Campaigns />} />
        <Route path="marketing/designer" element={<Designer />} />
        <Route path="marketing/designer/:id" element={<Designer />} />
        <Route path="marketing/automations" element={<Automations />} />
        <Route path="discounts" element={<Discounts />} />
        <Route path="content" element={<Navigate to="files" replace />} />
        <Route path="content/files" element={<Files />} />
        <Route path="analytics" element={<Analytics />} />
        <Route path="finance" element={<Finance />} />
        <Route path="seo" element={needsUrl(<Seo />)} />
        <Route path="deploys" element={<Deploys />} />
        <Route path="channels/online-store" element={needsUrl(<OnlineStore />)} />
        <Route path="channels/google" element={needsUrl(<Feed key="google" platform="google" />)} />
        <Route path="channels/tiktok" element={needsUrl(<Feed key="tiktok" platform="tiktok" />)} />
        {plannedPages.map(p => <Route key={p.to} path={p.to.slice(1)} element={<Planned label={p.label} planned={p.planned} />} />)}
        <Route path="*" element={<Navigate to="." replace />} />
      </Route>
    </Routes>
  );
}

function NoUrl() {
  const sp = useStorePath();
  return (
    <div className="rounded-xl border border-dashed border-zinc-300 bg-white p-6 text-sm text-zinc-600">
      <div className="font-medium text-zinc-800">This store doesn't have a URL yet.</div>
      <div className="mt-1">Add one in <Link className="underline" to={sp("/settings#url")}>store settings</Link> to use this page.</div>
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary fullPage>
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/*" element={<Guarded />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
    </ErrorBoundary>
  );
}
