import { render, screen, cleanup, fireEvent, waitFor, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import PaidPipelineLeadDrawer from "./PaidPipelineLeadDrawer";
import { MemoryRouter } from "react-router-dom";
import * as AuthModule from "@/context/AuthContext";
import * as accessVerification from "@/lib/accessVerification";

// Mock the Tabs component
vi.mock("@/components/ui/tabs", () => ({
  Tabs: ({ children, value, onValueChange }: any) => (
    <div data-testid="mock-tabs" data-value={value} onClick={(e: any) => {
      const target = (e.target as HTMLElement).closest('[role="tab"]');
      if (target) {
        onValueChange?.(target.getAttribute('data-value'));
      }
    }}>{children}</div>
  ),
  TabsList: ({ children }: any) => <div role="tablist">{children}</div>,
  TabsTrigger: ({ children, value }: any) => (
    <button role="tab" data-value={value} aria-label={value}>{children}</button>
  ),
  TabsContent: ({ children, value }: any) => (
    <div role="tabpanel" data-value={value} style={{ display: 'block' }}>{children}</div>
  ),
}));

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
    update: vi.fn().mockReturnThis(),
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-123" } }, error: null }),
    },
  },
}));

vi.mock("@/lib/paidPipeline", () => ({
  inr: (val: any) => `INR_${val}_MOCK`,
  recomputePaidLead: vi.fn(),
  fmtDate: (d: string) => d,
}));

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
  deal_value_including_gst: 1500
};

const defaultProps = {
  stages: ["New", "Balance Pending", "Fully Paid"],
  agents: [],
  onChanged: vi.fn(),
  onClose: vi.fn(),
};

describe("PaidPipelineLeadDrawer Visuals and Defaults", () => {
  beforeEach(() => {
    vi.spyOn(AuthModule, "useAuth").mockReturnValue(mockAuthContext as any);
    (accessVerification.fetchVerificationForPaidLead as any).mockResolvedValue({});
    (accessVerification.computeOverall as any).mockReturnValue("completed");
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("shows loading spinner briefly then renders the drawer", async () => {
    let resolveVerification: any;
    const promise = new Promise((resolve) => { resolveVerification = resolve; });
    (accessVerification.fetchVerificationForPaidLead as any).mockReturnValue(promise);

    render(
      <MemoryRouter>
        <PaidPipelineLeadDrawer {...defaultProps} lead={mockLead as any} />
      </MemoryRouter>
    );

    expect(screen.getByTestId("drawer-loader")).toBeDefined();
    
    await act(async () => {
      resolveVerification({});
    });

    await waitFor(() => {
      expect(screen.queryByTestId("drawer-loader")).toBeNull();
    }, { timeout: 2000 });
  });

  it("contains all six tab labels", async () => {
    await act(async () => {
      render(
        <MemoryRouter>
          <PaidPipelineLeadDrawer {...defaultProps} lead={mockLead as any} />
        </MemoryRouter>
      );
    });

    await waitFor(() => expect(screen.queryByTestId("drawer-loader")).toBeNull());

    const expectedTabs = ["Overview", "Payments", "Onboarding", "Documents", "Offers & Delivery", "Activity"];
    for (const tab of expectedTabs) {
      expect(screen.getAllByRole("tab", { name: new RegExp(tab, "i") }).length).toBeGreaterThan(0);
    }
  });

  it("renders expected section headings when clicking tabs", async () => {
    await act(async () => {
      render(
        <MemoryRouter>
          <PaidPipelineLeadDrawer {...defaultProps} lead={mockLead as any} />
        </MemoryRouter>
      );
    });

    await waitFor(() => expect(screen.queryByTestId("drawer-loader")).toBeNull());

    // Overview
    expect(screen.queryAllByText(/Next Follow-up/i).length).toBeGreaterThan(0);

    // Payments
    fireEvent.click(screen.getByRole("tab", { name: /Payments/i }));
    expect(screen.getByText(/Finance \/ EMI/i)).toBeDefined();

    // Onboarding
    fireEvent.click(screen.getByRole("tab", { name: /Onboarding/i }));
    expect(screen.getByText(/Batch information/i)).toBeDefined();
  });

  it("shows finance figures in header and summary", async () => {
    await act(async () => {
      render(
        <MemoryRouter>
          <PaidPipelineLeadDrawer {...defaultProps} lead={mockLead as any} />
        </MemoryRouter>
      );
    });
    
    await waitFor(() => expect(screen.queryByTestId("drawer-loader")).toBeNull());

    const findFinance = (val: string) => screen.queryAllByText((content, element) => {
      const text = element?.textContent || "";
      return text.includes(val);
    });

    expect(findFinance("INR_1000_MOCK").length).toBeGreaterThan(0);
    expect(findFinance("INR_500_MOCK").length).toBeGreaterThan(0);
  });

  it("primary action button label changes correctly", async () => {
    const { rerender } = render(
      <MemoryRouter>
        <PaidPipelineLeadDrawer {...defaultProps} lead={{...mockLead, token_amount_collected: 0} as any} />
      </MemoryRouter>
    );
    await waitFor(() => expect(screen.queryByTestId("drawer-loader")).toBeNull());
    expect(screen.getAllByText("Record Token Payment").length).toBeGreaterThan(0);

    rerender(
      <MemoryRouter>
        <PaidPipelineLeadDrawer {...defaultProps} lead={{...mockLead, token_amount_collected: 100, balance_pending: 1000} as any} />
      </MemoryRouter>
    );
    // Fixed: Use filter instead of className in options
    const primaryBtns = screen.getAllByRole("button", { name: /Add Payment/i });
    const primaryBtn = primaryBtns.find(btn => btn.className.includes("ipc-btn-black"));
    expect(primaryBtn).toBeDefined();

    rerender(
      <MemoryRouter>
        <PaidPipelineLeadDrawer {...defaultProps} lead={{...mockLead, pipeline_stage: "Operations Ready", balance_pending: 0} as any} />
      </MemoryRouter>
    );
    expect(screen.getAllByText("Send to Operations CRM").length).toBeGreaterThan(0);
  });

  it("defaults to correct tab based on blockers", async () => {
    const { rerender } = render(
      <MemoryRouter>
        <PaidPipelineLeadDrawer {...defaultProps} lead={{...mockLead, balance_pending: 1000} as any} />
      </MemoryRouter>
    );
    await waitFor(() => expect(screen.queryByTestId("drawer-loader")).toBeNull());
    expect(screen.getByTestId("mock-tabs").getAttribute("data-value")).toBe("payments");

    rerender(
      <MemoryRouter>
        <PaidPipelineLeadDrawer {...defaultProps} lead={{...mockLead, balance_pending: 0, code_of_conduct_status: "pending"} as any} />
      </MemoryRouter>
    );
    expect(screen.getByTestId("mock-tabs").getAttribute("data-value")).toBe("documents");
  });
});
