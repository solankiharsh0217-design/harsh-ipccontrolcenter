import { render, screen, cleanup, waitFor, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import PaidPipelineLeadDrawer from "./PaidPipelineLeadDrawer";
import { MemoryRouter } from "react-router-dom";
import * as AuthModule from "@/context/AuthContext";
import * as accessVerification from "@/lib/accessVerification";

vi.mock("@/components/ui/tabs", () => ({
  Tabs: ({ children, value }: any) => <div data-testid="mock-tabs" data-value={value}>{children}</div>,
  TabsList: ({ children }: any) => <div>{children}</div>,
  TabsTrigger: ({ children, value }: any) => <button>{children}</button>,
  TabsContent: ({ children }: any) => <div>{children}</div>,
}));

vi.mock("@/lib/accessVerification", () => ({
  fetchVerificationForPaidLead: vi.fn().mockResolvedValue({}),
  computeOverall: vi.fn().mockReturnValue("completed"),
  WHATSAPP_LABELS: {}, APP_LOGIN_LABELS: {}, CALL_LABELS: {},
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: null }),
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "u" } } }) },
  },
}));

vi.mock("@/lib/paidPipeline", () => ({
  inr: (val: any) => `INR_${val}_MOCK`,
  recomputePaidLead: vi.fn(),
  fmtDate: (d: string) => d,
}));

const mockAuthContext = { user: { id: "u" }, isAdmin: true };
const mockLead = {
  id: "l1", full_name: "Test", pipeline_stage: "New",
  balance_pending: 1000, total_collected: 500, token_amount_collected: 100, deal_value_including_gst: 1500
};

describe("PaidPipelineLeadDrawer Visuals & Logic", () => {
  beforeEach(() => { vi.spyOn(AuthModule, "useAuth").mockReturnValue(mockAuthContext as any); });
  afterEach(cleanup);

  it("renders all tabs and defaults based on stage", async () => {
    await act(async () => {
      render(<MemoryRouter><PaidPipelineLeadDrawer stages={[]} agents={[]} onChanged={() => {}} onClose={() => {}} lead={mockLead as any} /></MemoryRouter>);
    });
    await waitFor(() => expect(screen.queryByText(/Initializing/)).toBeNull());

    expect(screen.getByText("Overview")).toBeTruthy();
    expect(screen.getByText("Payments")).toBeTruthy();
    expect(screen.getByText("Onboarding")).toBeTruthy();
    
    // Check finance markers
    expect(screen.queryAllByText(/INR_1000_MOCK/)).toHaveLength(1);
    expect(screen.queryAllByText(/INR_500_MOCK/)).toHaveLength(1);

    // Default tab check (balance pending -> payments)
    expect(screen.getByTestId("mock-tabs").getAttribute("data-value")).toBe("payments");
  });

  it("updates primary action button correctly", async () => {
    const { rerender } = render(<MemoryRouter><PaidPipelineLeadDrawer stages={[]} agents={[]} onChanged={() => {}} onClose={() => {}} lead={{...mockLead, token_amount_collected: 0} as any} /></MemoryRouter>);
    await waitFor(() => expect(screen.queryByText(/Initializing/)).toBeNull());
    expect(screen.getByText("Record Token Payment")).toBeTruthy();

    await act(async () => {
      rerender(<MemoryRouter><PaidPipelineLeadDrawer stages={[]} agents={[]} onChanged={() => {}} onClose={() => {}} lead={{...mockLead, token_amount_collected: 100, balance_pending: 1000} as any} /></MemoryRouter>);
    });
    expect(screen.getByText("Add Payment")).toBeTruthy();
  });
});
