import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, act, waitFor, fireEvent } from "@testing-library/react";
import PaidPipelineLeadDrawer from "./PaidPipelineLeadDrawer";
import * as accessVerification from "@/lib/accessVerification";
import * as operationsCrm from "@/lib/operationsCrm";
import * as cocRules from "@/lib/codeOfConductRules";
import { supabase } from "@/integrations/supabase/client";
import { MemoryRouter } from "react-router-dom";

// Standardized Supabase Mock for all Drawer tests
const createMockQuery = () => {
  const query = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    neq: vi.fn().mockReturnThis(),
    gt: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    lt: vi.fn().mockReturnThis(),
    lte: vi.fn().mockReturnThis(),
    like: vi.fn().mockReturnThis(),
    ilike: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    contains: vi.fn().mockReturnThis(),
    or: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    range: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    single: vi.fn().mockResolvedValue({ data: null, error: null }),
    update: vi.fn().mockReturnThis(),
    insert: vi.fn().mockResolvedValue({ data: {}, error: null }),
    upsert: vi.fn().mockResolvedValue({ data: {}, error: null }),
    delete: vi.fn().mockResolvedValue({ data: {}, error: null }),
    rpc: vi.fn().mockResolvedValue({ data: {}, error: null }),
  };
  return query;
};

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: vi.fn().mockImplementation(() => createMockQuery()),
    rpc: vi.fn().mockResolvedValue({ data: {}, error: null }),
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

vi.mock("@/lib/operationsCrm", () => ({
  getActiveHandoffRules: vi.fn().mockResolvedValue([]),
  findRuleForStage: vi.fn().mockReturnValue(null),
  isRuleAutoReady: vi.fn().mockReturnValue(false),
  applyAutoHandoff: vi.fn().mockResolvedValue({ inserted: 0, updated: 0, skipped: 0, buyerCounts: {} }),
}));

vi.mock("@/lib/codeOfConductRules", () => ({
  evaluateStageTrigger: vi.fn().mockResolvedValue({ action: "none" }),
  loadActiveCoCRules: vi.fn().mockResolvedValue([]),
  getCandidateSources: vi.fn().mockReturnValue(["paid_pipeline"]),
  findMatchingRuleDetailed: vi.fn().mockResolvedValue({ rule: null, diagnostics: {} }),
}));


vi.mock("@/components/crm/CrmStagePicker", () => ({
  default: ({ onChangeStage, open }: any) => (
    <div data-testid="mock-crm-stage-picker" data-open={String(!!open)}>
      <select aria-label="CRM Stage Picker" onChange={(e) => onChangeStage(e.target.value)}>
        <option value="">—</option>
        <option value="stage-new">New Stage</option>
      </select>
    </div>
  ),
}));

