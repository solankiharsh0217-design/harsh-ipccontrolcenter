import { render, screen, within, cleanup, fireEvent, waitFor, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import PaidPipelineLeadDrawer from "./PaidPipelineLeadDrawer";
import { BrowserRouter } from "react-router-dom";
import * as AuthModule from "@/context/AuthContext";

// Mock the modules used in the component
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() => ({
            order: vi.fn(() => ({
              order: vi.fn(() => Promise.resolve({ data: [], error: null })),
            })),
          })),
          maybeSingle: vi.fn(() => Promise.resolve({ data: null, error: null })),
          order: vi.fn(() => ({
            order: vi.fn(() => Promise.resolve({ data: [], error: null })),
          })),
        })),
        order: vi.fn(() => ({
          order: vi.fn(() => Promise.resolve({ data: [], error: null })),
        })),
      })),
    })),
  },
}));

vi.mock("@/lib/paidPipeline", () => ({
  inr: (val: number) => `₹${val.toLocaleString("en-IN")}`,
  recomputePaidLead: vi.fn(),
  fmtDate: (d: string) => d,
}));

vi.mock("@/lib/auditLog", () => ({
  logActivity: vi.fn(),
  logPaidLeadDiff: vi.fn(),
}));

const mockLead = {
  id: "lead-123",
  name: "Test Lead",
  email: "test@example.com",
  phone: "9876543210",
  pipeline_stage: "New",
  balance_pending: 1000,
  total_collected: 2000,
  token_amount_collected: 3000,
  deal_value_including_gst: 5000,
  finance_required: true,
  finance_amount_approved: 500,
  finance_amount_disbursed: 250,
} as any;

const mockPayments = [
  { id: "p1", payment_date: "2024-01-01", payment_type: "Token", payment_mode: "UPI", amount: 1000, description: "Desc 1" },
  { id: "p2", payment_date: "2024-01-02", payment_type: "Part", payment_mode: "Bank", amount: 2000, description: "Desc 2" },
  { id: "p3", payment_date: "2024-01-03", payment_type: "Full", payment_mode: "Cash", amount: 3000, description: "Desc 3" },
];

const mockAuthContext = {
  user: { id: "user-123" },
  isAdmin: true,
  loading: false,
  signOut: vi.fn(),
};

describe("PaidPipelineLeadDrawer", () => {
  beforeEach(() => {
    vi.spyOn(AuthModule, "useAuth").mockReturnValue(mockAuthContext as any);
  });

  afterEach(() => {
    cleanup();
  });

  it("Overview Tab renders correctly", async () => {
    await act(async () => {
      render(
        <BrowserRouter>
          <PaidPipelineLeadDrawer
            lead={mockLead}
            onClose={vi.fn()}
            stages={[]}
            agents={[]}
            onChanged={vi.fn()}
          />
        </BrowserRouter>
      );
    });

    expect(screen.getAllByText("₹1,000").length).toBeGreaterThan(0);
    expect(screen.getAllByText("₹2,000").length).toBeGreaterThan(0);
    expect(screen.getAllByText("₹3,000").length).toBeGreaterThan(0);
  });

  it("Payments Tab renders correctly with history and matching finance data", async () => {
    const { supabase } = await import("@/integrations/supabase/client");
    (supabase.from as any).mockImplementation((table: string) => {
      if (table === "paid_pipeline_payments") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          order: vi.fn().mockResolvedValue({ data: mockPayments, error: null }),
        };
      }
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      };
    });

    await act(async () => {
      render(
        <BrowserRouter>
          <PaidPipelineLeadDrawer
            lead={mockLead}
            onClose={vi.fn()}
            stages={[]}
            agents={[]}
            onChanged={vi.fn()}
          />
        </BrowserRouter>
      );
    });

    const triggers = screen.getAllByRole("tab");
    const paymentsTrigger = triggers.find(t => t.textContent?.toLowerCase().includes("payments"));
    expect(paymentsTrigger).toBeDefined();

    await act(async () => {
      fireEvent.click(paymentsTrigger!);
    });

    // Verify Approved and Disbursed amounts (finance card)
    await waitFor(() => {
        expect(screen.queryByText("₹500")).not.toBeNull();
        expect(screen.queryByText("₹250")).not.toBeNull();
    });

    // Verify Payment History content
    await waitFor(() => {
        expect(screen.queryByText("2024-01-01")).not.toBeNull();
    });

    expect(screen.getByText("Desc 1")).toBeDefined();
    expect(screen.getByText("Desc 2")).toBeDefined();
    expect(screen.getByText("Desc 3")).toBeDefined();
    
    // Check row count in table body (3 payments)
    const table = screen.getByRole("table");
    const tbody = table.querySelector("tbody");
    const rows = within(tbody!).getAllByRole("row");
    expect(rows.length).toBe(3);
  });
});