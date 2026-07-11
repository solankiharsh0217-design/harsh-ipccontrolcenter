import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import AppLayout from "@/components/AppLayout";
import RouteErrorBoundary from "@/components/RouteErrorBoundary";
import Login from "./pages/Login";
import ResetPassword from "./pages/ResetPassword";
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
import PaidPipelineAccessReadiness from "./pages/PaidPipelineAccessReadiness";
import FollowUpCommandCenter from "./pages/FollowUpCommandCenter";
import FollowUpBoard from "./pages/FollowUpBoard";
import PaymentRecovery from "./pages/PaymentRecovery";
import WebinarPerformance from "./pages/WebinarPerformance";
import MasterSettings from "./pages/MasterSettings";
import MasterData from "./pages/MasterData";
import ProfitStatement from "./pages/ProfitStatement";
import AuditLog from "./pages/AuditLog";
import Notifications from "./pages/Notifications";
import RevenueCommandCenter from "./pages/RevenueCommandCenter";
import AnalyticsCenter from "./pages/AnalyticsCenter";
import AdminCenter from "./pages/AdminCenter";
import BulkEligibility from "./pages/BulkEligibility";
import SystemRefinementChecklist from "./pages/SystemRefinementChecklist";
import CleanSlate from "./pages/CleanSlate";
import MediaBuyerOperations from "./pages/MediaBuyerOperations";
import OperationsCrm from "./pages/OperationsCrm";
import OperationsRewards from "./pages/OperationsRewards";
import NotFound from "./pages/NotFound";
import CodeOfConductSign from "./pages/CodeOfConductSign";
import CodeOfConductGuide from "./pages/CodeOfConductGuide";
import CodeOfConductAdmin from "./pages/CodeOfConductAdmin";
import CodeOfConductReceipt from "./pages/CodeOfConductReceipt";
import CodeOfConductSignedPdf from "./pages/CodeOfConductSignedPdf";
import CompanySettingsPage from "./pages/admin/CompanySettings";
import InvoiceSettingsPage from "./pages/admin/InvoiceSettings";
import InvoiceEditor from "./pages/InvoiceEditor";
import PaidLeadInvoicesPage from "./pages/PaidLeadInvoices";
import InvoicesPage from "./pages/Invoices";
import InvoiceItemCatalogPage from "./pages/admin/InvoiceItemCatalog";
import OfferCatalogPage from "./pages/admin/OfferCatalog";
import ServicePackagesPage from "./pages/admin/ServicePackages";
import TaxCodeMasterPage from "./pages/admin/TaxCodeMaster";
import ConversionRulesAdmin from "./pages/admin/ConversionRules";
import LeadRescueSearch from "./pages/admin/LeadRescueSearch";
import Tasks from "./pages/Tasks";
import FinanceSuccessDashboard from "./pages/FinanceSuccessDashboard";
import ResourceLibrary from "./pages/ResourceLibrary";
import ResourceLibraryAdmin from "./pages/admin/ResourceLibraryAdmin";
import DreamTurnoverPlanner from "./pages/DreamTurnoverPlanner";
import AccessTemplatesAdmin from "./pages/admin/AccessTemplates";
import TeamPerformanceAdmin from "./pages/admin/TeamPerformanceAdmin";
import MyToday from "./pages/MyToday";
import TeamPerformanceReview from "./pages/admin/TeamPerformanceReview";
import TeamPerformanceRewards from "./pages/admin/TeamPerformanceRewards";
import TeamPerformanceDashboard from "./pages/admin/TeamPerformanceDashboard";

import type { ModuleKey } from "@/lib/modules";

const qc = new QueryClient();

const Shell = ({ children, admin, moduleKey }: { children: React.ReactNode; admin?: boolean; moduleKey?: ModuleKey }) => (
  <ProtectedRoute adminOnly={admin} moduleKey={moduleKey}>
    <AppLayout>
      <RouteErrorBoundary>{children}</RouteErrorBoundary>
    </AppLayout>
  </ProtectedRoute>
);

