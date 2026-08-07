import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
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
    
    // Default mock for daily_lead_reports (used in stats and overview)
    const dailyMock = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      then: vi.fn().mockImplementation((cb) => cb({ data: [], error: null })),
    };
    (supabase.from as any).mockImplementation((table: string) => {
      if (table === "daily_lead_reports") return dailyMock;
      return {
        from: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        then: vi.fn().mockImplementation((cb) => cb({ data: [], error: null })),
      };
    });
  });

  it("should render attribution_sessions list with mocked data", async () => {
    const mockData = [{
      id: "attr-1",
      webinar_name: "Test Webinar Attribution",
      webinar_date: "2026-08-01",
      webinar_type: "paid",
      total_leads: 100,
      total_sales: 10,
      total_ad_spend: 1000,
      total_revenue: 5000,
      overall_roas: 5,
      created_at: new Date().toISOString(),
      is_deleted: false,
      calculation_method: "auto",
      buyers: [{ name: "Buyer A" }]
    }];

    (supabase.from as any).mockImplementation((table: string) => {
      if (table === "attribution_sessions") {
        return {
          select: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          limit: vi.fn().mockReturnThis(),
          then: vi.fn().mockImplementation((cb) => cb({ data: mockData, error: null })),
        };
      }
      return {
        select: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        then: vi.fn().mockImplementation((cb) => cb({ data: [], error: null })),
      };
    });

    renderReports();

    // Verification: Search for the webinar name in the document
    await waitFor(() => {
      expect(screen.getByText("Test Webinar Attribution")).toBeInTheDocument();
    });

    // Check summary card stats (rendered via CategoryCard)
    expect(screen.getByText("Total Revenue")).toBeInTheDocument();
    // inr(5000) might be formatted, but we can look for "5,000"
    expect(screen.getAllByText(/5,000/)).toHaveLength(2); // One in card, one in table row
    expect(screen.getByText("100")).toBeInTheDocument(); // Leads
    expect(screen.getByText("10")).toBeInTheDocument(); // Sales
    expect(screen.getByText("5.00×")).toBeInTheDocument(); // ROAS
  });

  it("should render seminar_roas_reports list with mocked data", async () => {
    const mockData = [{
      id: "seminar-1",
      webinar_name: "Test Seminar Report",
      total_webinar_days: 3,
      watch_point_percent: 50,
      total_revenue_including_gst: 10000,
      total_ad_spend_including_gst: 2000,
      total_conversions: 20,
      profit_after_gst: 8000,
      cpa: 100,
      roas: 5,
      is_deleted: false,
      created_at: new Date().toISOString()
    }];

    (supabase.from as any).mockImplementation((table: string) => {
      if (table === "seminar_roas_reports") {
        return {
          select: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          limit: vi.fn().mockReturnThis(),
          then: vi.fn().mockImplementation((cb) => cb({ data: mockData, error: null })),
        };
      }
      return {
        select: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        then: vi.fn().mockImplementation((cb) => cb({ data: [], error: null })),
      };
    });

    renderReports();

    // Switch to Seminar section
    const seminarTab = screen.getByText("Seminar ROAS Reports");
    seminarTab.click();

    await waitFor(() => {
      expect(screen.getByText("Test Seminar Report")).toBeInTheDocument();
    });

    expect(screen.getByText("10,000")).toBeInTheDocument();
    expect(screen.getByText("8,000")).toBeInTheDocument();
    expect(screen.getByText("5.00×")).toBeInTheDocument();
  });

  it("should render profit_statements list with mocked data", async () => {
    const mockData = [{
      id: "profit-1",
      business_unit: "Test Unit",
      statement_month: "2026-07-01",
      status: "posted",
      total_revenue: 20000,
      total_cogs: 5000,
      gross_profit: 15000,
      total_payroll: 4000,
      net_profit: 11000,
      net_margin: 55,
      is_deleted: false
    }];

    (supabase.from as any).mockImplementation((table: string) => {
      if (table === "profit_statements") {
        return {
          select: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          limit: vi.fn().mockReturnThis(),
          then: vi.fn().mockImplementation((cb) => cb({ data: mockData, error: null })),
        };
      }
      return {
        select: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        then: vi.fn().mockImplementation((cb) => cb({ data: [], error: null })),
      };
    });

    renderReports();

    const profitTab = screen.getByText("Profit Statements");
    profitTab.click();

    await waitFor(() => {
      expect(screen.getByText("Test Unit")).toBeInTheDocument();
    });

    expect(screen.getByText("20,000")).toBeInTheDocument();
    expect(screen.getByText("11,000")).toBeInTheDocument();
    expect(screen.getByText("55.0%")).toBeInTheDocument();
    expect(screen.getByText("posted")).toBeInTheDocument();
  });

  it("should render offline_seminar_reports list with mocked data", async () => {
    const mockData = [{
      id: "offline-1",
      event_name: "Test Offline Event",
      event_date: "2026-08-05",
      city: "Mumbai",
      tickets_sold: 150,
      program_sales_count: 25,
      total_cost: 3000,
      total_realized_revenue: 15000,
      net_profit: 12000,
      realized_roas: 5,
      is_deleted: false,
      created_at: new Date().toISOString()
    }];

    (supabase.from as any).mockImplementation((table: string) => {
      if (table === "offline_seminar_reports") {
        return {
          select: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          limit: vi.fn().mockReturnThis(),
          then: vi.fn().mockImplementation((cb) => cb({ data: mockData, error: null })),
        };
      }
      return {
        select: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        then: vi.fn().mockImplementation((cb) => cb({ data: [], error: null })),
      };
    });

    renderReports();

    const offlineTab = screen.getByText("Offline Seminar Reports");
    offlineTab.click();

    await waitFor(() => {
      expect(screen.getByText("Test Offline Event")).toBeInTheDocument();
    });

    expect(screen.getByText("Mumbai")).toBeInTheDocument();
    expect(screen.getByText("150")).toBeInTheDocument();
    expect(screen.getByText("25")).toBeInTheDocument();
    expect(screen.getByText("15,000")).toBeInTheDocument();
    expect(screen.getByText("12,000")).toBeInTheDocument();
    expect(screen.getByText("5.00×")).toBeInTheDocument();
  });
});
