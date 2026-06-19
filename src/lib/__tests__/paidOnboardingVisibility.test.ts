import { describe, it, expect } from "vitest";
import { getVisiblePaidOnboardingLeads } from "@/lib/paidOnboardingVisibility";

const PID = "paid-pipeline-id";
const mk = (o: any): any => ({
  id: o.id,
  pipeline_id: PID,
  archived_at: null,
  deleted_at: null,
  ...o,
});

describe("getVisiblePaidOnboardingLeads", () => {
  it("includes converted / linked_to_paid / not_converted leads", () => {
    const leads = [
      mk({ id: "a", conversion_status: "converted" }),
      mk({ id: "b", conversion_status: "linked_to_paid" }),
      mk({ id: "c", conversion_status: "not_converted" }),
      mk({ id: "d", conversion_status: null }),
    ];
    expect(
      getVisiblePaidOnboardingLeads(leads, PID).map((l) => l.id).sort()
    ).toEqual(["a", "b", "c", "d"]);
  });

  it("excludes archived and soft-deleted by default", () => {
    const leads = [
      mk({ id: "a" }),
      mk({ id: "b", archived_at: "2025-01-01" }),
      mk({ id: "c", deleted_at: "2025-01-01" }),
    ];
    expect(getVisiblePaidOnboardingLeads(leads, PID).map((l) => l.id)).toEqual(["a"]);
  });

  it("excludes leads from other pipelines", () => {
    const leads = [
      mk({ id: "a" }),
      { id: "b", pipeline_id: "other", archived_at: null, deleted_at: null } as any,
    ];
    expect(getVisiblePaidOnboardingLeads(leads, PID).map((l) => l.id)).toEqual(["a"]);
  });

  it("does NOT hide cards based on hide_from_sales_workload or paid_pipeline_lead_id", () => {
    const leads = [
      mk({ id: "a", hide_from_sales_workload: true }),
      mk({ id: "b", paid_pipeline_lead_id: "xxx" }),
    ];
    expect(getVisiblePaidOnboardingLeads(leads, PID).map((l) => l.id).sort()).toEqual(["a", "b"]);
  });

  it("showArchived=true returns archived rows and excludes active rows", () => {
    const leads = [
      mk({ id: "a" }),
      mk({ id: "b", archived_at: "2025-01-01" }),
    ];
    expect(
      getVisiblePaidOnboardingLeads(leads, PID, { showArchived: true }).map((l) => l.id)
    ).toEqual(["b"]);
  });
});
