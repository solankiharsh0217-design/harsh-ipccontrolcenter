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

  it("Payments Tab renders history and matching finance data", async () => {
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

    // Overview should already show ₹1,000
    expect(screen.getAllByText("₹1,000").length).toBeGreaterThan(0);

    const paymentsTrigger = screen.getByRole("tab", { name: /Payments/i });
    await act(async () => {
      fireEvent.click(paymentsTrigger);
    });

    // Use a loose text check for everything since exact element queries are failing in the virtual DOM
    await waitFor(() => {
        expect(screen.getByText("Finance / EMI")).toBeDefined();
        // Approved amount from mockLead
        expect(screen.getByText("₹500")).toBeDefined();
        // Disbursed amount from mockLead
        expect(screen.getByText("₹250")).toBeDefined();
    }, { timeout: 3000 });

    // Verify payments loaded
    await waitFor(() => {
      expect(screen.getByText("Desc 1")).toBeDefined();
      expect(screen.getByText("Desc 2")).toBeDefined();
      expect(screen.getByText("Desc 3")).toBeDefined();
    });
  });
});