// Home gate: admins land on the admin Dashboard; non-admins land on My Today.
const HomeGate = () => {
  const { isAdmin, loading, user } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  if (!isAdmin) return <Navigate to="/my-today" replace />;
  return <Shell moduleKey="dashboard"><Dashboard /></Shell>;
};



const App = () => (
  <QueryClientProvider client={qc}>
    <TooltipProvider>
      <Sonner />
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/code-of-conduct/sign/:token" element={<CodeOfConductSign />} />
            <Route path="/code-of-conduct-guide/:token" element={<CodeOfConductGuide />} />
            <Route path="/dream-turnover-planner" element={<DreamTurnoverPlanner />} />
            <Route path="/admin-center/code-of-conduct" element={<Shell admin><CodeOfConductAdmin /></Shell>} />
            <Route path="/code-of-conduct/signed-pdf/:requestId" element={<Shell admin><CodeOfConductSignedPdf /></Shell>} />
            <Route path="/code-of-conduct/receipt/:requestId" element={<Shell admin><CodeOfConductReceipt /></Shell>} />
            <Route path="/" element={<HomeGate />} />
            <Route path="/founder-dashboard" element={<Shell><FounderDashboard /></Shell>} />
            <Route path="/roas-calculator" element={<Shell moduleKey="roas"><RoasCalculator /></Shell>} />
            <Route path="/roas" element={<Shell moduleKey="roas"><RoasCalculator /></Shell>} />
            <Route path="/roas/offline-seminar" element={<Shell moduleKey="roas"><RoasCalculator /></Shell>} />
            <Route path="/offline-seminar-roas" element={<Shell moduleKey="roas"><RoasCalculator /></Shell>} />
            <Route path="/search" element={<Shell moduleKey="search"><StudentSearch /></Shell>} />
            <Route path="/leadflow" element={<Navigate to="/daily-lead-reporting" replace />} />
            <Route path="/daily-lead-flow" element={<Navigate to="/daily-lead-reporting" replace />} />
            <Route path="/daily-lead-reporting" element={<Shell moduleKey="daily-reporting"><DailyLeadReporting /></Shell>} />
            <Route path="/reports" element={<Shell moduleKey="reports"><Reports /></Shell>} />
            <Route path="/report-history/media-buyer-comparison" element={<Shell moduleKey="reports"><Reports /></Shell>} />
            <Route path="/lead-qualifier" element={<Shell moduleKey="lead-qualifier"><LeadQualifier /></Shell>} />
            <Route path="/crm" element={<Shell moduleKey="crm"><Crm /></Shell>} />
            <Route path="/crm/overview" element={<Shell moduleKey="crm"><CrmOverview /></Shell>} />
            <Route path="/paid-pipeline" element={<Shell moduleKey="paid-pipeline"><PaidPipeline /></Shell>} />
            <Route path="/crm/paid-pipeline" element={<Shell moduleKey="paid-pipeline"><PaidPipeline /></Shell>} />
            <Route path="/paid-pipeline/access-readiness" element={<Shell moduleKey="paid-pipeline"><PaidPipelineAccessReadiness /></Shell>} />
            <Route path="/follow-up-command-center" element={<Shell moduleKey="follow_up_command_center"><FollowUpCommandCenter /></Shell>} />
            {/* Follow-up Board: route is open to any authenticated user; the page itself
                gates by isAdmin || follow_up_command_center || crm || calling_crm. This
                ensures sales/calling executives (who only have calling_crm) are not blocked
                by the Shell's strict moduleKey check. */}
            <Route path="/follow-up-board" element={<Shell><FollowUpBoard /></Shell>} />
            <Route path="/payment-recovery" element={<Shell moduleKey="payment_recovery"><PaymentRecovery /></Shell>} />
            <Route path="/webinar-performance" element={<Shell moduleKey="webinar_performance"><WebinarPerformance /></Shell>} />
            <Route path="/team" element={<Shell moduleKey="team"><Team /></Shell>} />
            <Route path="/announcements" element={<Shell moduleKey="announcements"><Announcements /></Shell>} />
            <Route path="/admin" element={<Shell admin><Admin /></Shell>} />
            <Route path="/master-data" element={<Shell moduleKey="master-data"><MasterData /></Shell>} />
            <Route path="/master-settings" element={<Shell moduleKey="master_settings"><MasterSettings /></Shell>} />
            <Route path="/profit-statement" element={<Shell moduleKey="profit-statement"><ProfitStatement /></Shell>} />
            <Route path="/audit-log" element={<Shell admin moduleKey="audit_log"><AuditLog /></Shell>} />
            <Route path="/notifications" element={<Shell moduleKey="notifications"><Notifications /></Shell>} />
            <Route path="/revenue-command-center" element={<Shell><RevenueCommandCenter /></Shell>} />
            <Route path="/analytics-center" element={<Shell><AnalyticsCenter /></Shell>} />
            <Route path="/admin-center" element={<Shell><AdminCenter /></Shell>} />
            <Route path="/admin-center/company-settings" element={<Shell admin><CompanySettingsPage /></Shell>} />
            <Route path="/admin-center/invoice-settings" element={<Shell admin><InvoiceSettingsPage /></Shell>} />
            <Route path="/invoices" element={<Shell admin><InvoicesPage /></Shell>} />
            <Route path="/invoices/new" element={<Shell admin><InvoiceEditor /></Shell>} />
            <Route path="/invoices/:id" element={<Shell admin><InvoiceEditor /></Shell>} />

            <Route path="/paid-pipeline/:paidLeadId/invoices" element={<Shell moduleKey="paid-pipeline"><PaidLeadInvoicesPage /></Shell>} />
            <Route path="/admin-center/item-catalog" element={<Shell admin><InvoiceItemCatalogPage /></Shell>} />
            <Route path="/admin-center/offer-catalog" element={<Shell admin><OfferCatalogPage /></Shell>} />
            <Route path="/admin-center/service-packages" element={<Shell admin><ServicePackagesPage /></Shell>} />
            <Route path="/admin-center/tax-codes" element={<Shell admin><TaxCodeMasterPage /></Shell>} />
            <Route path="/admin-center/system-refinement" element={<Shell admin><SystemRefinementChecklist /></Shell>} />
            <Route path="/admin-center/eligibility" element={<Shell admin><BulkEligibility /></Shell>} />
            <Route path="/admin-center/clean-slate" element={<Shell admin><CleanSlate /></Shell>} />
            <Route path="/admin-center/conversion-rules" element={<Shell admin><ConversionRulesAdmin /></Shell>} />
            <Route path="/admin-center/lead-rescue" element={<Shell admin><LeadRescueSearch /></Shell>} />
            <Route path="/admin-center/access-templates" element={<Shell admin><AccessTemplatesAdmin /></Shell>} />
            <Route path="/team-performance" element={<Shell admin><TeamPerformanceDashboard /></Shell>} />
            <Route path="/team-performance/admin" element={<Shell admin><TeamPerformanceAdmin /></Shell>} />
            <Route path="/team-performance/review" element={<Shell admin><TeamPerformanceReview /></Shell>} />
            <Route path="/team-performance/rewards" element={<Shell><TeamPerformanceRewards /></Shell>} />
            <Route path="/my-today" element={<Shell><MyToday /></Shell>} />
            <Route path="/media-buyer-operations" element={<Shell moduleKey="media_buyer_operations"><MediaBuyerOperations /></Shell>} />
            <Route path="/operations-crm" element={<Shell moduleKey="operations_crm"><OperationsCrm /></Shell>} />
            <Route path="/operations-rewards" element={<Shell><OperationsRewards /></Shell>} />
            <Route path="/system-refinement-checklist" element={<Shell admin><SystemRefinementChecklist /></Shell>} />
            <Route path="/tasks" element={<Shell><Tasks /></Shell>} />
            <Route path="/finance-success-dashboard" element={<Shell><FinanceSuccessDashboard /></Shell>} />
            <Route path="/resource-library" element={<Shell><ResourceLibrary /></Shell>} />
            <Route path="/admin-center/resource-library" element={<Shell admin><ResourceLibraryAdmin /></Shell>} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
