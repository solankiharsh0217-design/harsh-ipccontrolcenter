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
vi.mock("@/components/operations/ReadinessChecklist", () => ({ default: () => null }));
vi.mock("@/components/operations/TeamResultSubmissionPanel", () => ({ default: () => null }));
vi.mock("@/components/operations/CustomFieldsPanel", () => ({ default: () => null }));
vi.mock("@/components/operations/CommTemplatePickerModal", () => ({ default: () => null }));
vi.mock("@/components/operations/OperationsActivityTimeline", () => ({ default: () => null }));
vi.mock("@/components/operations/OperationsLinkedRecordsCard", () => ({ default: () => null }));
vi.mock("@/components/operations/StartProcessModal", () => ({ default: () => null }));

const mockLead = {
  id: "ops-lead-123",
  name: "Test Client",
  email: "test@example.com",
  phone: "123456789",
  product_name: "Test Product",
  service_status: "not_started",
  intake_status: "pending",
  total_active_days: 0,
  total_paused_days: 0,
  assigned_media_buyer_id: "user-123",
};

describe("OperationsLeadDrawer Logic", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(cleanup);

  it("Start Operations Process priority", async () => {
    await act(async () => {
      render(
        React.createElement(MemoryRouter, null, 
          React.createElement(OperationsLeadDrawer, {
            lead: { ...mockLead, intake_status: "pending", service_status: "not_started" } as any,
            onClose: () => {},
            onSaved: () => {}
          })
        )
      );
    });
    expect(screen.getByRole("button", { name: /Start Operations Process/i })).toBeTruthy();
  });

  it("Mark Ads Started priority", async () => {
    await act(async () => {
      render(
        React.createElement(MemoryRouter, null, 
          React.createElement(OperationsLeadDrawer, {
            lead: { ...mockLead, intake_status: "active", service_status: "not_started" } as any,
            onClose: () => {},
            onSaved: () => {}
          })
        )
      );
    });
    expect(screen.getByRole("button", { name: /Mark Ads Started/i })).toBeTruthy();
  });

  it("Resume Service priority", async () => {
    await act(async () => {
      render(
        React.createElement(MemoryRouter, null, 
          React.createElement(OperationsLeadDrawer, {
            lead: { ...mockLead, intake_status: "active", service_status: "paused" } as any,
            onClose: () => {},
            onSaved: () => {}
          })
        )
      );
    });
    expect(screen.getByRole("button", { name: /Resume Service/i })).toBeTruthy();
  });

  it("Log Communication default", async () => {
    await act(async () => {
      render(
        React.createElement(MemoryRouter, null, 
          React.createElement(OperationsLeadDrawer, {
            lead: { ...mockLead, intake_status: "active", service_status: "active" } as any,
            onClose: () => {},
            onSaved: () => {}
          })
        )
      );
    });
    expect(screen.getByRole("button", { name: /Log Communication/i })).toBeTruthy();
  });

  it("defaults to Onboarding tab", async () => {
    await act(async () => {
      render(
        React.createElement(MemoryRouter, null, 
          React.createElement(OperationsLeadDrawer, {
            lead: { ...mockLead, service_status: "not_started" } as any,
            onClose: () => {},
            onSaved: () => {}
          })
        )
      );
    });
    const tabs = screen.getAllByTestId("mock-tabs");
    expect(tabs[0].getAttribute("data-value")).toBe("onboarding");
  });
});
