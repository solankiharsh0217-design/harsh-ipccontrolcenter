import { render, screen, cleanup, fireEvent, waitFor, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import PaidPipelineLeadDrawer from "./PaidPipelineLeadDrawer";
import { MemoryRouter } from "react-router-dom";
import * as AuthModule from "@/context/AuthContext";
import * as accessVerification from "@/lib/accessVerification";

// Mock the Tabs component to be predictable in JSDOM
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

// Return unique strings that JSDOM won't mangle
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

  it("contains all six tab labels", async () => {
    await act(async () => {
      render(
        <MemoryRouter>
          <PaidPipelineLeadDrawer {...defaultProps} lead={mockLead as any} />
        </MemoryRouter>
      );
    });

    await waitFor(() => expect(screen.queryByText(/Initializing drawer/i)).toBeNull());

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

    await waitFor(() => expect(screen.queryByText(/Initializing drawer/i)).toBeNull());

    // Overview
    expect(screen.queryAllByText(/Next Follow-up/i).length).toBeGreaterThan(0);

    // Payments
    fireEvent.click(screen.getByRole("tab", { name: /Payments/i }));
    expect(screen.getByText(/Finance \/ EMI/i)).toBeDefined();
  });

  it("shows finance figures in header and summary", async () => {
    await act(async () => {
      render(
        <MemoryRouter>
          <PaidPipelineLeadDrawer {...defaultProps} lead={mockLead as any} />
        </MemoryRouter>
      );
    });
    
    await waitFor(() => expect(screen.queryByText(/Initializing drawer/i)).toBeNull());

    const hasFinance = (val: string) => screen.queryAllByText((content, element) => {
      const text = element?.textContent || "";
      return text.includes(val);
    }).length > 0;

    expect(hasFinance("INR_1000_MOCK")).toBe(true);
    expect(hasFinance("INR_500_MOCK")).toBe(true);
  });

  it("primary action button label changes correctly", async () => {
    const { rerender } = render(
      <MemoryRouter>
        <PaidPipelineLeadDrawer {...defaultProps} lead={{...mockLead, token_amount_collected: 0} as any} />
      </MemoryRouter>
    );
    await waitFor(() => expect(screen.queryByText(/Initializing drawer/i)).toBeNull());
    expect(screen.getAllByText("Record Token Payment").length).toBeGreaterThan(0);

    await act(async () => {
      rerender(
        <MemoryRouter>
          <PaidPipelineLeadDrawer {...defaultProps} lead={{...mockLead, token_amount_collected: 100, balance_pending: 1000} as any} />
        </MemoryRouter>
      );
    });
    
    // Check for "Add Payment" in the primary action button text nodes
    await waitFor(() => {
      const addPaymentFound = screen.queryAllByText((content, element) => {
        return element?.tagName.toLowerCase() === 'button' && content === 'Add Payment';
      });
      expect(addPaymentFound.length).toBeGreaterThan(0);
    });
  });

  it("defaults to correct tab based on blockers", async () => {
    await act(async () => {
      render(
        <MemoryRouter>
          <PaidPipelineLeadDrawer {...defaultProps} lead={{...mockLead, balance_pending: 1000} as any} />
        </MemoryRouter>
      );
    });
    await waitFor(() => expect(screen.queryByText(/Initializing drawer/i)).toBeNull());
    
    // Find the wrapper that holds the state
    const tabWrappers = screen.getAllByTestId("mock-tabs");
    expect(tabWrappers[0].getAttribute("data-value")).toBe("payments");
  });
});
