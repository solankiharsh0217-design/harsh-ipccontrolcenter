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

// Mock Auth
vi.mock("@/context/AuthContext", () => ({
  useAuth: () => ({ user: { id: "user-123" }, isAdmin: true }),
}));

// Mock Operations CRM lib
vi.mock("@/lib/operationsCrm", () => ({
  getActiveHandoffRules: vi.fn().mockResolvedValue([]),
  findRuleForStage: vi.fn().mockReturnValue(null),
  isRuleAutoReady: vi.fn().mockReturnValue(false),
  applyAutoHandoff: vi.fn().mockResolvedValue({ inserted: 0, updated: 0 }),
}));

// Mock Code of Conduct lib
vi.mock("@/lib/codeOfConductRules", () => ({
  evaluateStageTrigger: vi.fn().mockResolvedValue({ action: "none" }),
}));

// Mock auditLog to prevent errors
vi.mock("@/lib/auditLog", () => ({
  logActivity: vi.fn().mockResolvedValue({}),
}));

// Mock the sub-components to bypass Radix complexity
vi.mock("@/components/crm/CrmStagePicker", () => ({
  default: ({ onChangeStage }: any) => (
    <select role="combobox" aria-label="CRM Stage Picker" onChange={(e) => onChangeStage(e.target.value)}>
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

describe("PaidPipelineLeadDrawer - changeCrmStage Logic", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(cleanup);

  it("should trigger Operations handoff and CoC evaluation when CRM stage changes", async () => {
    // 1. Setup mocks to simulate a rule match
    vi.spyOn(operationsCrm, "getActiveHandoffRules").mockResolvedValue([{ id: "rule-1", name: "Auto Rule", mode: "auto" } as any]);
    vi.spyOn(operationsCrm, "findRuleForStage").mockReturnValue({ id: "rule-1", name: "Auto Rule", mode: "auto" } as any);
    vi.spyOn(operationsCrm, "isRuleAutoReady").mockReturnValue(true);
    vi.spyOn(operationsCrm, "applyAutoHandoff").mockResolvedValue({ inserted: 1, updated: 0, skipped: 0, buyerCounts: {} } as any);
    vi.spyOn(cocRules, "evaluateStageTrigger").mockResolvedValue({ action: "auto_sent", rule: { name: "CoC Rule" } } as any);

    // 2. Mock Supabase responses for loadInner
    (supabase.from as any).mockImplementation((table: string) => {
      const q = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        or: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn(),
        update: vi.fn().mockReturnThis(),
      };
      
      if (table === "leads") {
        q.maybeSingle.mockResolvedValue({ data: { id: "crm-123", stage_id: "stage-old", pipeline_id: "pipe-1" }, error: null });
      } else if (table === "stages") {
        q.order.mockResolvedValue({ data: [{ id: "stage-new", name: "New Stage", is_active: true }], error: null });
      } else {
        q.maybeSingle.mockResolvedValue({ data: {}, error: null });
        q.limit.mockResolvedValue({ data: [], error: null });
      }
      return q;
    });

    await act(async () => {
      render(
        <MemoryRouter>
          <PaidPipelineLeadDrawer
            lead={mockLead as any}
            onClose={() => {}}
            stages={["New"]}
            agents={[]}
            onChanged={() => {}}
          />
        </MemoryRouter>
      );
    });

    // 3. Wait for initialization
    await waitFor(() => expect(screen.queryByText(/Initializing/)).toBeNull());

    // 4. Navigate to Onboarding tab
    const onboardingTab = await screen.findByRole("tab", { name: /onboarding/i });
    fireEvent.click(onboardingTab);

    // 5. Find the stage picker (CrmStagePicker) and trigger a change
    const stagePicker = await screen.findByRole("combobox", { name: /CRM Stage Picker/i });
    
    await act(async () => {
      fireEvent.change(stagePicker, { target: { value: "stage-new" } });
    });

    // 6. Assert downstream evaluations were called
    await waitFor(() => {
      expect(operationsCrm.getActiveHandoffRules).toHaveBeenCalled();
      expect(operationsCrm.applyAutoHandoff).toHaveBeenCalled();
      expect(cocRules.evaluateStageTrigger).toHaveBeenCalled();
    });
  });
});