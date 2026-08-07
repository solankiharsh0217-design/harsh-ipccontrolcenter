import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup, act } from "@testing-library/react";
import PaidPipelineLeadDrawer from "./PaidPipelineLeadDrawer";
import { supabase } from "@/integrations/supabase/client";
import * as operationsCrm from "@/lib/operationsCrm";
import * as cocRules from "@/lib/codeOfConductRules";
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

vi.mock("@/lib/operationsCrm", () => ({
  getActiveHandoffRules: vi.fn().mockResolvedValue([]),
  findRuleForStage: vi.fn().mockReturnValue(null),
  isRuleAutoReady: vi.fn().mockReturnValue(false),
  applyAutoHandoff: vi.fn().mockResolvedValue({ inserted: 0, updated: 0, skipped: 0, buyerCounts: {} }),
}));

vi.mock("@/lib/codeOfConductRules", () => ({
  evaluateStageTrigger: vi.fn().mockResolvedValue({ action: "none" }),
}));

vi.mock("@/lib/auditLog", () => ({
  logActivity: vi.fn().mockResolvedValue({}),
}));

vi.mock("@/components/crm/CrmStagePicker", () => ({
  default: ({ onChangeStage }: any) => (
    <select aria-label="CRM Stage Picker" onChange={(e) => onChangeStage(e.target.value)}>
      <option value="">—</option>
      <option value="stage-new">New Stage</option>
    </select>
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
};

describe("PaidPipelineLeadDrawer Handoff Verification", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(cleanup);

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
});