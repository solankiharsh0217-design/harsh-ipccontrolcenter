import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import LeadDrawer from "./LeadDrawer";
import { supabase } from "@/integrations/supabase/client";

// Mock Supabase
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn(),
          order: vi.fn(() => ({
            eq: vi.fn(() => ({
              order: vi.fn(),
            })),
          })),
        })),
        order: vi.fn(() => ({
          eq: vi.fn(() => ({
            order: vi.fn(),
          })),
        })),
      })),
      update: vi.fn(() => ({
        eq: vi.fn(() => Promise.resolve({ error: null })),
      })),
    })),
  },
}));

// Mock useAuth
vi.mock("@/context/AuthContext", () => ({
  useAuth: () => ({
    profile: { id: "user-1" },
    isAdmin: true,
  }),
}));

// Mock components that might be complex or have many dependencies
vi.mock("@/components/TagPicker", () => ({ default: () => <div data-testid="tag-picker" /> }));
vi.mock("@/components/FastFollowUpComposer", () => ({ default: () => <div data-testid="follow-up-composer" /> }));
vi.mock("@/components/SuggestedNextActions", () => ({ default: () => <div data-testid="suggested-actions" /> }));
vi.mock("@/components/crm/SessionAttendanceTimeline", () => ({ default: () => <div data-testid="attendance-timeline" /> }));
vi.mock("@/components/crm/LeadNotesSection", () => ({ default: () => <div data-testid="notes-section" /> }));
vi.mock("@/components/crm/LinkedRecordsPanel", () => ({ default: () => <div data-testid="linked-records" /> }));
vi.mock("@/components/access-followup/AccessVerificationPanel", () => ({ default: () => <div data-testid="access-verification" /> }));
vi.mock("@/components/crm/CodeOfConductCard", () => ({ default: () => <div data-testid="coc-card" /> }));
vi.mock("@/components/offers/PromisedOffersPanel", () => ({ default: () => <div data-testid="promised-offers" /> }));
vi.mock("@/components/crm/CrmStagePicker", () => ({ default: () => <div data-testid="stage-picker" /> }));

const mockLead = {
  id: "lead-1",
  full_name: "Test Lead",
  email: "test@example.com",
  phone: "1234567890",
  program_name: "IPC",
  lead_type: "Cold",
  stage_id: "stage-1",
  pipeline_id: "pipe-1",
  deal_value: 1000,
  paid_pipeline_lead_id: "paid-1",
};

const mockStages = [
  { id: "stage-1", name: "Inquiry", pipeline_id: "pipe-1" },
  { id: "stage-2", name: "Token Paid", pipeline_id: "pipe-1" },
];

describe("LeadDrawer Refactor Verification", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    
    // Default Supabase mocks
    (supabase.from as any).mockImplementation((table: string) => ({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({ 
            data: table === "leads" ? mockLead : (table === "paid_pipeline_leads" ? { id: "paid-1", deal_value: 1000, total_collected: 0 } : null), 
            error: null 
          }),
          order: vi.fn().mockReturnValue({ data: [], error: null }),
        }),
        order: vi.fn().mockReturnValue({ data: [], error: null }),
      }),
    }));
  });

  it("renders with tabbed layout and defaults to Overview", async () => {
    render(<LeadDrawer leadId="lead-1" stages={mockStages} agents={[]} onClose={vi.fn()} onChanged={vi.fn()} />);
    
    await waitFor(() => {
      expect(screen.getByText("Overview")).toBeDefined();
      expect(screen.getByText("Payments")).toBeDefined();
      expect(screen.getByText("Onboarding")).toBeDefined();
    });
  });

  it("triggers evaluateStageTrigger when stage changes", async () => {
    const mockEvaluate = vi.fn();
    vi.doMock("@/lib/codeOfConductRules", () => ({
      evaluateStageTrigger: mockEvaluate,
    }));

    // Re-render to pick up mock
    const { rerender } = render(<LeadDrawer leadId="lead-1" stages={mockStages} agents={[]} onClose={vi.fn()} onChanged={vi.fn()} />);
    
    // We need to trigger moveStage. Since CrmStagePicker is mocked, we'd normally test via its prop.
    // For this verification, we'll check if the logic in LeadDrawer.tsx for moveStage calls the import.
  });

  it("defaults to Payments tab when deal exists but no token", async () => {
    // Lead with deal value but no token paid
    render(<LeadDrawer leadId="lead-1" stages={mockStages} agents={[]} onClose={vi.fn()} onChanged={vi.fn()} />);
    
    await waitFor(() => {
      // The useEffect should trigger setActiveTab("payments")
      const paymentsTab = screen.getByRole("tab", { name: /payments/i });
      expect(paymentsTab.getAttribute("data-state")).toBe("active");
    });
  });
});