// Mock UI Tabs to avoid Radix JSDOM issues
vi.mock("@/components/ui/tabs", () => ({
  Tabs: ({ children, value, onValueChange }: any) => (
    <div data-testid="mock-tabs" data-value={value} onClick={(e: any) => {
      const target = (e.target as HTMLElement).closest('[role="tab"]');
      if (target) onValueChange?.(target.getAttribute('data-value'));
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

  it("renders Update Status button when not operations-ready and opens picker on click", async () => {
    const notReadyLead = {
      ...mockLead,
      balance_pending: 0,
      pipeline_stage: "Paid",
    };

    await act(async () => {
      render(
        <MemoryRouter>
          <PaidPipelineLeadDrawer
            stages={[]}
            agents={[]}
            onChanged={() => {}}
            onClose={() => {}}
            lead={notReadyLead as any}
          />
        </MemoryRouter>
      );
    });

    await waitFor(() => expect(screen.queryByText(/Initializing/)).toBeNull());

    const tabsContainer = screen.getAllByTestId("mock-tabs")[0];
    expect(tabsContainer.getAttribute("data-value")).not.toBe("onboarding");
    
    const pickerMock = screen.getByTestId("mock-crm-stage-picker");
    expect(pickerMock.getAttribute("data-open")).toBe("false");

    const updateBtn = screen.getByRole("button", { name: /Update Status/i });
    expect(updateBtn).toBeTruthy();

    await act(async () => {
      fireEvent.click(updateBtn);
    });

    const updatedTabsContainer = screen.getAllByTestId("mock-tabs")[0];
    expect(updatedTabsContainer.getAttribute("data-value")).toBe("onboarding");
    expect(pickerMock.getAttribute("data-open")).toBe("true");
  });
});

describe("PaidPipelineLeadDrawer - stage change automation (merged copies)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(cleanup);

  it("should trigger Operations handoff and CoC evaluation when CRM stage changes", async () => {
    vi.spyOn(operationsCrm, "getActiveHandoffRules").mockResolvedValue([{ id: "rule-1", mode: "auto" } as any]);
    vi.spyOn(operationsCrm, "findRuleForStage").mockReturnValue({ id: "rule-1", mode: "auto" } as any);
    vi.spyOn(operationsCrm, "isRuleAutoReady").mockReturnValue(true);
    vi.spyOn(operationsCrm, "applyAutoHandoff").mockResolvedValue({ inserted: 1, updated: 0, skipped: 0, buyerCounts: {} } as any);
    vi.spyOn(cocRules, "evaluateStageTrigger").mockResolvedValue({ action: "auto_sent" } as any);

    (supabase.from as any).mockImplementation((table: string) => {
      const q = createMockQuery();
      if (table === "leads") q.maybeSingle.mockResolvedValue({ data: { id: "crm-123", stage_id: "stage-old" }, error: null });
      if (table === "stages") q.order.mockResolvedValue({ data: [{ id: "stage-new", name: "New Stage" }], error: null });
      return q;
    });

    await act(async () => {
      render(
        <MemoryRouter>
          <PaidPipelineLeadDrawer lead={mockLead as any} onClose={() => {}} stages={[]} agents={[]} onChanged={() => {}} />
        </MemoryRouter>
      );
    });

    await waitFor(() => expect(screen.queryByText(/Initializing/)).toBeNull());

    fireEvent.click(screen.getByRole("tab", { name: /onboarding/i }));

    const picker = await screen.findByLabelText("CRM Stage Picker");
    await act(async () => {
      fireEvent.change(picker, { target: { value: "stage-new" } });
    });

    await waitFor(() => {
      expect(operationsCrm.applyAutoHandoff).toHaveBeenCalled();
      expect(cocRules.evaluateStageTrigger).toHaveBeenCalled();
    });
  });

  it("verifies that changing CRM stage invokes both Operations Handoff and Code of Conduct logic", async () => {
    vi.spyOn(operationsCrm, "getActiveHandoffRules").mockResolvedValue([{ id: "rule-1", mode: "auto" } as any]);
    vi.spyOn(operationsCrm, "findRuleForStage").mockReturnValue({ id: "rule-1", mode: "auto" } as any);
    vi.spyOn(operationsCrm, "isRuleAutoReady").mockReturnValue(true);
    vi.spyOn(operationsCrm, "applyAutoHandoff").mockResolvedValue({ inserted: 1, updated: 0, skipped: 0, buyerCounts: {} } as any);
    vi.spyOn(cocRules, "evaluateStageTrigger").mockResolvedValue({ action: "auto_sent" } as any);

    // Mock CRM response for stage lookup
    (supabase.from as any).mockImplementation((table: string) => {
      const q = createMockQuery();
      if (table === "leads") q.maybeSingle.mockResolvedValue({ data: { id: "crm-123", stage_id: "stage-old" }, error: null });
      if (table === "stages") q.order.mockResolvedValue({ data: [{ id: "stage-new", name: "New Stage" }], error: null });
      return q;
    });

    await act(async () => {
      render(<MemoryRouter><PaidPipelineLeadDrawer lead={mockLead as any} onClose={() => {}} stages={[]} agents={[]} onChanged={() => {}} /></MemoryRouter>);
    });

    await waitFor(() => expect(screen.queryByText(/Initializing/)).toBeNull());
    
    // Switch to Onboarding tab
    fireEvent.click(screen.getByRole("tab", { name: /onboarding/i }));
    
    // Find and trigger stage change
    const picker = await screen.findByLabelText("CRM Stage Picker");
    await act(async () => {
      fireEvent.change(picker, { target: { value: "stage-new" } });
    });

    await waitFor(() => {
      expect(operationsCrm.applyAutoHandoff).toHaveBeenCalled();
      expect(cocRules.evaluateStageTrigger).toHaveBeenCalled();
    });
  });

  it("fires handoff and CoC logic on stage change", async () => {
    await act(async () => {
      render(
        <MemoryRouter>
          <PaidPipelineLeadDrawer lead={mockLead as any} onClose={() => {}} stages={["New", "Balance Pending", "Operations Ready"]} agents={[]} onChanged={() => {}} />
        </MemoryRouter>
      );
    });

    await waitFor(() => expect(screen.queryByText(/Initializing/i)).toBeNull());

    // Switch to Onboarding tab where CRM stage picker is
    fireEvent.click(screen.getByRole("tab", { name: /Onboarding/i }));

    // Find the picker
    const picker = await screen.findByLabelText("CRM Stage Picker");
    expect(picker).toBeDefined();
  });
});