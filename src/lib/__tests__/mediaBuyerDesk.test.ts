import { describe, it, expect, vi, beforeEach } from "vitest";

const rpc = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a) } }));
vi.mock("@/lib/auditLog", () => ({ logActivity: vi.fn() }));
vi.mock("@/lib/notifications", () => ({ createNotification: vi.fn() }));
vi.mock("@/lib/eligibleAssignees", () => ({ getEligibleAssignees: vi.fn() }));

const { claimCase, isUnclaimedRequest, hoursWaiting, whatsappLink, CASE_STAGES } = await import("@/lib/mediaBuyerOps");

beforeEach(() => rpc.mockReset());

describe("queue helpers", () => {
  it("treats only active, undeleted, unassigned cases as requests", () => {
    expect(isUnclaimedRequest({ assigned_media_buyer_id: null, is_active: true, is_deleted: false })).toBe(true);
    expect(isUnclaimedRequest({ assigned_media_buyer_id: "aman", is_active: true, is_deleted: false })).toBe(false);
    // history imported as closed must not flood the queue
    expect(isUnclaimedRequest({ assigned_media_buyer_id: null, is_active: false, is_deleted: false })).toBe(false);
    expect(isUnclaimedRequest({ assigned_media_buyer_id: null, is_active: true, is_deleted: true })).toBe(false);
  });

  it("measures waiting time from the form submission, not case creation", () => {
    const now = Date.parse("2026-10-14T12:00:00Z");
    expect(hoursWaiting({ form_submitted_at: "2026-10-12T12:00:00Z", created_at: "2026-10-14T11:00:00Z" }, now)).toBe(48);
    expect(hoursWaiting({ form_submitted_at: null, created_at: "2026-10-14T09:30:00Z" }, now)).toBe(2);
  });

  it("builds WhatsApp links for Indian numbers", () => {
    expect(whatsappLink("7448004363")).toBe("https://wa.me/917448004363");
    expect(whatsappLink("917448004363")).toBe("https://wa.me/917448004363");
    expect(whatsappLink("123")).toBeNull();
    expect(whatsappLink(null)).toBeNull();
  });

  it("puts the form and booking stages at the front of the funnel", () => {
    expect(CASE_STAGES.slice(0, 2)).toEqual(["form_submitted", "call_booked"]);
  });
});

describe("claimCase", () => {
  it("calls the atomic RPC with the booked slot", async () => {
    rpc.mockResolvedValue({ data: { id: "c1", student_name: "Mayur", assigned_media_buyer_name: "Aman" }, error: null });
    const c = await claimCase("c1", "2026-10-15T05:30:00.000Z");
    expect(rpc).toHaveBeenCalledWith("claim_media_buyer_case", { p_case_id: "c1", p_scheduled_for: "2026-10-15T05:30:00.000Z" });
    expect(c.assigned_media_buyer_name).toBe("Aman");
  });

  it("surfaces the server's 'already taken' message to the second clicker", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "P0001", message: "Already taken by Sneha." } });
    await expect(claimCase("c1", null)).rejects.toThrow("Already taken by Sneha.");
  });
});
