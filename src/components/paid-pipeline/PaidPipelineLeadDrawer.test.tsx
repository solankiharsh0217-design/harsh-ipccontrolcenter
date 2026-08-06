import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import PaidPipelineLeadDrawer from "./PaidPipelineLeadDrawer";
import { BrowserRouter } from "react-router-dom";
import * as AuthModule from "@/context/AuthContext";

// Mock the modules used in the component
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() => ({
            order: vi.fn(() => Promise.resolve({ data: [], error: null })),
          })),
          maybeSingle: vi.fn(() => Promise.resolve({ data: null, error: null })),
          order: vi.fn(() => Promise.resolve({ data: [], error: null })),
        })),
      })),
    })),
  },
}));

vi.mock("@/lib/paidPipeline", () => ({
  inr: (val: number) => `₹${val.toLocaleString("en-IN")}`,
  recomputePaidLead: vi.fn(),
}));

vi.mock("@/lib/auditLog", () => ({
  logActivity: vi.fn(),
  logPaidLeadDiff: vi.fn(),
}));

const mockLead = {
  id: "lead-123",
  name: "Test Lead",
  email: "test@example.com",
  phone: "9876543210",
  pipeline_stage: "New",
  balance_pending: 1000,
  total_collected: 2000,
  token_amount_collected: 3000,
  deal_value_including_gst: 5000,
  // Add other required fields for the Lead type if necessary
} as any;

const mockAuthContext = {
  user: { id: "user-123" },
  isAdmin: true,
  loading: false,
  signOut: vi.fn(),
};

describe("PaidPipelineLeadDrawer - Overview Tab", () => {
  it("renders the consolidated summary block with correct values", () => {
    // Mock useAuth return value directly instead of using a Provider
    vi.spyOn(AuthModule, "useAuth").mockReturnValue(mockAuthContext as any);

    render(
      <BrowserRouter>
        <PaidPipelineLeadDrawer
          lead={mockLead}
          onClose={vi.fn()}
          stages={[]}
          agents={[]}
          onChanged={vi.fn()}
        />
      </BrowserRouter>
    );

    // The overview tab is active by default in the component state (useState("overview"))
    
    // Check Balance Pending
    // Using getAllByText and checking that the first one is the label
    const balanceLabels = screen.getAllByText(/Balance Pending/i);
    expect(balanceLabels.length).toBeGreaterThan(0);
    expect(screen.getAllByText("₹1,000").length).toBeGreaterThan(0);

    // Check Total Collected
    expect(screen.getByText(/Total Collected/i)).toBeDefined();
    expect(screen.getAllByText("₹2,000").length).toBeGreaterThan(0);

    // Check Token Amount
    expect(screen.getByText(/Token Amount/i)).toBeDefined();
    expect(screen.getAllByText("₹3,000").length).toBeGreaterThan(0);
    
    // Verify context (e.g. Deal subtext)
    expect(screen.getByText(/Deal: ₹5,000/i)).toBeDefined();
  });
});
