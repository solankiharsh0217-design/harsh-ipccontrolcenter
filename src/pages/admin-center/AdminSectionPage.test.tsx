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

describe("AdminSectionPage Reachability", () => {
  it("covers all 23 non-DangerZone admin functions across the five slugs", () => {
    vi.spyOn(AuthContext, "useAuth").mockReturnValue({
      isAdmin: true,
      hasModule: () => true,
    } as any);

    const slugs = ["people", "business-configuration", "communication", "performance", "resources-system"];
    const allRenderedDestinations = new Set<string>();
    const allRenderedLabels = new Set<string>();

    slugs.forEach(slug => {
      const { unmount } = renderWithRouter(<AdminSectionPage slug={slug} />);
      
      const section = getAdminSections(true, () => true).find(s => s.slug === slug);
      if (section) {
        section.cards.forEach(card => {
          expect(screen.getByText(card.title)).toBeDefined();
          allRenderedLabels.add(card.title);
          allRenderedDestinations.add(card.to);
        });
      }
      unmount();
    });

    // Get the expected inventory from the source of truth
    const fullInventory = getAdminSections(true, () => true).flatMap(s => s.cards);
    
    expect(fullInventory.length).toBe(23);
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
