import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import PaidPipelineLeadDrawer from "./PaidPipelineLeadDrawer";
import { supabase } from "@/integrations/supabase/client";
import * as operationsCrm from "@/lib/operationsCrm";
import * as cocRules from "@/lib/codeOfConductRules";

// Mock Supabase
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: {}, error: null }),
    })),
  },
}));

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
    <button data-testid="trigger-stage-change" onClick={() => onChangeStage("stage-new")}>
      Change Stage
    </button>
  ),
}));

// Mock visibility audit to prevent N+1 issues in test
vi.mock("@/lib/paidPipelineVisibility", () => ({
  auditPaidPipelineVisibility: vi.fn().mockResolvedValue({ status: "ok", checks: [] }),
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

describe("PaidPipelineLeadDrawer - Handoff Logic Verification", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    
    // Setup standard mock returns
    (supabase.from as any).mockImplementation((table: string) => {
      if (table === "leads") {
        return {
          select: vi.fn().mockReturnThis(),
          update: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: { id: "crm-123", stage_id: "old", pipeline_id: "pipe-1" }, error: null }),
        };
      }
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue({ data: [], error: null }),
      };
    });
  });

  it("verifies that changing CRM stage invokes both Operations Handoff and Code of Conduct logic", async () => {
    // Setup specific mocks for the evaluations
    (operationsCrm.getActiveHandoffRules as any).mockResolvedValue([{ id: "rule-1", name: "Test Rule", mode: "auto" }]);
    (operationsCrm.findRuleForStage as any).mockReturnValue({ id: "rule-1", name: "Test Rule", mode: "auto" });
    (operationsCrm.isRuleAutoReady as any).mockReturnValue(true);
    (operationsCrm.applyAutoHandoff as any).mockResolvedValue({ inserted: 1, updated: 0 });
    (cocRules.evaluateStageTrigger as any).mockResolvedValue({ action: "auto_sent", rule: { name: "CoC Rule" } });

    render(
      <PaidPipelineLeadDrawer
        lead={mockLead as any}
        onClose={() => {}}
        stages={["New"]}
        agents={[]}
        onChanged={() => {}}
      />
    );

    // Click Onboarding tab - Try by text if Role is problematic
    const tab = screen.getByText(/Onboarding/i);
    fireEvent.click(tab);

    // Wait for the tab content to render and trigger stage change
    await waitFor(async () => {
      const btn = screen.getByTestId("trigger-stage-change");
      fireEvent.click(btn);
    }, { timeout: 3000 });

    // Assertions
    await waitFor(() => {
      expect(operationsCrm.getActiveHandoffRules).toHaveBeenCalled();
      console.log("LOG_SIGNAL: getActiveHandoffRules was called");
      
      expect(operationsCrm.applyAutoHandoff).toHaveBeenCalled();
      console.log("LOG_SIGNAL: applyAutoHandoff was called");

      expect(cocRules.evaluateStageTrigger).toHaveBeenCalled();
      console.log("LOG_SIGNAL: evaluateStageTrigger was called");
    });
  });
});
