import { render, screen, cleanup, waitFor, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import PaidPipelineLeadDrawer from "./PaidPipelineLeadDrawer";
import { MemoryRouter } from "react-router-dom";
import * as AuthModule from "@/context/AuthContext";
import * as accessVerification from "@/lib/accessVerification";

vi.mock("@/lib/accessVerification", () => ({
  fetchVerificationForPaidLead: vi.fn(),
  computeOverall: vi.fn(),
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
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-123" } }, error: null }),
    },
  },
}));

vi.mock("@/lib/paidPipeline", () => ({
  inr: (val: any) => `INR_VAL_${val}`,
  recomputePaidLead: vi.fn(),
  fmtDate: (d: string) => d,
}));

// Mock ResizeObserver for Radix UI
global.ResizeObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
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
};

const defaultProps = {
  stages: ["New", "Balance Pending", "Fully Paid"],
  agents: [],
  onChanged: vi.fn(),
  onClose: vi.fn(),
};

describe("PaidPipelineLeadDrawer Finance Suite", () => {
  beforeEach(() => {
    vi.spyOn(AuthModule, "useAuth").mockReturnValue(mockAuthContext as any);
    (accessVerification.fetchVerificationForPaidLead as any).mockResolvedValue({});
    (accessVerification.computeOverall as any).mockReturnValue("completed");
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("matches finance data across Overview and Payments tabs", async () => {
    await act(async () => {
      render(
        <MemoryRouter>
          <PaidPipelineLeadDrawer {...defaultProps} lead={mockLead as any} />
        </MemoryRouter>
      );
    });

    await waitFor(() => expect(screen.queryByText((c) => c.includes("Initializing"))).toBeNull());

    expect(screen.getAllByText("INR_VAL_1000").length).toBeGreaterThan(0);
    expect(screen.getAllByText("INR_VAL_500").length).toBeGreaterThan(0);
    expect(screen.getAllByText("INR_VAL_100").length).toBeGreaterThan(0);
  });
});
