import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, act } from "@testing-library/react";
import OperationsLeadDrawer from "./OperationsLeadDrawer";
import { MemoryRouter } from "react-router-dom";
import React from 'react';

// Standardized Supabase Mock for all Drawer tests
const createMockQuery = () => {
  const query: any = {
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
  // Make it thenable so awaiting the builder itself resolves
  query.then = (onFulfilled: any) => Promise.resolve({ data: [], error: null }).then(onFulfilled);
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

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
    message: vi.fn(),
  },
}));

vi.mock("@/lib/operationsTemplates", () => ({
  listProcessTemplates: vi.fn().mockResolvedValue([]),
}));

vi.mock("@/components/ui-bits", () => ({
  LoadingState: () => <div data-testid="loading-state" />,
  EmptyState: ({ title }: any) => <div data-testid="empty-state">{title}</div>,
}));

// Mock lucide-react with flat exports to avoid hoisting/initialization errors
vi.mock("lucide-react", () => {
  const MockIcon = (props: any) => React.createElement('div', props);
  return {
    X: MockIcon,
    XIcon: MockIcon,
    ExternalLink: MockIcon,
    Play: MockIcon,
    Pause: MockIcon,
    Rocket: MockIcon,
    ArrowRight: MockIcon,
    Mail: MockIcon,
    ClipboardCopy: MockIcon,
    CheckCircle: MockIcon,
    CheckCircle2: MockIcon,
    RotateCcw: MockIcon,
    Square: MockIcon,
    ChevronDown: MockIcon,
    ChevronRight: MockIcon,
    AlertCircle: MockIcon,
    Check: MockIcon,
    Loader2: MockIcon,
  };
});

// Mock UI Components
vi.mock("@/components/ui/tabs", () => ({
  Tabs: ({ children, value, onValueChange }: any) => (
    <div data-testid="mock-tabs" data-value={value}>{children}</div>
  ),
  TabsList: ({ children }: any) => <div role="tablist">{children}</div>,
  TabsTrigger: ({ children, value }: any) => (
    <button role="tab" data-value={value}>{children}</button>
  ),
  TabsContent: ({ children, value }: any) => (
    <div role="tabpanel" data-value={value}>{children}</div>
  ),
}));

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
vi.mock("@/components/operations/SlaChip", () => ({ default: () => null }));
vi.mock("@/components/operations/ReadinessChecklist", () => ({ 
  default: ({ onChange }: any) => {
    const initialized = React.useRef(false);
    React.useEffect(() => {
      if (!initialized.current) {
        onChange(0, false);
        initialized.current = true;
      }
    }, []);
    return null;
  }
}));

// Mock readiness lib functions
vi.mock("@/lib/operationsReadiness", () => ({
  resolveReadinessTargetStage: vi.fn(),
  isAtOrAfterTarget: vi.fn().mockReturnValue(false),
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

describe("OperationsLeadDrawer Logic", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (opsReadiness.resolveReadinessTargetStage as any).mockReturnValue(null);
  });

  afterEach(cleanup);

  it("prioritizes actions correctly", async () => {
    const { rerender } = render(
      <MemoryRouter>
        <OperationsLeadDrawer
          lead={{ ...mockLead, intake_status: "pending", service_status: "not_started" } as any}
          onClose={() => {}}
          onSaved={() => {}}
        />
      </MemoryRouter>
    );
    expect(screen.getAllByRole("button", { name: /Start Operations Process/i }).length).toBeGreaterThan(0);
    expect(screen.queryAllByRole("button", { name: /Mark Ads Started/i })).toHaveLength(0);

    await act(async () => {
      rerender(
        <MemoryRouter>
          <OperationsLeadDrawer
            lead={{ ...mockLead, intake_status: "active", service_status: "not_started" } as any}
            onClose={() => {}}
            onSaved={() => {}}
          />
        </MemoryRouter>
      );
    });
    expect(screen.getAllByRole("button", { name: /Mark Ads Started/i }).length).toBeGreaterThan(0);
    expect(screen.queryAllByRole("button", { name: /Start Operations Process/i })).toHaveLength(0);

    await act(async () => {
      rerender(
        <MemoryRouter>
          <OperationsLeadDrawer
            lead={{ ...mockLead, intake_status: "active", service_status: "paused" } as any}
            onClose={() => {}}
            onSaved={() => {}}
          />
        </MemoryRouter>
      );
    });
    expect(screen.getAllByRole("button", { name: /Resume Service/i }).length).toBeGreaterThan(0);
    expect(screen.queryAllByRole("button", { name: /Mark Ads Started/i })).toHaveLength(0);

    await act(async () => {
      rerender(
        <MemoryRouter>
          <OperationsLeadDrawer
            lead={{ ...mockLead, intake_status: "active", service_status: "active" } as any}
            onClose={() => {}}
            onSaved={() => {}}
          />
        </MemoryRouter>
      );
    });
    expect(screen.getAllByRole("button", { name: /Log Communication/i }).length).toBeGreaterThan(0);
    expect(screen.queryAllByRole("button", { name: /Resume Service/i })).toHaveLength(0);
  });

  it("defaults to Onboarding tab correctly", async () => {
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
