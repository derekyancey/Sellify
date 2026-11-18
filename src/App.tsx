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
