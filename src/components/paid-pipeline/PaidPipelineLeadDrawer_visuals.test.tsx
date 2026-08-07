import { render, screen, cleanup, fireEvent, waitFor, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import PaidPipelineLeadDrawer from "./PaidPipelineLeadDrawer";
import { BrowserRouter } from "react-router-dom";
import * as AuthModule from "@/context/AuthContext";
import * as accessVerification from "@/lib/accessVerification";

// Set globals to avoid Radix issues in tests
global.ResizeObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
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
  TabsTrigger: ({ children, value, 'data-state': dataState }: any) => (
    <button role="tab" data-value={value} data-state={dataState}>{children}</button>
  ),
  TabsContent: ({ children, value }: any) => (
    <div role="tabpanel" data-value={value} style={{ display: 'block' }}>{children}</div>
  ),
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
  inr: (val: number) => `₹${Number(val).toLocaleString("en-IN")}`,
  recomputePaidLead: vi.fn(),
  fmtDate: (d: string) => d,
}));

vi.mock("@/lib/auditLog", () => ({
  logActivity: vi.fn(),
  logPaidLeadDiff: vi.fn(),
}));

vi.mock("@/lib/accessVerification", () => ({
  fetchVerificationForPaidLead: vi.fn(),
  computeOverall: vi.fn(),
  WHATSAPP_LABELS: { unknown: "Unknown", joined_verified: "Joined — verified" },
  APP_LOGIN_LABELS: { unknown: "Unknown", logged_in: "Logged in" },
  CALL_LABELS: { not_called: "Not called" },
}));

const mockAuthContext = {
  user: { id: "user-123" },
  isAdmin: true,
  loading: false,
};

const defaultProps = {
  onClose: vi.fn(),
  stages: ["New", "Token Paid", "Balance Pending", "Operations Ready"],
  agents: [{ id: "agent-1", full_name: "Agent One" }],
  onChanged: vi.fn(),
};

