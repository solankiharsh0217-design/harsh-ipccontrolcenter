import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, act } from "@testing-library/react";
import OperationsLeadDrawer from "./OperationsLeadDrawer";
import { MemoryRouter } from "react-router-dom";
import React from 'react';

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

// Proxy to swallow missing icons
vi.mock("lucide-react", () => {
  return new Proxy({}, {
    get: () => () => null
  });
});

// Mock UI Components
vi.mock("@/components/ui/tabs", () => ({
  Tabs: ({ children, value }: any) => React.createElement('div', { 'data-testid': 'mock-tabs', 'data-value': value }, children),
  TabsList: ({ children }: any) => React.createElement('div', { role: 'tablist' }, children),
  TabsTrigger: ({ children, value }: any) => React.createElement('button', { role: 'tab', 'data-value': value }, children),
  TabsContent: ({ children, value }: any) => React.createElement('div', { role: 'tabpanel', 'data-value': value }, children),
}));

// Mock child components to prevent deep rendering
vi.mock("@/components/offers/PromisedOffersPanel", () => ({ default: () => null }));
vi.mock("@/components/operations/DeliveryTrackingSection", () => ({ default: () => null }));
vi.mock("@/components/operations/ConversionsSection", () => ({ default: () => null }));
vi.mock("@/components/operations/ReadinessChecklist", () => ({ default: () => null }));
vi.mock("@/components/operations/TeamResultSubmissionPanel", () => ({ default: () => null }));
vi.mock("@/components/operations/CustomFieldsPanel", () => ({ default: () => null }));
vi.mock("@/components/operations/CommTemplatePickerModal", () => ({ default: () => null }));
vi.mock("@/components/operations/OperationsActivityTimeline", () => ({ default: () => null }));
vi.mock("@/components/operations/OperationsLinkedRecordsCard", () => ({ default: () => null }));
vi.mock("@/components/operations/StartProcessModal", () => ({ default: () => null }));

// Mock lib functions
vi.mock("@/lib/operationsReadiness", () => ({
  resolveReadinessTargetStage: vi.fn(),
  isAtOrAfterTarget: vi.fn(),
  computeServiceCalc: vi.fn().mockReturnValue({}),
  computeStageAging: vi.fn().mockReturnValue({ days: 0, status: 'good', lastMovedAt: new Date().toISOString(), source: 'none' }),
  moveOperationsLeadStage: vi.fn(),
  fetchStageChangeMap: vi.fn().mockResolvedValue(new Map()),
  listProcessTemplates: vi.fn().mockResolvedValue([]),
  getReadinessSettings: vi.fn().mockResolvedValue({}),
  getOperationsSlaSettings: vi.fn().mockResolvedValue({}),
  DEFAULT_SLA: { watch_days: 7, overdue_days: 14 },
  COMMUNICATION_EVENT_TYPES: new Set(),
}));

// Import the mocked module to control its behavior
import * as opsReadiness from "@/lib/operationsReadiness";

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

describe("OperationsLeadDrawer Action Logic", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (opsReadiness.resolveReadinessTargetStage as any).mockReturnValue(null);
  });

  afterEach(cleanup);

  it("prioritizes Start Operations Process when intake not active", async () => {
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

  it("prioritizes Move to Target Stage when ready", async () => {
    // Mock the checklist to be ready via the lib logic in the component
    // component logic: isReady = (readinessSummary?.pct ?? 0) >= 100 && !!lead.process_template_id;
    // But readinessSummary is set by ReadinessChecklist.
    // We'll mock ReadinessChecklist to call onChange(100, false)
    vi.mock("@/components/operations/ReadinessChecklist", () => ({
      default: ({ onChange }: any) => {
        React.useEffect(() => { onChange(100, false); }, []);
        return <div data-testid="ready-checklist" />;
      }
    }));

    (opsReadiness.resolveReadinessTargetStage as any).mockReturnValue({ id: "stage-target", name: "Target Stage" });
    (opsReadiness.isAtOrAfterTarget as any).mockReturnValue(false);

    await act(async () => {
      render(
        <MemoryRouter>
          <OperationsLeadDrawer
            lead={{ ...mockLead, intake_status: "active", service_status: "not_started", process_template_id: "t1" } as any}
            onClose={() => {}}
            onSaved={() => {}}
          />
        </MemoryRouter>
      );
    });

    expect(screen.getByRole("button", { name: /Move to Target Stage/i })).toBeTruthy();
  });

  it("shows Mark Ads Started when not ready/no target", async () => {
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

  it("shows Resume Service when paused", async () => {
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

  it("defaults to Log Communication for active service", async () => {
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

describe("OperationsLeadDrawer Tab Logic", () => {
  afterEach(cleanup);

  it("defaults to Onboarding (Process) for new leads without template", async () => {
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
});
