import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import React from "react";
import Reports from "./Reports";
import { BrowserRouter } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

// Mock Supabase
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: vi.fn(),
    rpc: vi.fn(),
  },
}));

// Mock Auth Context
vi.mock("@/context/AuthContext", () => ({
  useAuth: () => ({ user: { id: "test-user" } }),
}));

// Mock ResizeObserver
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

const renderReports = () => {
  return render(
    <BrowserRouter>
      <Reports />
    </BrowserRouter>
  );
};

describe("Reports List Queries Narrowing Test", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    
    // Default mock for RPC
    (supabase.rpc as any).mockResolvedValue({ data: null, error: null });
    
    // Default mock for all tables
    (supabase.from as any).mockImplementation((table: string) => ({
      select: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      then: vi.fn().mockImplementation((cb) => {
        cb({ data: [], error: null });
        return Promise.resolve({ data: [], error: null });
      }),
    }));
  });

  it("should render attribution_sessions list with mocked joined data", async () => {
    const mockData = [{
      id: "attr-1",
      webinar_name: "Test Webinar Attribution",
      webinar_date: "2026-08-01",
      webinar_type: "paid",
      total_leads: 101,
      total_sales: 11,
      total_ad_spend: 1000,
      total_revenue: 5001,
      overall_roas: 5.0,
      created_at: new Date().toISOString(),
      is_deleted: false,
      calculation_method: "auto",
      buyers: [{ media_buyer_name: "Buyer A" }] 
    }];
    
    (supabase.from as any).mockImplementation((table: string) => ({
      select: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      then: vi.fn().mockImplementation((cb) => {
        const responseData = table === "attribution_sessions" ? mockData : [];
        cb({ data: responseData, error: null });
        return Promise.resolve({ data: responseData, error: null });
      }),
    }));

    renderReports();

    await waitFor(() => {
      expect(screen.queryAllByText(/₹5,001/).length).toBeGreaterThan(0);
    }, { timeout: 3000 });

    expect(screen.getByText("Test Webinar Attribution")).toBeInTheDocument();
    
    const avatars = screen.getAllByTestId("buyer-avatar");
    expect(avatars.length).toBeGreaterThan(0);
    expect(avatars[0].getAttribute("title")).toBe("Buyer A");
  });

  it("should render seminar_roas_reports list with mocked data", async () => {
    const mockData = [{
      id: "seminar-1",
      webinar_name: "Test Seminar Report",
      total_webinar_days: 3,
      watch_point_percent: 50,
      total_revenue_including_gst: 10002,
      total_ad_spend_including_gst: 2002,
      total_conversions: 22,
      profit_after_gst: 8002,
      cpa: 102,
      roas: 5.02,
      is_deleted: false,
      created_at: new Date().toISOString()
    }];

    (supabase.from as any).mockImplementation((table: string) => ({
      select: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      then: vi.fn().mockImplementation((cb) => {
        cb({ data: table === "seminar_roas_reports" ? mockData : [], error: null });
        return Promise.resolve({ data: table === "seminar_roas_reports" ? mockData : [], error: null });
      }),
    }));

    renderReports();

    await waitFor(() => {
       const btn = screen.getByText(/Seminar ROAS Reports/i).closest('button');
       if (btn) fireEvent.click(btn);
    });

    await waitFor(() => {
      expect(screen.getByText("Test Seminar Report")).toBeInTheDocument();
    }, { timeout: 3000 });
  });

  it("should render profit_statements list with mocked data", async () => {
    const mockData = [{
      id: "profit-1",
      business_unit: "Test BU Profit",
      statement_month: "2026-08-01",
      total_revenue: 15003,
      gross_profit: 3003,
      total_payroll: 503,
      net_profit: 11500,
      net_margin: 5.03,
      status: "posted",
      is_deleted: false,
      created_at: new Date().toISOString()
    }];

    (supabase.from as any).mockImplementation((table: string) => ({
      select: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      then: vi.fn().mockImplementation((cb) => {
        cb({ data: table === "profit_statements" ? mockData : [], error: null });
        return Promise.resolve({ data: table === "profit_statements" ? mockData : [], error: null });
      }),
    }));

    renderReports();

    await waitFor(() => {
       const btn = screen.getByText(/Profit Statements/i).closest('button');
       if (btn) fireEvent.click(btn);
    });

    await waitFor(() => {
      const cell = screen.getAllByText("Test BU Profit").find(el => el.tagName === "TD");
      expect(cell).toBeTruthy();
    }, { timeout: 3000 });
  });

  it("should render offline_seminar_reports list with mocked data", async () => {
    const mockData = [{
      id: "offline-1",
      event_name: "Test Offline Event",
      event_location: "Mumbai",
      event_date: "2026-08-01",
      total_leads: 154,
      total_sales: 24,
      total_realized_revenue: 15004,
      total_cost: 3000,
      net_profit: 12004,
      realized_roas: 5.04,
      is_deleted: false,
      created_at: new Date().toISOString()
    }];

    (supabase.from as any).mockImplementation((table: string) => ({
      select: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      then: vi.fn().mockImplementation((cb) => {
        cb({ data: table === "offline_seminar_reports" ? mockData : [], error: null });
        return Promise.resolve({ data: table === "offline_seminar_reports" ? mockData : [], error: null });
      }),
    }));

    renderReports();

    await waitFor(() => {
       const btn = screen.getByText(/Offline Seminar Reports/i).closest('button');
       if (btn) fireEvent.click(btn);
    });

    await waitFor(() => {
      expect(screen.getByText("Test Offline Event")).toBeInTheDocument();
    }, { timeout: 3000 });
  });
});
