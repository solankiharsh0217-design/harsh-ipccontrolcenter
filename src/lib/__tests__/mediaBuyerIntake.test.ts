import { describe, it, expect } from "vitest";
import {
  classifyHeader,
  mapFormFields,
  formRowKey,
  financeCheck,
  parseAdPlatforms,
  parseYesNo,
  type PaidLeadForCheck,
} from "../../../supabase/functions/_shared/mb-form.ts";

// Headers exactly as they appear in the live "Form responses 1" tab,
// stray spaces and Hindi line included.
const HEADERS = {
  ts: "Timestamp",
  email: "Email address",
  name: "Name",
  phone: "WhatsApp Number",
  bajaj: "Bajaj Process Completed or NOT?",
  website: "Your Brand Website (If it is there) - Please Leave Blank if you don't have any",
  startDate: "When you would like to Start Your Ads (Put the Date)",
  adType: "  Which type of ads would you like to run?  ",
  brand: "Brand Name",
  insta: "Your Brand Instagram Handle",
  revenue: "Your Current Revenue/Turnover Per Year?",
  startWhen: "When you would like to Start Ads?",
  gmb: "Do you have a Google My Business Profile",
  cities:
    "Please mention all the cities and states where you want to run your Ads...\n\nकृपया उन सभी शहरों और राज्यों का उल्लेख करें जहां आप अपने विज्ञापन चलाना चाहते हैं...",
  agree: "Please Understand and Give Agreement to the Following Points:",
};

function row(values: Partial<Record<keyof typeof HEADERS, string>>) {
  const out: Record<string, string[]> = {};
  for (const [k, header] of Object.entries(HEADERS)) {
    out[header] = [values[k as keyof typeof HEADERS] ?? ""];
  }
  return out;
}

describe("header classification", () => {
  it("maps every live form header to the right field", () => {
    expect(classifyHeader(HEADERS.ts)).toBeNull();
    expect(classifyHeader(HEADERS.email)).toBe("email");
    expect(classifyHeader(HEADERS.name)).toBe("name");
    expect(classifyHeader(HEADERS.phone)).toBe("phone");
    expect(classifyHeader(HEADERS.bajaj)).toBe("bajaj_answer");
    expect(classifyHeader(HEADERS.website)).toBe("brand_website");
    expect(classifyHeader(HEADERS.startDate)).toBe("start_date");
    expect(classifyHeader(HEADERS.adType)).toBe("ad_platforms");
    expect(classifyHeader(HEADERS.brand)).toBe("brand_name");
    expect(classifyHeader(HEADERS.insta)).toBe("brand_instagram");
    expect(classifyHeader(HEADERS.revenue)).toBe("annual_revenue_text");
    expect(classifyHeader(HEADERS.startWhen)).toBe("start_when");
    expect(classifyHeader(HEADERS.gmb)).toBe("has_gmb");
    expect(classifyHeader(HEADERS.cities)).toBe("target_locations");
    expect(classifyHeader(HEADERS.agree)).toBe("agreement");
  });
});

