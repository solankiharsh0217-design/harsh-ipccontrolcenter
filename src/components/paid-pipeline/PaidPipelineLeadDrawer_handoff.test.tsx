import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import PaidPipelineLeadDrawer from "./PaidPipelineLeadDrawer";
import { supabase } from "@/integrations/supabase/client";
import { getActiveHandoffRules, findRuleForStage, isRuleAutoReady, applyAutoHandoff } from "@/lib/operationsCrm";
import * as cocRules from "@/lib/codeOfConductRules";
import { MemoryRouter } from "react-router-dom";

// Mock Supabase
vi.mock("@/integrations/supabase/client", () => {
  const mockQuery = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: {}, error: null }),
    update: vi.fn().mockReturnThis(),
  };
  return {
    supabase: {
      from: vi.fn().mockReturnValue(mockQuery),
    },
  };
});

// Mock Auth
vi.mock("@/context/AuthContext", () => ({
  useAuth: () => ({ user: { id: "user-123" }, isAdmin: true }),
}));

// Mock Operations CRM lib
vi.mock("@/lib/operationsCrm", () => ({
  getActiveHandoffRules: vi.fn(),
  findRuleForStage: vi.fn(),
  isRuleAutoReady: vi.fn(),
  applyAutoHandoff: vi.fn(),
}));

// Mock Code of Conduct lib
vi.mock("@/lib/codeOfConductRules", () => ({
  evaluateStageTrigger: vi.fn(),
}));

// Mock the sub-components to bypass Radix complexity
vi.mock("@/components/crm/CrmStagePicker", () => ({
  default: ({ onChangeStage }: any) => (
    <select role="combobox" onChange={(e) => onChangeStage(e.target.value)}>
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
    (getActiveHandoffRules as any).mockResolvedValue([{ id: "rule-1", name: "Auto Rule", mode: "auto" }]);
    (findRuleForStage as any).mockReturnValue({ id: "rule-1", name: "Auto Rule", mode: "auto" });
    (isRuleAutoReady as any).mockReturnValue(true);
    (applyAutoHandoff as any).mockResolvedValue({ inserted: 1, updated: 0 });
    (cocRules.evaluateStageTrigger as any).mockResolvedValue({ action: "auto_sent", rule: { name: "CoC Rule" } });

    // 2. Mock Supabase responses for loadInner
    (supabase.from as any).mockImplementation((table: string) => {
      if (table === "leads") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockReturnValue({ data: { id: "crm-123", stage_id: "stage-old", pipeline_id: "pipe-1" }, error: null }),
        };
      }
      if (table === "stages") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnValue({ data: [{ id: "stage-new", name: "New Stage", is_active: true }], error: null }),
        };
      }
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnValue({ data: [], error: null }),
      };
    });

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

    // 3. Wait for initialization
    await waitFor(() => expect(screen.queryByText(/Initializing/)).toBeNull());

    // 4. Navigate to Onboarding tab
    const onboardingTab = await screen.findByRole("tab", { name: /onboarding/i });
    fireEvent.click(onboardingTab);

    // 5. Find the stage picker (CrmStagePicker) and trigger a change
    // Using getAllByRole because there's also a temperature selector on the page
    const pickers = await screen.findAllByRole("combobox");
    const stagePicker = pickers.find(p => p.innerHTML.includes("New Stage")) || pickers[1];
    fireEvent.change(stagePicker, { target: { value: "stage-new" } });

    // 6. Assert downstream evaluations were called
    await waitFor(() => {
      // Check Operations Handoff
      expect(getActiveHandoffRules).toHaveBeenCalled();
      expect(findRuleForStage).toHaveBeenCalled();
      expect(applyAutoHandoff).toHaveBeenCalled();

      // Check Code of Conduct
      expect(cocRules.evaluateStageTrigger).toHaveBeenCalledWith(expect.objectContaining({
        source: "paid_pipeline",
        crmLeadId: "crm-123",
        paidPipelineLeadId: "lead-123"
      }));
    });
  });
});