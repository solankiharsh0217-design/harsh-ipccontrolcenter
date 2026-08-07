import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, act } from "@testing-library/react";
import OperationsLeadDrawer from "./OperationsLeadDrawer";
import { MemoryRouter } from "react-router-dom";
import React from 'react';
import * as opsReadiness from "@/lib/operationsReadiness";

// Standardized Supabase Mock
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
  useAuth: () => ({ profile: { id: "user-123" }, isAdmin: true }),
}));

vi.mock("@/lib/auditLog", () => ({
  logActivity: vi.fn().mockResolvedValue({}),
}));

vi.mock("@/lib/notifications", () => ({
  createNotification: vi.fn().mockResolvedValue({}),
}));

// Mock the imported functions from operationsReadiness
vi.mock("@/lib/operationsReadiness", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual as any,
    resolveReadinessTargetStage: vi.fn().mockReturnValue(null),
    isAtOrAfterTarget: vi.fn().mockReturnValue(false),
    computeServiceCalc: vi.fn().mockReturnValue({}),
    computeStageAging: vi.fn().mockReturnValue({ days: 0, status: 'good', lastMovedAt: new Date().toISOString(), source: 'none' }),
  };
});

// Mock UI Components
vi.mock("@/components/ui/tabs", () => ({
  Tabs: ({ children, value }: any) => React.createElement('div', { 'data-testid': 'mock-tabs', 'data-value': value }, children),
  TabsList: ({ children }: any) => React.createElement('div', { role: 'tablist' }, children),
  TabsTrigger: ({ children, value }: any) => React.createElement('button', { role: 'tab', 'data-value': value }, children),
  TabsContent: ({ children, value }: any) => React.createElement('div', { role: 'tabpanel', 'data-value': value }, children),
}));

// Proxy to swallow missing icons
vi.mock("lucide-react", () => {
  return new Proxy({}, {
    get: () => () => null
  });
});

// Mock child components
vi.mock("@/components/offers/PromisedOffersPanel", () => ({ default: () => null }));
vi.mock("@/components/operations/DeliveryTrackingSection", () => ({ default: () => null }));
vi.mock("@/components/operations/ConversionsSection", () => ({ default: () => null }));
vi.mock("@/components/operations/TeamResultSubmissionPanel", () => ({ default: () => null }));
vi.mock("@/components/operations/CustomFieldsPanel", () => ({ default: () => null }));
vi.mock("@/components/operations/CommTemplatePickerModal", () => ({ default: () => null }));
vi.mock("@/components/operations/OperationsActivityTimeline", () => ({ default: () => null }));
vi.mock("@/components/operations/OperationsLinkedRecordsCard", () => ({ default: () => null }));
vi.mock("@/components/operations/StartProcessModal", () => ({ default: () => null }));

// Special mock for ReadinessChecklist to trigger onChange
vi.mock("@/components/operations/ReadinessChecklist", () => ({
  default: ({ onChange }: any) => {
    React.useEffect(() => {
      // If the test case wants to be 'ready', we need a way to tell this mock.
      // We can use a global or check a specific lead ID.
    }, [onChange]);
    return null;
  }
}));

