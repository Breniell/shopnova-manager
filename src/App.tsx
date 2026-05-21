import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HashRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppLayout } from "@/components/layout/AppLayout";
import { FirebaseProvider } from "@/components/FirebaseProvider";
import { ProtectedRoute } from "@/components/layout/ProtectedRoute";
import { PolicyGate } from "@/components/PolicyGate";
import LoginPage from "./pages/LoginPage";
import DashboardPage from "./pages/DashboardPage";
import CaissePage from "./pages/CaissePage";
import ProduitsPage from "./pages/ProduitsPage";
import StockPage from "./pages/StockPage";
import VentesPage from "./pages/VentesPage";
import RapportsPage from "./pages/RapportsPage";
import ParametresPage from "./pages/ParametresPage";
import ClotureCaissePage from "./pages/ClotureCaissePage";
import FournisseursPage from "./pages/FournisseursPage";
import ClientsPage from "./pages/ClientsPage";
import DepensesPage from "./pages/DepensesPage";
import OuvertureSessionPage from "./pages/OuvertureSessionPage";
import InventairePage from "./pages/InventairePage";
import CreditPage from "./pages/CreditPage";

const queryClient = new QueryClient();

const App = () => (
  <PolicyGate>
  <FirebaseProvider>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Sonner position="top-right" theme="dark" />
      <HashRouter>
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
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </HashRouter>
      </TooltipProvider>
    </QueryClientProvider>
  </FirebaseProvider>
  </PolicyGate>
);

export default App;
