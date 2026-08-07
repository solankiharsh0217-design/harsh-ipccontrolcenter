import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import PaidPipelineLeadDrawer from "./PaidPipelineLeadDrawer";
import { supabase } from "@/integrations/supabase/client";
import { getActiveHandoffRules, findRuleForStage, isRuleAutoReady, applyAutoHandoff } from "@/lib/operationsCrm";
import * as cocRules from "@/lib/codeOfConductRules";

// Mock Supabase
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockReturnValue({ data: {}, error: null }),
      update: vi.fn().mockReturnThis(),
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
      <PaidPipelineLeadDrawer
        lead={mockLead as any}
        onClose={() => {}}
        stages={["New"]}
        agents={[]}
        onChanged={() => {}}
      />
    );

    // 3. Navigate to Onboarding tab
    const onboardingTab = await screen.findByRole("tab", { name: /onboarding/i });
    fireEvent.click(onboardingTab);

    // 4. Find the stage picker (CrmStagePicker) and trigger a change
    await screen.findByText(/🔗 Linked Calling CRM Stage/i);
    
    // The picker renders a button with the current stage name or "—"
    const pickerTrigger = screen.getByRole("button", { name: /—|New Stage/ });
    fireEvent.click(pickerTrigger);

    // Find the new stage in the list and click it
    const newStageOption = await screen.findByText("New Stage");
    fireEvent.click(newStageOption);


    // 5. Assert downstream evaluations were called
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
