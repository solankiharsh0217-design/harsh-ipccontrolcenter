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
  TabsContent: ({ children, value }: any) => <div data-testid={`tab-content-${value}`}>{children}</div>,
}));

vi.mock("@/lib/accessVerification", () => ({
  fetchVerificationForPaidLead: vi.fn().mockResolvedValue({}),
  computeOverall: vi.fn().mockReturnValue("completed"),
  WHATSAPP_LABELS: {}, APP_LOGIN_LABELS: {}, CALL_LABELS: {},
}));

vi.mock("@/integrations/supabase/client", () => {
  const mockQuery = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    or: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    single: vi.fn().mockResolvedValue({ data: null, error: null }),
    insert: vi.fn().mockResolvedValue({ data: null, error: null }),
    update: vi.fn().mockResolvedValue({ data: null, error: null }),
  };
  return {
    supabase: {
      from: vi.fn().mockReturnValue(mockQuery),
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "u" } } }) },
    },
  };
});

vi.mock("@/lib/paidPipeline", () => ({
  inr: (val: any) => `INR_${val}_MOCK`,
  recomputePaidLead: vi.fn(),
  fmtDate: (d: string) => d,
}));

// Mock auditLog to prevent TypeError during tests
vi.mock("@/lib/auditLog", () => ({
  logActivity: vi.fn().mockResolvedValue({}),
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
    
    const bodyText = document.body.textContent || "";
    expect(bodyText).toContain("INR_1000_MOCK");
    expect(bodyText).toContain("INR_500_MOCK");

    const tabs = screen.getAllByTestId("mock-tabs");
    const hasCorrectTab = tabs.some(t => t.getAttribute("data-value") === "payments");
    expect(hasCorrectTab).toBe(true);
  });

  it("updates primary action button correctly across all stages", async () => {
    // 1. New lead (No token)
    const { rerender } = render(<MemoryRouter><PaidPipelineLeadDrawer stages={[]} agents={[]} onChanged={() => {}} onClose={() => {}} lead={{...mockLead, token_amount_collected: 0} as any} /></MemoryRouter>);
    await waitFor(() => expect(screen.queryByText(/Initializing/)).toBeNull());
    expect(screen.getByRole("button", { name: /Record Token Payment/i })).toBeTruthy();

    // 2. Token paid, balance pending
    await act(async () => {
      rerender(<MemoryRouter><PaidPipelineLeadDrawer stages={[]} agents={[]} onChanged={() => {}} onClose={() => {}} lead={{...mockLead, token_amount_collected: 100, balance_pending: 1000} as any} /></MemoryRouter>);
    });
    // The primary action button has specific classes we can use to distinguish it
    const addPaymentBtn = screen.getByRole("button", { 
      name: (content, element) => content.includes("Add Payment") && element?.className.includes("bg-blue-600") 
    } as any);
    expect(addPaymentBtn).toBeTruthy();

    // 3. Fully paid, not yet Operations Ready
    await act(async () => {
      rerender(<MemoryRouter><PaidPipelineLeadDrawer stages={[]} agents={[]} onChanged={() => {}} onClose={() => {}} lead={{...mockLead, balance_pending: 0, pipeline_stage: "Paid"} as any} /></MemoryRouter>);
    });
    expect(screen.getByRole("button", { name: /Update Status/i })).toBeTruthy();

    // 4. Operations Ready
    await act(async () => {
      rerender(<MemoryRouter><PaidPipelineLeadDrawer stages={[]} agents={[]} onChanged={() => {}} onClose={() => {}} lead={{...mockLead, balance_pending: 0, pipeline_stage: "Operations Ready"} as any} /></MemoryRouter>);
    });
    expect(screen.getByRole("button", { name: /Send to Operations CRM/i })).toBeTruthy();
  });

  it("defaults to Onboarding tab when access verification is incomplete", async () => {
    (accessVerification.computeOverall as any).mockReturnValue("incomplete");
    
    // Lead with no other blockers: token paid, balance zero, and CoC marked as Completed
    const readyForVerificationLead = {
      ...mockLead,
      token_amount_collected: 500,
      balance_pending: 0,
      default_tab_override: "overview", // Start at overview to verify the effect of resolveDefaultTab
      code_of_conduct_status: "Completed"
    };

    await act(async () => {
      render(<MemoryRouter><PaidPipelineLeadDrawer stages={[]} agents={[]} onChanged={() => {}} onClose={() => {}} lead={readyForVerificationLead as any} /></MemoryRouter>);
    });
    await waitFor(() => expect(screen.queryByText(/Initializing/)).toBeNull());

    const tabs = screen.getAllByTestId("mock-tabs");
    const activeTab = tabs[0].getAttribute("data-value");
    expect(activeTab).toBe("onboarding");
  });
});
