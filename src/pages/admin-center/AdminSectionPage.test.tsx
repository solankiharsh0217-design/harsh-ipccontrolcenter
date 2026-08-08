import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import AdminSectionPage from "./AdminSectionPage";
import { BrowserRouter } from "react-router-dom";
import * as AuthContext from "@/context/AuthContext";
import { getAdminSections } from "./sections";

// Mock UI components
vi.mock("@/components/ui-bits", () => ({
  PageHead: ({ title, sub }: any) => (
    <div>
      <h1>{title}</h1>
      <p>{sub}</p>
    </div>
  ),
  SectionLabel: ({ children }: any) => <h2>{children}</h2>,
  EmptyState: ({ title }: any) => <div>{title}</div>,
}));

const renderWithRouter = (ui: React.ReactElement) => {
  return render(ui, { wrapper: BrowserRouter });
};

const EXPECTED_ADMIN_FUNCTIONS = [
  "Team Directory", "Admin Panel", "Access Templates", "Assignment Eligibility Setup", "Media Buyer Dashboard Preview",
  "Master Settings", "Company Settings", "Invoice Settings", "Invoice Item Catalog", "Offer Catalog", "Service Packages / Tiers", "Lead Conversion Rules", "SAC / HSN Master",
  "Notifications", "Code of Conduct",
  "Team Performance Dashboard", "Team Performance OS", "KPI Review & Scorecard", "KPI Rewards",
  "IPC Resource Library", "Audit Log", "Lead Rescue Search", "System Refinement Checklist"
];

const EXPECTED_SLUGS = ["people", "business-configuration", "communication", "performance", "resources-system"];

describe("AdminSectionPage Reachability", () => {
  it("covers all 23 non-DangerZone admin functions across the five slugs", () => {
    vi.spyOn(AuthContext, "useAuth").mockReturnValue({
      isAdmin: true,
      hasModule: () => true,
    } as any);

    const sections = getAdminSections(true, () => true);
    const actualSlugs = sections.map(s => s.slug);
    expect(actualSlugs).toEqual(EXPECTED_SLUGS);

    const fullInventory = sections.flatMap(s => s.cards);
    const actualTitles = fullInventory.map(c => c.title);
    
    // Check that we have exactly the expected titles (no missing, no extra)
    expect(actualTitles.sort()).toEqual([...EXPECTED_ADMIN_FUNCTIONS].sort());
    expect(fullInventory.length).toBe(23);

    const allRenderedDestinations = new Set<string>();
    const allRenderedLabels = new Set<string>();

    EXPECTED_SLUGS.forEach(slug => {
      const { unmount } = renderWithRouter(<AdminSectionPage slug={slug} />);
      
      const section = sections.find(s => s.slug === slug);
      if (section) {
        section.cards.forEach(card => {
          expect(screen.getByText(card.title)).toBeDefined();
          allRenderedLabels.add(card.title);
          allRenderedDestinations.add(card.to);
        });
      }
      unmount();
    });

    expect(allRenderedLabels.size).toBe(23);
    expect(allRenderedDestinations.size).toBe(23);

    fullInventory.forEach(item => {
      expect(allRenderedLabels.has(item.title)).toBe(true);
      expect(allRenderedDestinations.has(item.to)).toBe(true);
    });
  });

  it("restricts visibility for non-admin with partial access (team only)", () => {
    vi.spyOn(AuthContext, "useAuth").mockReturnValue({
      isAdmin: false,
      hasModule: (mod: string) => mod === "team",
    } as any);

    renderWithRouter(<AdminSectionPage slug="people" />);

    // Should see Team Directory
    expect(screen.getByText("Team Directory")).toBeDefined();

    // Should NOT see Admin Panel or Access Templates
    expect(screen.queryByText("Admin Panel")).toBeNull();
    expect(screen.queryByText("Access Templates")).toBeNull();
  });
});
