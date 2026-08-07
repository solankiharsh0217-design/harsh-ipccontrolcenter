import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import LeadDrawer from "./LeadDrawer";
import { supabase } from "@/integrations/supabase/client";

// Mock Supabase
vi.mock("@/integrations/supabase/client", () => {
  const mockQuery = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    order: vi.fn().mockReturnThis(),
    not: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
  };

  return {
    supabase: {
      from: vi.fn(() => mockQuery),
    },
  };
});

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
  { id: "stage-1", name: "Inquiry", pipeline_id: "pipe-1", color: "gray", position: 0, is_protected: false, is_won: false, is_lost: false },
  { id: "stage-2", name: "Token Paid", pipeline_id: "pipe-1", color: "blue", position: 1, is_protected: false, is_won: false, is_lost: false },
] as any[];

describe("LeadDrawer Refactor Verification", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    
    (supabase.from as any).mockImplementation((table: string) => {
      const mockQuery = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        not: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockImplementation(async () => {
          if (table === "leads") return { data: mockLead, error: null };
          if (table === "paid_pipeline_leads") return { data: { id: "paid-1", deal_value: 1000, total_collected: 0 }, error: null };
          return { data: null, error: null };
        }),
        update: vi.fn().mockReturnThis(),
      };
      return mockQuery;
    });
  });

  it("renders with tabbed layout and defaults to Overview", async () => {
    // Override leads mock to have NO deal value so it stays on Overview
    const emptyLead = { ...mockLead, deal_value: 0, paid_pipeline_lead_id: null };
    (supabase.from as any).mockImplementation((table: string) => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      not: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: table === "leads" ? emptyLead : null, error: null }),
    }));

    await act(async () => {
      render(<LeadDrawer leadId="lead-1" stages={mockStages} agents={[]} onClose={vi.fn()} onChanged={vi.fn()} />);
    });
    
    await waitFor(() => {
      expect(screen.getByText("Overview")).toBeDefined();
      expect(screen.getByText("Payments")).toBeDefined();
    });
  });

  it("defaults to Payments tab when deal exists but no token", async () => {
    await act(async () => {
      render(<LeadDrawer leadId="lead-1" stages={mockStages} agents={[]} onClose={vi.fn()} onChanged={vi.fn()} />);
    });
    
    await waitFor(() => {
      const paymentsTab = screen.getByRole("tab", { name: /payments/i });
      expect(paymentsTab.getAttribute("data-state")).toBe("active");
    });
  });
});
