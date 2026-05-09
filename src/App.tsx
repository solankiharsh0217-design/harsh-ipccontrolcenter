import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/context/AuthContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import AppLayout from "@/components/AppLayout";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import RoasCalculator from "./pages/RoasCalculator";
import StudentSearch from "./pages/StudentSearch";
import LeadFlow from "./pages/LeadFlow";
import DailyLeadReporting from "./pages/DailyLeadReporting";
import Reports from "./pages/Reports";
import Team from "./pages/Team";
import Announcements from "./pages/Announcements";
import Admin from "./pages/Admin";
import LeadQualifier from "./pages/LeadQualifier";
import Crm from "./pages/Crm";
import CrmOverview from "./pages/CrmOverview";
import MasterData from "./pages/MasterData";
import NotFound from "./pages/NotFound";

const qc = new QueryClient();

const Shell = ({ children, admin }: { children: React.ReactNode; admin?: boolean }) => (
  <ProtectedRoute adminOnly={admin}>
    <AppLayout>{children}</AppLayout>
  </ProtectedRoute>
);

const App = () => (
  <QueryClientProvider client={qc}>
    <TooltipProvider>
      <Sonner />
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/" element={<Shell><Dashboard /></Shell>} />
            <Route path="/roas-calculator" element={<Shell><RoasCalculator /></Shell>} />
            <Route path="/roas" element={<Shell><RoasCalculator /></Shell>} />
            <Route path="/search" element={<Shell><StudentSearch /></Shell>} />
            <Route path="/leadflow" element={<Navigate to="/daily-lead-reporting" replace />} />
            <Route path="/daily-lead-flow" element={<Navigate to="/daily-lead-reporting" replace />} />
            <Route path="/daily-lead-reporting" element={<Shell><DailyLeadReporting /></Shell>} />
            <Route path="/reports" element={<Shell><Reports /></Shell>} />
            <Route path="/lead-qualifier" element={<Shell><LeadQualifier /></Shell>} />
            <Route path="/crm" element={<Shell><Crm /></Shell>} />
            <Route path="/crm/overview" element={<Shell><CrmOverview /></Shell>} />
            <Route path="/team" element={<Shell><Team /></Shell>} />
            <Route path="/announcements" element={<Shell><Announcements /></Shell>} />
            <Route path="/admin" element={<Shell admin><Admin /></Shell>} />
            <Route path="/master-data" element={<Shell><MasterData /></Shell>} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
