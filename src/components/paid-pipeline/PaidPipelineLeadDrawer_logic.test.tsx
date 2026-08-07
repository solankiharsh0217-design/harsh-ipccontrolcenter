import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import PaidPipelineLeadDrawer from "./PaidPipelineLeadDrawer";
import { supabase } from "@/integrations/supabase/client";
import * as operationsCrm from "@/lib/operationsCrm";
import * as cocRules from "@/lib/codeOfConductRules";
import * as accessVerification from "@/lib/accessVerification";

vi.mock("@/lib/accessVerification", () => ({
  fetchVerificationForPaidLead: vi.fn().mockResolvedValue(null),
  computeOverall: vi.fn().mockReturnValue("completed"),
  WHATSAPP_LABELS: { unknown: "Unknown", joined_verified: "Joined — verified" },
  APP_LOGIN_LABELS: { unknown: "Unknown", logged_in: "Logged in" },
  CALL_LABELS: { not_called: "Not called" },
}));

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

// Mock the sub-components
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
    
    // Mock loadInner responses
    (supabase.from as any).mockImplementation((table: string) => {
      if (table === "leads") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: { id: "crm-123", stage_id: "old-stage", pipeline_id: "pipe-1" }, error: null }),
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

  it("fires handoff and CoC logic on stage change", async () => {
    (operationsCrm.getActiveHandoffRules as any).mockResolvedValue([]);
    (cocRules.evaluateStageTrigger as any).mockResolvedValue({ action: "none" });

    await act(async () => {
      render(
        <PaidPipelineLeadDrawer
          lead={mockLead as any}
          onClose={() => {}}
          stages={["New"]}
          agents={[]}
          onChanged={() => {}}
        />
      );
    });

    // Wait for the loader to clear
    await waitFor(() => {
      expect(screen.queryByText(/Initializing drawer/i)).toBeNull();
    });

    // Click the Onboarding tab trigger (the button itself)
    const onboardingTab = screen.getByRole("tab", { name: /onboarding/i });
    fireEvent.click(onboardingTab);

    // Wait for the tab content to be "active" and visible
    // Instead of findByTestId which might be hidden by Radix, we'll wait for the element to exist
    await waitFor(() => {
      const picker = screen.queryByTestId("mock-stage-picker");
      if (!picker) throw new Error("Picker not found yet");
      fireEvent.click(picker);
    }, { timeout: 3000 });

    // Verify expectations
    await waitFor(() => {
      expect(operationsCrm.getActiveHandoffRules).toHaveBeenCalled();
      expect(cocRules.evaluateStageTrigger).toHaveBeenCalled();
    });
  });
});
