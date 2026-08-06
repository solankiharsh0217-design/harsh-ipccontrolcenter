import { render, screen, cleanup, fireEvent, waitFor, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import PaidPipelineLeadDrawer from "./PaidPipelineLeadDrawer";
import { BrowserRouter } from "react-router-dom";
import * as AuthModule from "@/context/AuthContext";

// Robust Supabase mock for the entire test suite
const createSupabaseMock = () => {
  const mock = {
    from: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    or: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    single: vi.fn().mockResolvedValue({ data: null, error: null }),
  } as any;
  return mock;
};

vi.mock("@/integrations/supabase/client", () => ({
  supabase: createSupabaseMock(),
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
    
    // Setup specific table mock for payments
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

    // 2. Switch to Payments Tab
    // We target by role/name to ensure we find the trigger regardless of wrapper elements
    const paymentsTrigger = screen.getByRole("tab", { name: /Payments/i });
    
    // Use user-event like fireEvent but wrapped in act
    await act(async () => {
      fireEvent.click(paymentsTrigger);
    });

    // 3. Verify Finance/EMI and Payment History in the tab
    // We use a longer timeout and debug if it fails
    await waitFor(() => {
        const body = document.body.innerHTML;
        // Verify Approved and Disbursed amounts from finance card
        const hasApproved = body.includes("₹500");
        const hasDisbursed = body.includes("₹250");
        
        // Payment history records
        const hasDesc1 = body.includes("Desc 1");
        
        if (!hasApproved || !hasDesc1) {
            throw new Error(`Content not found. Body snippet: ${body.substring(0, 1000)}`);
        }
        
        expect(hasApproved).toBe(true);
        expect(hasDisbursed).toBe(true);
        expect(hasDesc1).toBe(true);
    }, { timeout: 4000 });
  });
});