describe("mapFormFields — real responses", () => {
  it("maps a complete submission", () => {
    const m = mapFormFields(row({
      email: "Mayurkothari0120@gmail.com ",
      name: "Mayur Kothari ",
      phone: "7448004363",
      bajaj: "Completed",
      website: "www.premkathaa.in",
      startDate: "5th June",
      adType: "Both Meta and Google Ads",
      brand: "Premkathaa.in",
      insta: "premkathaa.in",
      revenue: "12 -13 Lacs",
      startWhen: "5th June",
      gmb: "No",
      cities: "Goa, Pune , Konkan, Mumbai",
      agree: "It usually takes 5 to 7 days…",
    }));
    expect(m).toEqual({
      student_name: "Mayur Kothari",
      student_email: "mayurkothari0120@gmail.com",
      student_phone: "7448004363",
      bajaj_answer: "Completed",
      brand_name: "Premkathaa.in",
      brand_website: "www.premkathaa.in",
      brand_instagram: "premkathaa.in",
      ad_platforms: "both",
      preferred_start_text: "5th June",          // identical answers collapse to one
      annual_revenue_text: "12 -13 Lacs",
      has_gmb: false,
      target_locations: "Goa, Pune , Konkan, Mumbai",
      agreed_to_terms: true,
    });
  });

  it("treats 'No' in the website field as no website, and keeps both start answers when they differ", () => {
    const m = mapFormFields(row({
      name: "Amit Makkar", email: "amitmakkarkkr@gmail.com", phone: "+91 98965 65558",
      website: "No", startDate: "You suggest", startWhen: "From Next week ",
    }));
    expect(m.brand_website).toBeNull();
    expect(m.student_phone).toBe("9896565558");
    expect(m.preferred_start_text).toBe("You suggest / From Next week");
  });

  it("survives a missing name and empty answers", () => {
    const m = mapFormFields({ "Email address": ["x@y.com"] });
    expect(m.student_name).toBe("Unnamed student");
    expect(m.ad_platforms).toBeNull();
    expect(m.has_gmb).toBeNull();
    expect(m.agreed_to_terms).toBe(false);
  });

  it("accepts plain string values as well as Apps Script arrays", () => {
    const m = mapFormFields({ Name: "Sitam", "WhatsApp Number": "9935298684" });
    expect(m.student_name).toBe("Sitam");
    expect(m.student_phone).toBe("9935298684");
  });
});

describe("small parsers", () => {
  it("reads ad platform choices", () => {
    expect(parseAdPlatforms("Both Meta and Google Ads")).toBe("both");
    expect(parseAdPlatforms("Meta Ads (Facebook & Instagram)")).toBe("meta");
    expect(parseAdPlatforms("Google Ads")).toBe("google");
    expect(parseAdPlatforms("not sure")).toBeNull();
  });

  it("reads yes/no including Hinglish", () => {
    expect(parseYesNo("Yes")).toBe(true);
    expect(parseYesNo("haan")).toBe(true);
    expect(parseYesNo("No ")).toBe(false);
    expect(parseYesNo("maybe")).toBeNull();
  });
});

describe("formRowKey", () => {
  it("is stable for the same submission and distinct across submissions", () => {
    const a = formRowKey("2025-07-26T05:41:01.000Z", "sthakur363@gmail.com", "9754169683");
    expect(formRowKey("2025-07-26T05:41:01.000Z", "sthakur363@gmail.com", "9754169683")).toBe(a);
    // Same student re-submitting later is a different submission (handled by case de-dupe, not the key)
    expect(formRowKey("2025-07-26T07:01:05.000Z", "sthakur363@gmail.com", "9754169683")).not.toBe(a);
  });

  it("falls back to phone when there is no email", () => {
    expect(formRowKey("2025-01-01T00:00:00.000Z", null, "9999999999")).toBe("gform:2025-01-01T00:00:00.000Z:9999999999");
  });
});

describe("financeCheck", () => {
  const lead = (over: Partial<PaidLeadForCheck>): PaidLeadForCheck => ({
    id: "L1", is_enrolled: false, is_final_sale: false, is_dropped: false, is_refunded: false,
    finance_status: null, pipeline_stage: "Token Paid", ...over,
  });

  it("is not_found with no matching paid lead", () => {
    expect(financeCheck([])).toEqual({ status: "not_found", leadId: null });
  });

  it("verifies an enrolled lead", () => {
    expect(financeCheck([lead({ is_enrolled: true })]).status).toBe("verified");
  });

  it("verifies Bajaj approval even before disbursement", () => {
    expect(financeCheck([lead({ finance_status: "Approved" })]).status).toBe("verified");
  });

  it("is pending while finance is still in progress", () => {
    expect(financeCheck([lead({ finance_status: "Documents Pending" })]).status).toBe("pending");
  });

  it("flags dropped or refunded students", () => {
    expect(financeCheck([lead({ is_refunded: true, is_enrolled: true })]).status).toBe("dropped");
  });

  it("prefers the best of several matches", () => {
    const r = financeCheck([lead({ id: "A", is_dropped: true }), lead({ id: "B", finance_status: "Disbursed" })]);
    expect(r).toEqual({ status: "verified", leadId: "B" });
  });
});
