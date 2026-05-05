import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/context/AuthContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import AppLayout from "@/components/AppLayout";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Roas from "./pages/Roas";
import StudentSearch from "./pages/StudentSearch";
import LeadFlow from "./pages/LeadFlow";
import Team from "./pages/Team";
import Announcements from "./pages/Announcements";
import Admin from "./pages/Admin";
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
            <Route path="/roas" element={<Shell><Roas /></Shell>} />
            <Route path="/search" element={<Shell><StudentSearch /></Shell>} />
            <Route path="/leadflow" element={<Shell><LeadFlow /></Shell>} />
            <Route path="/team" element={<Shell><Team /></Shell>} />
            <Route path="/announcements" element={<Shell><Announcements /></Shell>} />
            <Route path="/admin" element={<Shell admin><Admin /></Shell>} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