const mockLead = {
  id: "ops-lead-123",
  name: "Test Client",
  email: "test@example.com",
  phone: "123456789",
  product_name: "Test Product",
  service_status: "active",
  intake_status: "active",
  total_active_days: 0,
  total_paused_days: 0,
  assigned_media_buyer_id: "user-123",
  process_template_id: "template-123",
  stage_id: "stage-current",
  pipeline_id: "pipe-123",
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

describe("OperationsLeadDrawer Primary Action Priority", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (opsReadiness.resolveReadinessTargetStage as any).mockReturnValue(null);
  });

  afterEach(cleanup);

  it("1. Start Operations Process: Highest priority when intake is NOT active", async () => {
    await act(async () => {
      render(
        <MemoryRouter>
          <OperationsLeadDrawer
            lead={{ ...mockLead, intake_status: "pending", service_status: "not_started" } as any}
            onClose={() => {}}
            onSaved={() => {}}
          />
        </MemoryRouter>
      );
    });
    expect(screen.getByRole("button", { name: /Start Operations Process/i })).toBeTruthy();
  });

  it("2. Move to [Target Stage]: Priority when ready and not at target", async () => {
    // We override the ReadinessChecklist mock for this test to trigger readiness
    vi.mock("@/components/operations/ReadinessChecklist", () => ({
      default: ({ onChange }: any) => {
        React.useEffect(() => { onChange(100, false); }, []);
        return null;
      }
    }));
    
    (opsReadiness.resolveReadinessTargetStage as any).mockReturnValue({ id: "stage-target", name: "Target Stage" });
    (opsReadiness.isAtOrAfterTarget as any).mockReturnValue(false);

    await act(async () => {
      render(
        <MemoryRouter>
          <OperationsLeadDrawer
            lead={{ 
              ...mockLead, 
              intake_status: "active", 
              service_status: "not_started",
              process_template_id: "template-123"
            } as any}
            onClose={() => {}}
            onSaved={() => {}}
          />
        </MemoryRouter>
      );
    });

    // Priority 2 should be active: Move to Target Stage
    expect(screen.getByRole("button", { name: /Move to Target Stage/i })).toBeTruthy();
  });

  it("3. Mark Ads Started: Priority when intake active and service not started (and not ready/no target)", async () => {
    await act(async () => {
      render(
        <MemoryRouter>
          <OperationsLeadDrawer
            lead={{ ...mockLead, intake_status: "active", service_status: "not_started" } as any}
            onClose={() => {}}
            onSaved={() => {}}
          />
        </MemoryRouter>
      );
    });
    expect(screen.getByRole("button", { name: /Mark Ads Started/i })).toBeTruthy();
  });

  it("4. Resume Service: Priority when service is paused", async () => {
    await act(async () => {
      render(
        <MemoryRouter>
          <OperationsLeadDrawer
            lead={{ ...mockLead, intake_status: "active", service_status: "paused" } as any}
            onClose={() => {}}
            onSaved={() => {}}
          />
        </MemoryRouter>
      );
    });
    expect(screen.getByRole("button", { name: /Resume Service/i })).toBeTruthy();
  });

  it("5. Log Communication: Fallback when active", async () => {
    await act(async () => {
      render(
        <MemoryRouter>
          <OperationsLeadDrawer
            lead={{ ...mockLead, intake_status: "active", service_status: "active" } as any}
            onClose={() => {}}
            onSaved={() => {}}
          />
        </MemoryRouter>
      );
    });
    expect(screen.getByRole("button", { name: /Log Communication/i })).toBeTruthy();
  });
});

describe("OperationsLeadDrawer Tab Defaulting", () => {
  afterEach(cleanup);

  it("defaults to Process (onboarding) tab for new leads", async () => {
    await act(async () => {
      render(
        <MemoryRouter>
          <OperationsLeadDrawer
            lead={{ ...mockLead, service_status: "not_started", process_template_id: null } as any}
            onClose={() => {}}
            onSaved={() => {}}
          />
        </MemoryRouter>
      );
    });
    const tabs = screen.getAllByTestId("mock-tabs");
    expect(tabs[0].getAttribute("data-value")).toBe("onboarding");
  });

  it("defaults to Overview for active leads with template", async () => {
    await act(async () => {
      render(
        <MemoryRouter>
          <OperationsLeadDrawer
            lead={{ ...mockLead, service_status: "active", process_template_id: "some-id" } as any}
            onClose={() => {}}
            onSaved={() => {}}
          />
        </MemoryRouter>
      );
    });
    const tabs = screen.getAllByTestId("mock-tabs");
    expect(tabs[0].getAttribute("data-value")).toBe("overview");
  });
});
