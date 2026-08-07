import { render, screen, cleanup, fireEvent, waitFor, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import PaidPipelineLeadDrawer from "./PaidPipelineLeadDrawer";
import { BrowserRouter } from "react-router-dom";
import * as AuthModule from "@/context/AuthContext";
import * as accessVerification from "@/lib/accessVerification";

// Mock the Tabs component because Radix Tabs can be tricky in JSDOM
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
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-123" } }, error: null }),
    },
  },
}));

vi.mock("@/lib/paidPipeline", () => ({
  inr: (val: number) => `₹${(val || 0).toLocaleString("en-IN")}`,
  recomputePaidLead: vi.fn(),
  fmtDate: (d: string) => d,
}));

// Set globals to avoid Radix issues in tests
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
        <PaidPipelineLeadDrawer {...defaultProps} lead={mockLead as any} />
      </BrowserRouter>
    );

    expect(screen.getByText(/Initializing drawer/i)).toBeDefined();
    
    await act(async () => {
      resolveVerification(null);
    });

    await waitFor(() => {
      expect(screen.queryByText(/Initializing drawer/i)).toBeNull();
      expect(screen.getByText("Test Lead")).toBeDefined();
    });
  });

  it("contains all six tab labels", async () => {
    await act(async () => {
      render(
        <BrowserRouter>
          <PaidPipelineLeadDrawer {...defaultProps} lead={mockLead as any} />
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
          <PaidPipelineLeadDrawer {...defaultProps} lead={mockLead as any} />
        </BrowserRouter>
      );
    });

    await waitFor(() => expect(screen.queryByText(/Initializing drawer/i)).toBeNull());

    // Overview (default)
    expect(screen.getByRole("heading", { name: /Next Follow-up/i })).toBeDefined();

    // Payments
    fireEvent.click(screen.getByRole("tab", { name: /Payments/i }));
    expect(screen.getByText(/Finance \/ EMI/i)).toBeDefined();

    // Onboarding
    fireEvent.click(screen.getByRole("tab", { name: /Onboarding/i }));
    expect(screen.getByText(/Batch information/i)).toBeDefined();

    // Documents
    fireEvent.click(screen.getByRole("tab", { name: /Documents/i }));
    expect(screen.getByText(/Code of Conduct/i)).toBeDefined();
  });

  it("shows exactly one balance/collected/token figure in overview summary", async () => {
    await act(async () => {
      render(
        <BrowserRouter>
          <PaidPipelineLeadDrawer {...defaultProps} lead={mockLead as any} />
        </BrowserRouter>
      );
    });
    
    await waitFor(() => expect(screen.queryByText(/Initializing drawer/i)).toBeNull());

    // Overview tab should show financial summary
    expect(screen.getAllByText("₹1,000").length).toBe(1);
    expect(screen.getAllByText("₹500").length).toBe(1);
    expect(screen.getAllByText("₹100").length).toBe(1);
  });

  it("primary action button is 'Record Token Payment' for lead with no token", async () => {
    const noTokenLead = { ...mockLead, token_amount_collected: 0 };
    await act(async () => {
      render(
        <BrowserRouter>
          <PaidPipelineLeadDrawer {...defaultProps} lead={noTokenLead as any} />
        </BrowserRouter>
      );
    });
    
    await waitFor(() => expect(screen.queryByText(/Initializing drawer/i)).toBeNull());
    expect(screen.getByText("Record Token Payment")).toBeDefined();
  });

  it("primary action button is 'Add Payment' for lead with pending balance", async () => {
    const pendingBalanceLead = { ...mockLead, token_amount_collected: 100, balance_pending: 1000 };
    await act(async () => {
      render(
        <BrowserRouter>
          <PaidPipelineLeadDrawer {...defaultProps} lead={pendingBalanceLead as any} />
        </BrowserRouter>
      );
    });
    
    await waitFor(() => expect(screen.queryByText(/Initializing drawer/i)).toBeNull());
    expect(screen.getByText("Add Payment")).toBeDefined();
  });

  it("primary action button is 'Send to Operations CRM' for operations-ready lead", async () => {
    const readyLead = { ...mockLead, pipeline_stage: "Operations Ready", balance_pending: 0, code_of_conduct_status: "signed" };
    await act(async () => {
      render(
        <BrowserRouter>
          <PaidPipelineLeadDrawer {...defaultProps} lead={readyLead as any} />
        </BrowserRouter>
      );
    });
    
    await waitFor(() => expect(screen.queryByText(/Initializing drawer/i)).toBeNull());
    expect(screen.getByText("Send to Operations CRM")).toBeDefined();
  });

  it("primary action button is 'Update Status' for fully paid but not ready lead", async () => {
    const fullyPaidLead = { ...mockLead, pipeline_stage: "Paid - Documentation Pending", balance_pending: 0, code_of_conduct_status: "pending" };
    await act(async () => {
      render(
        <BrowserRouter>
          <PaidPipelineLeadDrawer {...defaultProps} lead={fullyPaidLead as any} />
        </BrowserRouter>
      );
    });
    
    await waitFor(() => expect(screen.queryByText(/Initializing drawer/i)).toBeNull());
    expect(screen.getByText("Update Status")).toBeDefined();
  });

  it("defaults to Payments tab when balance is pending", async () => {
    const pendingLead = { ...mockLead, balance_pending: 1000 };
    await act(async () => {
      render(
        <BrowserRouter>
          <PaidPipelineLeadDrawer {...defaultProps} lead={pendingLead as any} />
        </BrowserRouter>
      );
    });
    
    await waitFor(() => expect(screen.queryByText(/Initializing drawer/i)).toBeNull());
    const tabs = screen.getByTestId("mock-tabs");
    expect(tabs.getAttribute("data-value")).toBe("payments");
  });

  it("defaults to Documents tab when CoC is pending", async () => {
    const docPendingLead = { ...mockLead, balance_pending: 0, code_of_conduct_status: "pending" };
    await act(async () => {
      render(
        <BrowserRouter>
          <PaidPipelineLeadDrawer {...defaultProps} lead={docPendingLead as any} />
        </BrowserRouter>
      );
    });
    
    await waitFor(() => expect(screen.queryByText(/Initializing drawer/i)).toBeNull());
    const tabs = screen.getByTestId("mock-tabs");
    expect(tabs.getAttribute("data-value")).toBe("documents");
  });

  it("defaults to Onboarding tab when access verification is incomplete", async () => {
    const onboardingPendingLead = { ...mockLead, balance_pending: 0, code_of_conduct_status: "signed" };
    (accessVerification.computeOverall as any).mockReturnValue("pending");

    await act(async () => {
      render(
        <BrowserRouter>
          <PaidPipelineLeadDrawer {...defaultProps} lead={onboardingPendingLead as any} />
        </BrowserRouter>
      );
    });
    
    await waitFor(() => expect(screen.queryByText(/Initializing drawer/i)).toBeNull());
    const tabs = screen.getByTestId("mock-tabs");
    expect(tabs.getAttribute("data-value")).toBe("onboarding");
  });

  it("defaults to Offers & Delivery when operations-ready", async () => {
    const readyLead = { ...mockLead, balance_pending: 0, code_of_conduct_status: "signed", pipeline_stage: "Operations Ready" };
    (accessVerification.computeOverall as any).mockReturnValue("completed");

    await act(async () => {
      render(
        <BrowserRouter>
          <PaidPipelineLeadDrawer {...defaultProps} lead={readyLead as any} />
        </BrowserRouter>
      );
    });
    
    await waitFor(() => expect(screen.queryByText(/Initializing drawer/i)).toBeNull());
    const tabs = screen.getByTestId("mock-tabs");
    expect(tabs.getAttribute("data-value")).toBe("offers");
  });
});
