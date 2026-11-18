import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/Auth";
import { SiteProvider, useSite } from "./context/Site";
import Layout from "./components/Layout";
import { Loading } from "./components/ui";
import Login from "./pages/Login";
import HomePage from "./pages/Home";
import Orders from "./pages/Orders";
import Products from "./pages/Products";
import Customers from "./pages/Customers";
import Analytics from "./pages/Analytics";
import Seo from "./pages/Seo";
import Domains from "./pages/Domains";
import Deploys from "./pages/Deploys";
import SettingsPage from "./pages/Settings";
import Planned from "./pages/Planned";
import Abandoned from "./pages/orders/Abandoned";
import Collections from "./pages/products/Collections";
import Inventory from "./pages/products/Inventory";
import Segments from "./pages/customers/Segments";
import Discounts from "./pages/Discounts";
import Files from "./pages/content/Files";
import Designer from "./pages/marketing/Designer";
import Campaigns from "./pages/marketing/Campaigns";
import OnlineStore from "./pages/channels/OnlineStore";
import { plannedPages } from "./lib/nav";

function Guarded() {
  const { user, loading } = useAuth();
  if (loading) return <div className="p-8"><Loading /></div>;
  if (!user) return <Navigate to="/login" replace />;
  return <SiteProvider><SiteGate /></SiteProvider>;
}

function SiteGate() {
  const { site, loading } = useSite();
  if (loading) return <div className="p-8"><Loading label="Loading your sites…" /></div>;
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="settings" element={<SettingsPage />} />
        {site ? (
          <>
            <Route index element={<HomePage />} />
            <Route path="orders" element={<Orders />} />
            <Route path="orders/drafts" element={<Orders key="drafts" drafts />} />
            <Route path="orders/abandoned" element={<Abandoned />} />
            <Route path="products/collections" element={<Collections />} />
            <Route path="products/inventory" element={<Inventory />} />
            <Route path="customers/segments" element={<Segments />} />
            <Route path="marketing" element={<Navigate to="/marketing/campaigns" replace />} />
            <Route path="marketing/campaigns" element={<Campaigns />} />
            <Route path="marketing/designer" element={<Designer />} />
            <Route path="marketing/designer/:id" element={<Designer />} />
            <Route path="discounts" element={<Discounts />} />
            <Route path="content" element={<Navigate to="/content/files" replace />} />
            <Route path="content/files" element={<Files />} />
            <Route path="channels/online-store" element={<OnlineStore />} />
            {plannedPages.map(p => <Route key={p.to} path={p.to.slice(1)} element={<Planned label={p.label} planned={p.planned} />} />)}
            <Route path="products" element={<Products />} />
            <Route path="customers" element={<Customers />} />
            <Route path="analytics" element={<Analytics />} />
            <Route path="seo" element={<Seo />} />
            <Route path="domains" element={<Domains />} />
            <Route path="deploys" element={<Deploys />} />
          </>
        ) : null}
        <Route path="*" element={<Navigate to={site ? "/" : "/settings?new=1"} replace />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/*" element={<Guarded />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
