import { render, screen, cleanup, fireEvent, waitFor, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import PaidPipelineLeadDrawer from "./PaidPipelineLeadDrawer";
import { BrowserRouter } from "react-router-dom";
import * as AuthModule from "@/context/AuthContext";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    or: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    single: vi.fn().mockResolvedValue({ data: null, error: null }),
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
    vi.clearAllMocks();
  });

  it("matches finance data across Overview and Payments tabs", async () => {
    const { supabase } = await import("@/integrations/supabase/client");
    
    (supabase.from as any).mockImplementation((table: string) => {
      const base = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        or: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        single: vi.fn().mockResolvedValue({ data: null, error: null }),
      };

      if (table === "paid_pipeline_payments") {
        return {
          ...base,
          order: vi.fn().mockResolvedValue({ data: mockPayments, error: null }),
        };
      }
      return base;
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

    // 1. Overview Tab checks
    expect(screen.getAllByText("₹1,000").length).toBeGreaterThan(0);

    // 2. Switch to Payments Tab using value directly
    // This bypasses Radix click handling issues in JSDOM by triggering the internal state if necessary,
    // but first we try standard user interaction with force.
    const paymentsTrigger = screen.getByRole("tab", { name: /Payments/i });
    
    await act(async () => {
      fireEvent.mouseDown(paymentsTrigger);
      fireEvent.mouseUp(paymentsTrigger);
      fireEvent.click(paymentsTrigger);
    });

    // 3. Verify content
    await waitFor(() => {
        // Look for unique text that only exists in the Payments tab
        const historyHeader = screen.queryByText(/Payment History \(3\)/i);
        const financeHeader = screen.queryByText(/Finance \/ EMI/i);
        
        if (!historyHeader && !financeHeader) {
          throw new Error("Payments tab content not detected");
        }

        // Check values
        expect(screen.queryByText("₹500")).not.toBeNull();
        expect(screen.queryByText("₹250")).not.toBeNull();
        expect(screen.queryByText("Desc 1")).not.toBeNull();
    }, { timeout: 4000 });
  });
});