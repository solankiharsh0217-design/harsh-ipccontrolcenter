import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/context/AuthContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import AppLayout from "@/components/AppLayout";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import FounderDashboard from "./pages/FounderDashboard";
import RoasCalculator from "./pages/RoasCalculator";
import StudentSearch from "./pages/StudentSearch";
import DailyLeadReporting from "./pages/DailyLeadReporting";
import Reports from "./pages/Reports";
import Team from "./pages/Team";
import Announcements from "./pages/Announcements";
import Admin from "./pages/Admin";
import LeadQualifier from "./pages/LeadQualifier";
import Crm from "./pages/Crm";
import CrmOverview from "./pages/CrmOverview";
import PaidPipeline from "./pages/PaidPipeline";
import FollowUpCommandCenter from "./pages/FollowUpCommandCenter";
import PaymentRecovery from "./pages/PaymentRecovery";
import MasterSettings from "./pages/MasterSettings";
import MasterData from "./pages/MasterData";
import ProfitStatement from "./pages/ProfitStatement";
import NotFound from "./pages/NotFound";

import type { ModuleKey } from "@/lib/modules";

const qc = new QueryClient();

const Shell = ({ children, admin, moduleKey }: { children: React.ReactNode; admin?: boolean; moduleKey?: ModuleKey }) => (
  <ProtectedRoute adminOnly={admin} moduleKey={moduleKey}>
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
            <Route path="/" element={<Shell moduleKey="dashboard"><Dashboard /></Shell>} />
            <Route path="/founder-dashboard" element={<Shell><FounderDashboard /></Shell>} />
            <Route path="/roas-calculator" element={<Shell moduleKey="roas"><RoasCalculator /></Shell>} />
            <Route path="/roas" element={<Shell moduleKey="roas"><RoasCalculator /></Shell>} />
            <Route path="/search" element={<Shell moduleKey="search"><StudentSearch /></Shell>} />
            <Route path="/leadflow" element={<Navigate to="/daily-lead-reporting" replace />} />
            <Route path="/daily-lead-flow" element={<Navigate to="/daily-lead-reporting" replace />} />
            <Route path="/daily-lead-reporting" element={<Shell moduleKey="daily-reporting"><DailyLeadReporting /></Shell>} />
            <Route path="/reports" element={<Shell moduleKey="reports"><Reports /></Shell>} />
            <Route path="/lead-qualifier" element={<Shell moduleKey="lead-qualifier"><LeadQualifier /></Shell>} />
            <Route path="/crm" element={<Shell moduleKey="crm"><Crm /></Shell>} />
            <Route path="/crm/overview" element={<Shell moduleKey="crm"><CrmOverview /></Shell>} />
            <Route path="/paid-pipeline" element={<Shell moduleKey="paid-pipeline"><PaidPipeline /></Shell>} />
            <Route path="/crm/paid-pipeline" element={<Shell moduleKey="paid-pipeline"><PaidPipeline /></Shell>} />
            <Route path="/follow-up-command-center" element={<Shell moduleKey="follow_up_command_center"><FollowUpCommandCenter /></Shell>} />
            <Route path="/payment-recovery" element={<Shell moduleKey="payment_recovery"><PaymentRecovery /></Shell>} />
            <Route path="/team" element={<Shell moduleKey="team"><Team /></Shell>} />
            <Route path="/announcements" element={<Shell moduleKey="announcements"><Announcements /></Shell>} />
            <Route path="/admin" element={<Shell admin><Admin /></Shell>} />
            <Route path="/master-data" element={<Shell moduleKey="master-data"><MasterData /></Shell>} />
            <Route path="/master-settings" element={<Shell moduleKey="master_settings"><MasterSettings /></Shell>} />
            <Route path="/profit-statement" element={<Shell moduleKey="profit-statement"><ProfitStatement /></Shell>} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