describe("PaidPipelineLeadDrawer Visuals and Defaults", () => {
  beforeEach(() => {
    vi.spyOn(AuthModule, "useAuth").mockReturnValue(mockAuthContext as any);
    (accessVerification.fetchVerificationForPaidLead as any).mockResolvedValue(null);
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
      <BrowserRouter>
        <PaidPipelineLeadDrawer {...defaultProps} lead={{ id: "l1", name: "Test" } as any} />
      </BrowserRouter>
    );

    expect(screen.getByText(/Initializing drawer…/i)).toBeDefined();
    
    await act(async () => {
      resolveVerification(null);
    });

    await waitFor(() => {
      expect(screen.queryByText(/Initializing drawer…/i)).toBeNull();
      expect(screen.getByText("Test")).toBeDefined();
    });
  });

  it("contains all six tab labels", async () => {
    await act(async () => {
      render(
        <BrowserRouter>
          <PaidPipelineLeadDrawer {...defaultProps} lead={{ id: "l1", name: "Test" } as any} />
        </BrowserRouter>
      );
    });

    const expectedTabs = ["Overview", "Payments", "Onboarding", "Documents", "Offers & Delivery", "Activity"];
    expectedTabs.forEach(tab => {
      expect(screen.getAllByRole("tab", { name: new RegExp(tab, "i") }).length).toBeGreaterThan(0);
    });
  });

  it("renders expected section headings when clicking tabs", async () => {
    await act(async () => {
      render(
        <BrowserRouter>
          <PaidPipelineLeadDrawer {...defaultProps} lead={{ id: "l1", name: "Test" } as any} />
        </BrowserRouter>
      );
    });

    // Overview (default)
    expect(screen.getByText(/Next Follow-up/i)).toBeDefined();

    // Payments
    fireEvent.click(screen.getByRole("tab", { name: /Payments/i }));
    expect(screen.getByText(/Finance \/ EMI/i)).toBeDefined();
    expect(screen.getByText(/Payment History/i)).toBeDefined();

    // Onboarding
    fireEvent.click(screen.getByRole("tab", { name: /Onboarding/i }));
    expect(screen.getByText(/Batch information/i)).toBeDefined();

    // Documents
    fireEvent.click(screen.getByRole("tab", { name: /Documents/i }));
    expect(screen.getByText(/Code of Conduct Status/i)).toBeDefined();

    // Offers & Delivery
    fireEvent.click(screen.getByRole("tab", { name: /Offers & Delivery/i }));
    expect(screen.getByText(/Promised Offers/i)).toBeDefined();

    // Activity
    fireEvent.click(screen.getByRole("tab", { name: /Activity/i }));
    expect(screen.getByText(/No activity logs found/i)).toBeDefined();
  });

  it("shows exactly one balance/collected/token figure in overview summary", async () => {
    const lead = {
      id: "l1",
      balance_pending: 1000,
      total_collected: 5000,
      token_amount_collected: 2000,
      deal_value_including_gst: 7000,
    } as any;

    await act(async () => {
      render(
        <BrowserRouter>
          <PaidPipelineLeadDrawer {...defaultProps} lead={lead} />
        </BrowserRouter>
      );
    });

    // We expect the figures themselves to be in the Overview summary section
    expect(screen.getByText("₹1,000")).toBeDefined();
    expect(screen.getByText("₹5,000")).toBeDefined();
    expect(screen.getByText("₹2,000")).toBeDefined();
  });

  const actionScenarios = [
    { lead: { token_amount_collected: 0, balance_pending: 5000 }, expected: "Record Token Payment" },
    { lead: { token_amount_collected: 2000, balance_pending: 3000 }, expected: "Add Payment" },
    { lead: { token_amount_collected: 5000, balance_pending: 0, pipeline_stage: "Paid" }, expected: "Update Status" },
    { lead: { token_amount_collected: 5000, balance_pending: 0, pipeline_stage: "Operations Ready" }, expected: "Send to Operations CRM" },
  ];

  actionScenarios.forEach(({ lead, expected }) => {
    it(`primary action button is "${expected}" for lead state`, async () => {
      await act(async () => {
        render(
          <BrowserRouter>
            <PaidPipelineLeadDrawer {...defaultProps} lead={{ id: "l1", ...lead } as any} />
          </BrowserRouter>
        );
      });
      expect(screen.getByText(new RegExp(expected, "i"))).toBeDefined();
    });
  });

  it("defaults to Payments tab when token is missing", async () => {
    const lead = { id: "l1", token_amount_collected: 0, balance_pending: 5000 } as any;
    await act(async () => {
      render(<BrowserRouter><PaidPipelineLeadDrawer {...defaultProps} lead={lead} /></BrowserRouter>);
    });
    const paymentsTab = screen.getByRole("tab", { name: /Payments/i });
    expect(paymentsTab.getAttribute("data-state")).toBe("active");
  });

  it("defaults to Documents tab when CoC is pending", async () => {
    const lead = { id: "l1", token_amount_collected: 1000, balance_pending: 0, code_of_conduct_status: "pending" } as any;
    await act(async () => {
      render(<BrowserRouter><PaidPipelineLeadDrawer {...defaultProps} lead={lead} /></BrowserRouter>);
    });
    const docsTab = screen.getByRole("tab", { name: /Documents/i });
    expect(docsTab.getAttribute("data-state")).toBe("active");
  });

  it("defaults to Onboarding tab when access verification is incomplete", async () => {
    (accessVerification.computeOverall as any).mockReturnValue("incomplete");
    const lead = { id: "l1", token_amount_collected: 1000, balance_pending: 0, code_of_conduct_status: "completed" } as any;
    await act(async () => {
      render(<BrowserRouter><PaidPipelineLeadDrawer {...defaultProps} lead={lead} /></BrowserRouter>);
    });
    const onboardingTab = screen.getByRole("tab", { name: /Onboarding/i });
    expect(onboardingTab.getAttribute("data-state")).toBe("active");
  });

  it("defaults to Offers & Delivery tab when operations ready", async () => {
    (accessVerification.computeOverall as any).mockReturnValue("completed");
    const lead = { id: "l1", token_amount_collected: 1000, balance_pending: 0, code_of_conduct_status: "completed", pipeline_stage: "Operations Ready" } as any;
    await act(async () => {
      render(<BrowserRouter><PaidPipelineLeadDrawer {...defaultProps} lead={lead} /></BrowserRouter>);
    });
    const offersTab = screen.getByRole("tab", { name: /Offers & Delivery/i });
    expect(offersTab.getAttribute("data-state")).toBe("active");
  });
});
