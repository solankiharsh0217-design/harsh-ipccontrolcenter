import { render, screen, cleanup, fireEvent, waitFor, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import PaidPipelineLeadDrawer from "./PaidPipelineLeadDrawer";
import { BrowserRouter } from "react-router-dom";
import * as AuthModule from "@/context/AuthContext";
import * as accessVerification from "@/lib/accessVerification";

vi.mock("@/lib/accessVerification", () => ({
  fetchVerificationForPaidLead: vi.fn().mockResolvedValue(null),
  computeOverall: vi.fn().mockReturnValue("completed"),
  WHATSAPP_LABELS: { unknown: "Unknown", joined_verified: "Joined — verified" },
  APP_LOGIN_LABELS: { unknown: "Unknown", logged_in: "Logged in" },
  CALL_LABELS: { not_called: "Not called" },
}));

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

// Mock the Tabs component because Radix Tabs can be tricky in JSDOM
vi.mock("@/components/ui/tabs", () => ({
  Tabs: ({ children, value, onValueChange }: any) => (
    <div data-testid="mock-tabs" data-value={value} onClick={(e: any) => {
      const target = e.target.closest('[role="tab"]');
      if (target) {
        onValueChange?.(target.getAttribute('data-value'));
      }
    }}>{children}</div>
  ),
  TabsList: ({ children }: any) => <div role="tablist">{children}</div>,
  TabsTrigger: ({ children, value }: any) => (
    <button role="tab" data-value={value}>{children}</button>
  ),
  TabsContent: ({ children, value }: any) => (
    <div role="tabpanel" data-value={value} style={{ display: 'block' }}>{children}</div>
  ),
}));

const mockAuthContext = {
  user: { id: "user-123" },
  isAdmin: true,
};

const mockLead = {
  id: "l1",
  full_name: "Test Lead",
  pipeline_stage: "New",
  balance_pending: 1000,
  total_collected: 500,
  token_amount_collected: 100,
  finance_emi_status: "Approved",
  finance_emi_amount: 500,
  finance_collected_amount: 250,
  payments: [
    { id: "p1", amount: 200, description: "Desc 1", created_at: "2024-01-01" },
    { id: "p2", amount: 200, description: "Desc 2", created_at: "2024-01-02" },
    { id: "p3", amount: 100, description: "Desc 3", created_at: "2024-01-03" },
  ]
};

const defaultProps = {
  stages: ["New", "Balance Pending", "Fully Paid"],
  agents: [],
  onChanged: vi.fn(),
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
    await act(async () => {
      render(
        <BrowserRouter>
          <PaidPipelineLeadDrawer {...defaultProps} lead={mockLead as any} open={true} onClose={vi.fn()} />
        </BrowserRouter>
      );
    });

    // 1. Overview Tab checks
    expect(screen.getAllByText("₹1,000").length).toBeGreaterThan(0);

    // 2. Switch to Payments Tab
    const paymentsTrigger = screen.getByRole("tab", { name: /Payments/i });
    
    await act(async () => {
      fireEvent.click(paymentsTrigger);
    });

    // 3. Verify content
    await waitFor(() => {
        expect(screen.getByText(/Finance \/ EMI/i)).toBeInTheDocument();
        expect(screen.getByText(/Desc 1/i)).toBeInTheDocument();
        expect(screen.getAllByText("₹1,000").length).toBeGreaterThan(0);
        
        // Verify row count
        const rows = document.querySelectorAll('tbody tr');
        expect(rows.length).toBe(3);
    }, { timeout: 4000 });
  });
});
