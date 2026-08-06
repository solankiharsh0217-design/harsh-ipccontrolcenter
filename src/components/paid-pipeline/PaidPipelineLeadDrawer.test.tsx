import { render, screen, within, cleanup, fireEvent, waitFor } from "@testing-library/react";
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
            order: vi.fn(() => Promise.resolve({ data: [], error: null })),
          })),
          maybeSingle: vi.fn(() => Promise.resolve({ data: null, error: null })),
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
  finance_required_amount: 1000, // Match balance_pending for the test
  finance_approved_amount: 500,
  finance_disbursed_amount: 250,
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

  it("Overview Tab renders correctly", () => {
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

    expect(screen.getAllByText("₹1,000").length).toBeGreaterThan(0);
    expect(screen.getAllByText("₹2,000").length).toBeGreaterThan(0);
    expect(screen.getAllByText("₹3,000").length).toBeGreaterThan(0);
  });

  it("Payments Tab renders correctly with history and matching finance balance", async () => {
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
        order: vi.fn().mockResolvedValue({ data: [], error: null }),
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      };
    });

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

    // Click the trigger directly using data-state="inactive" check if needed, 
    // but just finding by text or role should work if it's rendered.
    const paymentsTabTrigger = screen.getByRole("tab", { name: /Payments/i });
    fireEvent.click(paymentsTabTrigger);

    // 1. Check correct number of rows for 3 payment records
    // State might take a tick to update 'payments' state variable in the component
    await waitFor(() => {
        // Look specifically for the table body rows
        const table = screen.getByRole("table");
        const tbody = table.querySelector("tbody");
        const rows = within(tbody!).getAllByRole("row");
        expect(rows.length).toBe(3);
    }, { timeout: 2000 });

    // 2. Check Finance/EMI card balance matches Overview (₹1,000)
    const financeHeading = screen.getByText(/Finance \/ EMI/i);
    const financeCard = financeHeading.closest("div");
    expect(within(financeCard!).getByText("₹1,000")).toBeDefined();
  });
});