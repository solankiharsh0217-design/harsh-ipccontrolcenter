import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, act, waitFor } from "@testing-library/react";
import PaidPipelineLeadDrawer from "./PaidPipelineLeadDrawer";
import * as accessVerification from "@/lib/accessVerification";
import { MemoryRouter } from "react-router-dom";

// Mock Supabase with full query chain support
const createMockQuery = () => {
  const query = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    or: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    single: vi.fn().mockResolvedValue({ data: null, error: null }),
    update: vi.fn().mockReturnThis(),
    insert: vi.fn().mockResolvedValue({ data: {}, error: null }),
  };
  return query;
};

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: vi.fn().mockImplementation(() => createMockQuery()),
  },
}));

vi.mock("@/context/AuthContext", () => ({
  useAuth: () => ({ user: { id: "user-123" }, isAdmin: true }),
}));

vi.mock("@/lib/accessVerification", () => ({
  fetchVerificationForPaidLead: vi.fn().mockResolvedValue(null),
  computeOverall: vi.fn().mockReturnValue("completed"),
  WHATSAPP_LABELS: { unknown: "Unknown", invite_sent: "Invite sent", not_joined: "Not joined", joined_verified: "Joined — verified", link_issue: "Link issue" },
  APP_LOGIN_LABELS: { unknown: "Unknown", never_logged_in: "Never logged in", logged_in: "Logged in", access_issue: "Access issue" },
  CALL_LABELS: { not_called: "Not called", no_answer: "No answer", connected: "Connected", follow_up_needed: "Follow-up needed", resolved: "Resolved" },
}));

vi.mock("@/lib/format", () => ({
  inr: (v: number) => `INR_${v}_MOCK`,
}));

vi.mock("@/lib/auditLog", () => ({
  logActivity: vi.fn().mockResolvedValue({}),
}));

// Mock UI Tabs to avoid Radix JSDOM issues
vi.mock("@/components/ui/tabs", () => ({
  Tabs: ({ children, value, onValueChange }: any) => (
    <div data-testid="mock-tabs" data-value={value}>{children}</div>
  ),
  TabsList: ({ children }: any) => <div role="tablist">{children}</div>,
  TabsTrigger: ({ children, value }: any) => (
    <button role="tab" data-value={value}>{children}</button>
  ),
  TabsContent: ({ children, value }: any) => (
    <div role="tabpanel" data-value={value} style={{ display: 'block' }}>{children}</div>
  ),
}));

const mockLead = {
  id: "lead-123",
  name: "Test Lead",
  pipeline_stage: "New",
  crm_lead_id: "crm-123",
  email: "test@example.com",
  phone: "1234567890",
  balance_pending: 1000,
  total_collected: 500,
  token_amount_collected: 100,
  code_of_conduct_status: "Pending",
};

describe("PaidPipelineLeadDrawer Visuals & Logic", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(cleanup);

  it("renders all tabs and defaults based on stage", async () => {
    await act(async () => {
      render(
        <MemoryRouter>
          <PaidPipelineLeadDrawer
            lead={mockLead as any}
            onClose={() => {}}
            stages={["New", "Paid"]}
            agents={[]}
            onChanged={() => {}}
          />
        </MemoryRouter>
      );
    });

    await waitFor(() => expect(screen.queryByText(/Initializing/)).toBeNull());

    expect(screen.getByRole("tab", { name: /Overview/i })).toBeTruthy();
    expect(screen.getByRole("tab", { name: /Payments/i })).toBeTruthy();
    expect(screen.getByRole("tab", { name: /Onboarding/i })).toBeTruthy();
    expect(screen.getByRole("tab", { name: /Documents/i })).toBeTruthy();
    expect(screen.getByRole("tab", { name: /Offers & Delivery/i })).toBeTruthy();
    expect(screen.getByRole("tab", { name: /Activity/i })).toBeTruthy();
  });

  it("updates primary action button correctly across all stages", async () => {
    // 1. New lead (No token)
    const { rerender } = render(
      <MemoryRouter>
        <PaidPipelineLeadDrawer
          stages={[]}
          agents={[]}
          onChanged={() => {}}
          onClose={() => {}}
          lead={{ ...mockLead, token_amount_collected: 0 } as any}
        />
      </MemoryRouter>
    );
    await waitFor(() => expect(screen.queryByText(/Initializing/)).toBeNull());
    expect(screen.getByRole("button", { name: /Record Token Payment/i })).toBeTruthy();

    // 2. Token paid, balance pending
    await act(async () => {
      rerender(
        <MemoryRouter>
          <PaidPipelineLeadDrawer
            stages={[]}
            agents={[]}
            onChanged={() => {}}
            onClose={() => {}}
            lead={{ ...mockLead, token_amount_collected: 100, balance_pending: 1000 } as any}
          />
        </MemoryRouter>
      );
    });
    // The primary action button has specific classes we can use to distinguish it
    const addPaymentBtn = screen.getByRole("button", {
      name: (content, element) =>
        content.includes("Add Payment") && element?.className.includes("bg-blue-600"),
    } as any);
    expect(addPaymentBtn).toBeTruthy();

    // 3. Fully paid, not yet Operations Ready
    await act(async () => {
      rerender(
        <MemoryRouter>
          <PaidPipelineLeadDrawer
            stages={[]}
            agents={[]}
            onChanged={() => {}}
            onClose={() => {}}
            lead={{ ...mockLead, balance_pending: 0, pipeline_stage: "Paid" } as any}
          />
        </MemoryRouter>
      );
    });
    expect(screen.getByRole("button", { name: /Update Status/i })).toBeTruthy();

    // 4. Operations Ready
    await act(async () => {
      rerender(
        <MemoryRouter>
          <PaidPipelineLeadDrawer
            stages={[]}
            agents={[]}
            onChanged={() => {}}
            onClose={() => {}}
            lead={{ ...mockLead, balance_pending: 0, pipeline_stage: "Operations Ready" } as any}
          />
        </MemoryRouter>
      );
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
      code_of_conduct_status: "Completed",
    };

    await act(async () => {
      render(
        <MemoryRouter>
          <PaidPipelineLeadDrawer
            stages={[]}
            agents={[]}
            onChanged={() => {}}
            onClose={() => {}}
            lead={readyForVerificationLead as any}
          />
        </MemoryRouter>
      );
    });
    await waitFor(() => expect(screen.queryByText(/Initializing/)).toBeNull());

    const tabs = screen.getAllByTestId("mock-tabs");
    const activeTab = tabs[0].getAttribute("data-value");
    expect(activeTab).toBe("onboarding");
  });
});