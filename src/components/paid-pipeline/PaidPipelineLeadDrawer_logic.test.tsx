import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import PaidPipelineLeadDrawer from "./PaidPipelineLeadDrawer";
import { supabase } from "@/integrations/supabase/client";
import * as operationsCrm from "@/lib/operationsCrm";
import * as cocRules from "@/lib/codeOfConductRules";

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

vi.mock("@/context/AuthContext", () => ({
  useAuth: () => ({ user: { id: "user-123" }, isAdmin: true }),
}));

vi.mock("@/lib/operationsCrm", () => ({
  getActiveHandoffRules: vi.fn(),
  findRuleForStage: vi.fn(),
  isRuleAutoReady: vi.fn(),
  applyAutoHandoff: vi.fn(),
}));

vi.mock("@/lib/codeOfConductRules", () => ({
  evaluateStageTrigger: vi.fn(),
}));

// Mock the sub-components to make them easier to find
vi.mock("@/components/crm/CrmStagePicker", () => ({
  default: ({ onChangeStage }: any) => (
    <button data-testid="mock-stage-picker" onClick={() => onChangeStage("stage-new")}>
      Mock Picker
    </button>
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

describe("PaidPipelineLeadDrawer Logic", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fires handoff and CoC logic on stage change", async () => {
    (operationsCrm.getActiveHandoffRules as any).mockResolvedValue([]);
    (cocRules.evaluateStageTrigger as any).mockResolvedValue({ action: "none" });

    render(
      <PaidPipelineLeadDrawer
        lead={mockLead as any}
        onClose={() => {}}
        stages={["New"]}
        agents={[]}
        onChanged={() => {}}
      />
    );

    // Switch to Onboarding tab
    fireEvent.click(screen.getByRole("tab", { name: /onboarding/i }));

    // Trigger the stage change via our mock picker
    const picker = await screen.findByTestId("mock-stage-picker");
    fireEvent.click(picker);

    // Verify expectations
    await waitFor(() => {
      expect(operationsCrm.getActiveHandoffRules).toHaveBeenCalled();
      expect(cocRules.evaluateStageTrigger).toHaveBeenCalled();
    });
  });
});
