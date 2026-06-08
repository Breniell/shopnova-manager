import { Suspense, lazy } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HashRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppLayout } from "@/components/layout/AppLayout";
import { FirebaseProvider } from "@/components/FirebaseProvider";
import { ProtectedRoute } from "@/components/layout/ProtectedRoute";
import { PolicyGate } from "@/components/PolicyGate";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";

// Pages are code-split: each route loads its own chunk on demand, keeping the
// initial bundle small. Heavy, rarely-visited pages (e.g. the super-admin
// console, which pulls in Leaflet) no longer weigh on first paint.
const LoginPage            = lazy(() => import("./pages/LoginPage"));
const DashboardPage        = lazy(() => import("./pages/DashboardPage"));
const CaissePage           = lazy(() => import("./pages/CaissePage"));
const ProduitsPage         = lazy(() => import("./pages/ProduitsPage"));
const StockPage            = lazy(() => import("./pages/StockPage"));
const VentesPage           = lazy(() => import("./pages/VentesPage"));
const RapportsPage         = lazy(() => import("./pages/RapportsPage"));
const ParametresPage       = lazy(() => import("./pages/ParametresPage"));
const ClotureCaissePage    = lazy(() => import("./pages/ClotureCaissePage"));
const FournisseursPage     = lazy(() => import("./pages/FournisseursPage"));
const ClientsPage          = lazy(() => import("./pages/ClientsPage"));
const DepensesPage         = lazy(() => import("./pages/DepensesPage"));
const OuvertureSessionPage = lazy(() => import("./pages/OuvertureSessionPage"));
const InventairePage       = lazy(() => import("./pages/InventairePage"));
const CreditPage           = lazy(() => import("./pages/CreditPage"));
const SuperAdminPage       = lazy(() => import("./pages/superadmin/SuperAdminPage"));

const queryClient = new QueryClient();

const App = () => (
  <PolicyGate>
  <FirebaseProvider>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Sonner position="top-right" theme="dark" />
      <HashRouter>
        <Suspense fallback={<LoadingSpinner />}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route element={<AppLayout />}>
            <Route path="/" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
            <Route path="/caisse" element={<ProtectedRoute allowedRoles={['gérant', 'caissier']}><CaissePage /></ProtectedRoute>} />
            <Route path="/ouverture-session" element={<ProtectedRoute allowedRoles={['gérant', 'caissier']}><OuvertureSessionPage /></ProtectedRoute>} />
            <Route path="/clients" element={<ProtectedRoute allowedRoles={['gérant', 'caissier']}><ClientsPage /></ProtectedRoute>} />
            <Route path="/credit" element={<ProtectedRoute allowedRoles={['gérant', 'caissier']}><CreditPage /></ProtectedRoute>} />
            <Route path="/produits" element={<ProtectedRoute allowedRoles={['gérant']}><ProduitsPage /></ProtectedRoute>} />
            <Route path="/stock" element={<ProtectedRoute allowedRoles={['gérant']}><StockPage /></ProtectedRoute>} />
            <Route path="/inventaire" element={<ProtectedRoute allowedRoles={['gérant']}><InventairePage /></ProtectedRoute>} />
            <Route path="/fournisseurs" element={<ProtectedRoute allowedRoles={['gérant']}><FournisseursPage /></ProtectedRoute>} />
            <Route path="/ventes" element={<ProtectedRoute allowedRoles={['gérant']}><VentesPage /></ProtectedRoute>} />
            <Route path="/depenses" element={<ProtectedRoute allowedRoles={['gérant']}><DepensesPage /></ProtectedRoute>} />
            <Route path="/cloture" element={<ProtectedRoute allowedRoles={['gérant', 'caissier']}><ClotureCaissePage /></ProtectedRoute>} />
            <Route path="/rapports" element={<ProtectedRoute allowedRoles={['gérant']}><RapportsPage /></ProtectedRoute>} />
            <Route path="/parametres" element={<ProtectedRoute allowedRoles={['gérant']}><ParametresPage /></ProtectedRoute>} />
          </Route>
          {/* Super-admin console — not in AppLayout, handles its own auth */}
          <Route path="/superadmin" element={<SuperAdminPage />} />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
        </Suspense>
      </HashRouter>
      </TooltipProvider>
    </QueryClientProvider>
  </FirebaseProvider>
  </PolicyGate>
);

export default App;
