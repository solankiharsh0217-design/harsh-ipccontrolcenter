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
      then: vi.fn().mockImplementation((cb) => cb({ data: [], error: null })),
    }));
  });

  it("should render attribution_sessions list with mocked data", async () => {
    const mockData = [{
      id: "attr-1",
      webinar_name: "Test Webinar Attribution",
      webinar_date: "2026-08-01",
      webinar_type: "paid",
      total_leads: 101,
      total_sales: 11,
      total_ad_spend: 1001,
      total_revenue: 5001,
      overall_roas: 5.01,
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

    await waitFor(() => {
      expect(screen.getByText("Test Webinar Attribution")).toBeInTheDocument();
    });

    expect(screen.queryAllByText(/₹5,001/).length).toBeGreaterThan(0);
    expect(screen.queryAllByText("101").length).toBeGreaterThan(0);
    expect(screen.queryAllByText("11").length).toBeGreaterThan(0);
    // ROAS might be calculated or formatted slightly differently (e.g., 5.01x)
    // The previous fail showed 0, so we check if any text contains 5.01
    expect(screen.queryAllByText(/5\.01/).length).toBeGreaterThan(0);
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

    const seminarCard = screen.getByRole("button", { name: /Seminar ROAS Reports/i });
    fireEvent.click(seminarCard);

    await waitFor(() => {
      expect(screen.getByText("Test Seminar Report")).toBeInTheDocument();
    });

    expect(screen.queryAllByText(/₹10,002/).length).toBeGreaterThan(0);
    expect(screen.queryAllByText(/₹8,002/).length).toBeGreaterThan(0);
    expect(screen.queryAllByText(/5\.02/).length).toBeGreaterThan(0);
  });

  it("should render profit_statements list with mocked data", async () => {
    const mockData = [{
      id: "profit-1",
      business_unit: "Test Unit",
      statement_month: "2026-07-01",
      status: "posted",
      total_revenue: 20003,
      total_cogs: 5003,
      gross_profit: 15003,
      total_payroll: 4003,
      net_profit: 11003,
      net_margin: 55.03,
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

    const profitCard = screen.getByRole("button", { name: /Profit Statements/i });
    fireEvent.click(profitCard);

    await waitFor(() => {
      expect(screen.queryAllByText("Test Unit").length).toBeGreaterThan(0);
    });

    expect(screen.queryAllByText(/₹20,003/).length).toBeGreaterThan(0);
    expect(screen.queryAllByText(/₹11,003/).length).toBeGreaterThan(0);
    expect(screen.queryAllByText(/55\.0/).length).toBeGreaterThan(0);
    expect(screen.queryAllByText("posted").length).toBeGreaterThan(0);
  });

  it("should render offline_seminar_reports list with mocked data", async () => {
    const mockData = [{
      id: "offline-1",
      event_name: "Test Offline Event",
      event_date: "2026-08-05",
      city: "Mumbai",
      tickets_sold: 154,
      program_sales_count: 24,
      total_cost: 3004,
      total_realized_revenue: 15004,
      net_profit: 12004,
      realized_roas: 5.04,
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

    const offlineCard = screen.getByRole("button", { name: /Offline Seminar Reports/i });
    fireEvent.click(offlineCard);

    await waitFor(() => {
      expect(screen.getByText("Test Offline Event")).toBeInTheDocument();
    });

    expect(screen.queryAllByText("Mumbai").length).toBeGreaterThan(0);
    expect(screen.queryAllByText("154").length).toBeGreaterThan(0);
    expect(screen.queryAllByText("24").length).toBeGreaterThan(0);
    expect(screen.queryAllByText(/₹15,004/).length).toBeGreaterThan(0);
    expect(screen.queryAllByText(/₹12,004/).length).toBeGreaterThan(0);
    expect(screen.queryAllByText(/5\.04/).length).toBeGreaterThan(0);
  });
});
