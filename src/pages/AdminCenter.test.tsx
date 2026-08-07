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

// Mock UI components that might cause issues in test environment
vi.mock("@/components/ui-bits", () => ({
  PageHead: ({ title, sub }: any) => (
    <div>
      <h1>{title}</h1>
      <p>{sub}</p>
    </div>
  ),
  SectionLabel: ({ children }: any) => <h2>{children}</h2>,
}));

const renderWithRouter = (ui: React.ReactElement) => {
  return render(ui, { wrapper: BrowserRouter });
};

describe("AdminCenter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders all sections for a full admin", () => {
    vi.spyOn(AuthContext, "useAuth").mockReturnValue({
      isAdmin: true,
      hasModule: () => true,
      user: { id: "123" },
      session: {},
      signOut: vi.fn(),
      loading: false,
    } as any);

    renderWithRouter(<AdminCenter />);

    expect(screen.getByText("People")).toBeDefined();
    expect(screen.getByText("Business Configuration")).toBeDefined();
    expect(screen.getByText("Communication")).toBeDefined();
    expect(screen.getByText("Performance")).toBeDefined();
    expect(screen.getByText("Resources & System")).toBeDefined();
    expect(screen.getByText("Danger Zone")).toBeDefined();

    // Check a few specific cards
    expect(screen.getByText("Team Directory")).toBeDefined();
    expect(screen.getByText("Master Settings")).toBeDefined();
    expect(screen.getByText("Hard Wipe All Lead Data")).toBeDefined();
  });

  it("hides admin-only cards for non-admin with specific modules", () => {
    vi.spyOn(AuthContext, "useAuth").mockReturnValue({
      isAdmin: false,
      hasModule: (mod: string) => mod === "team" || mod === "notifications",
      user: { id: "123" },
      session: {},
      signOut: vi.fn(),
      loading: false,
    } as any);

    renderWithRouter(<AdminCenter />);

    // Should show sections that have accessible cards
    expect(screen.getByText("People")).toBeDefined();
    expect(screen.getByText("Communication")).toBeDefined();

    // Accessible cards
    expect(screen.getByText("Team Directory")).toBeDefined();
    expect(screen.getByText("Notifications")).toBeDefined();

    // Admin-only cards/sections should be hidden
    expect(screen.queryByText("Admin Panel")).toBeNull();
    expect(screen.queryByText("Master Settings")).toBeNull();
    expect(screen.queryByText("Danger Zone")).toBeNull();
  });

  it("navigates to the correct path when a card button is clicked", () => {
    vi.spyOn(AuthContext, "useAuth").mockReturnValue({
      isAdmin: true,
      hasModule: () => true,
      user: { id: "123" },
      session: {},
      signOut: vi.fn(),
      loading: false,
    } as any);

    renderWithRouter(<AdminCenter />);

    const teamDirButton = screen.getByRole("button", { name: /Open Team Directory/i });
    fireEvent.click(teamDirButton);

    expect(mockNavigate).toHaveBeenCalledWith("/team");
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
