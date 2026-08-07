import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, act } from "@testing-library/react";
import OperationsLeadDrawer from "./OperationsLeadDrawer";
import { MemoryRouter } from "react-router-dom";
import React from 'react';

// Standardized Supabase Mock
const createMockQuery = () => ({
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
});

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

// Mock lucide-react with a flat object of components to avoid Proxy/React.createElement issues in hoisted mocks
vi.mock("lucide-react", () => {
  const MockIcon = (props: any) => <div {...props} />;
  return {
    X: MockIcon,
    XIcon: MockIcon,
    ExternalLink: MockIcon,
    Play: MockIcon,
    Pause: MockIcon,
    Square: MockIcon,
    CheckCircle: MockIcon,
    CheckCircle2: MockIcon,
    RotateCcw: MockIcon,
    ClipboardCopy: MockIcon,
    Mail: MockIcon,
    Rocket: MockIcon,
    ArrowRight: MockIcon,
    Settings: MockIcon,
    Clock: MockIcon,
    AlertCircle: MockIcon,
    Check: MockIcon,
    ChevronDown: MockIcon,
    ChevronRight: MockIcon,
    MoreVertical: MockIcon,
    FileText: MockIcon,
    Activity: MockIcon,
    Truck: MockIcon,
    Target: MockIcon,
    Users: MockIcon,
    Phone: MockIcon,
    User: MockIcon,
    Calendar: MockIcon,
    Globe: MockIcon,
    Layout: MockIcon,
  };
});

// Mock UI Components with simple divs
vi.mock("@/components/ui/tabs", () => ({
  Tabs: ({ children, value }: any) => <div data-testid="mock-tabs" data-value={value}>{children}</div>,
  TabsList: ({ children }: any) => <div>{children}</div>,
  TabsTrigger: ({ children, value }: any) => <button data-value={value}>{children}</button>,
  TabsContent: ({ children, value }: any) => <div data-value={value}>{children}</div>,
}));

// Mock child components
vi.mock("@/components/offers/PromisedOffersPanel", () => ({ default: () => <div /> }));
vi.mock("@/components/operations/DeliveryTrackingSection", () => ({ default: () => <div /> }));
vi.mock("@/components/operations/ConversionsSection", () => ({ default: () => <div /> }));
vi.mock("@/components/operations/TeamResultSubmissionPanel", () => ({ default: () => <div /> }));
vi.mock("@/components/operations/CustomFieldsPanel", () => ({ default: () => <div /> }));
vi.mock("@/components/operations/CommTemplatePickerModal", () => ({ default: () => <div /> }));
vi.mock("@/components/operations/OperationsActivityTimeline", () => ({ default: () => <div /> }));
vi.mock("@/components/operations/OperationsLinkedRecordsCard", () => ({ default: () => <div /> }));
vi.mock("@/components/operations/StartProcessModal", () => ({ default: () => <div /> }));

// Mock lib functions
vi.mock("@/lib/operationsReadiness", () => ({
  resolveReadinessTargetStage: vi.fn().mockReturnValue(null),
  isAtOrAfterTarget: vi.fn().mockReturnValue(false),
  computeServiceCalc: vi.fn().mockReturnValue({}),
  computeStageAging: vi.fn().mockReturnValue({ days: 0, status: 'good', lastMovedAt: new Date().toISOString(), source: 'none' }),
  moveOperationsLeadStage: vi.fn(),
  fetchStageChangeMap: vi.fn().mockResolvedValue(new Map()),
  listProcessTemplates: vi.fn().mockResolvedValue([]),
  getReadinessSettings: vi.fn().mockResolvedValue({}),
  getOperationsSlaSettings: vi.fn().mockResolvedValue({ watch_days: 7, overdue_days: 14 }),
  DEFAULT_SLA: { watch_days: 7, overdue_days: 14 },
  COMMUNICATION_EVENT_TYPES: new Set(["communication_copied", "communication_sent", "communication_failed", "communication_logged"]),
  isCommunicationEvent: (type: string) => ["communication_copied", "communication_sent", "communication_failed", "communication_logged"].includes(type),
}));

import * as opsReadiness from "@/lib/operationsReadiness";

// Mock ReadinessChecklist to be able to trigger state change
vi.mock("@/components/operations/ReadinessChecklist", () => ({
  default: ({ onChange }: any) => {
    // If the test case provides a specific lead ID that is "ready", we trigger 100%
    React.useEffect(() => {
      // Small delay to ensure state updates land
      const timer = setTimeout(() => onChange(0, false), 0);
      return () => clearTimeout(timer);
    }, [onChange]);
    return <div data-testid="readiness-checklist" />;
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

describe("OperationsLeadDrawer Priority Logic", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (opsReadiness.resolveReadinessTargetStage as any).mockReturnValue(null);
  });

  afterEach(cleanup);

  it("prioritizes Start Operations Process when intake is not active", async () => {
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

  it("prioritizes Move to Target Stage when ready (requires mock override)", async () => {
    // We override the ReadinessChecklist mock for this test
    vi.mock("@/components/operations/ReadinessChecklist", () => ({
      default: ({ onChange }: any) => {
        React.useEffect(() => { onChange(100, false); }, [onChange]);
        return <div />;
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

  it("shows Mark Ads Started when not ready/at target", async () => {
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

  it("defaults to Log Communication for active clients", async () => {
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

  it("defaults to Process (onboarding) for new/incomplete leads", async () => {
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
