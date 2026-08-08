import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import AdminCenter from "./AdminCenter";
import { BrowserRouter } from "react-router-dom";
import * as AuthContext from "@/context/AuthContext";

// Mock the navigate function
const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

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

describe("AdminCenter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders all five group cards and Danger Zone for a full admin", () => {
    vi.spyOn(AuthContext, "useAuth").mockReturnValue({
      isAdmin: true,
      hasModule: () => true,
      user: { id: "123" },
      session: {},
      signOut: vi.fn(),
      loading: false,
    } as any);

    renderWithRouter(<AdminCenter />);

    // Main headings (SectionLabels)
    expect(screen.getAllByText("People").some(el => el.tagName === 'H2')).toBe(true);
    expect(screen.getAllByText("Business Configuration").some(el => el.tagName === 'H2')).toBe(true);
    expect(screen.getAllByText("Communication").some(el => el.tagName === 'H2')).toBe(true);
    expect(screen.getAllByText("Performance").some(el => el.tagName === 'H2')).toBe(true);
    expect(screen.getAllByText("Resources & System").some(el => el.tagName === 'H2')).toBe(true);
    expect(screen.getByText("Danger Zone")).toBeDefined();

    // Group cards (titles inside the cards)
    expect(screen.getAllByText("People").some(el => el.tagName === 'DIV')).toBe(true);
    
    // Danger Zone card
    expect(screen.getByText("Hard Wipe All Lead Data")).toBeDefined();

    // NO LONGER expect individual cards like "Team Directory" or "Master Settings" on landing
    expect(screen.queryByText("Team Directory")).toBeNull();
    expect(screen.queryByText("Master Settings")).toBeNull();
  });

  it("shows only accessible group cards for non-admin with specific modules", () => {
    vi.spyOn(AuthContext, "useAuth").mockReturnValue({
      isAdmin: false,
      hasModule: (mod: string) => mod === "team" || mod === "notifications",
      user: { id: "123" },
      session: {},
      signOut: vi.fn(),
      loading: false,
    } as any);

    renderWithRouter(<AdminCenter />);

    // People (has "team") and Communication (has "notifications") should show
    expect(screen.getAllByText("People").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Communication").length).toBeGreaterThan(0);

    // Business Configuration, Performance, and Danger Zone should be hidden
    expect(screen.queryByText("Business Configuration")).toBeNull();
    expect(screen.queryByText("Performance")).toBeNull();
    expect(screen.queryByText("Danger Zone")).toBeNull();
  });

  it("navigates to the correct /admin-center/<slug> when a group card button is clicked", () => {
    vi.spyOn(AuthContext, "useAuth").mockReturnValue({
      isAdmin: true,
      hasModule: () => true,
      user: { id: "123" },
      session: {},
      signOut: vi.fn(),
      loading: false,
    } as any);

    renderWithRouter(<AdminCenter />);

    const openPeopleButton = screen.getByRole("button", { name: /Open People/i });
    fireEvent.click(openPeopleButton);

    expect(mockNavigate).toHaveBeenCalledWith("/admin-center/people");
  });

  it("shows empty state when no modules are accessible", () => {
    vi.spyOn(AuthContext, "useAuth").mockReturnValue({
      isAdmin: false,
      hasModule: () => false,
      user: { id: "123" },
      session: {},
      signOut: vi.fn(),
      loading: false,
    } as any);

    renderWithRouter(<AdminCenter />);

    expect(screen.getByText(/You don't have access to any modules/i)).toBeDefined();
  });
});
