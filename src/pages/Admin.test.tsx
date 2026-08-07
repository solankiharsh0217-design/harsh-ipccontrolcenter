import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import Admin from "./Admin";
import { BrowserRouter } from "react-router-dom";
import * as AuthContext from "@/context/AuthContext";
import { supabase } from "@/integrations/supabase/client";

// Mock Supabase
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
      upsert: vi.fn().mockReturnThis(),
    })),
    functions: {
      invoke: vi.fn(),
    },
  },
}));

// Mock UI bits
vi.mock("@/components/ui-bits", () => ({
  PageHead: ({ title }: any) => <h1>{title}</h1>,
  SectionLabel: ({ children }: any) => <h2>{children}</h2>,
}));

// Mock audit log
vi.mock("@/lib/auditLog", () => ({
  logActivity: vi.fn(),
}));

const renderWithRouter = (ui: React.ReactElement) => {
  return render(ui, { wrapper: BrowserRouter });
};

describe("Admin Panel (Identity & Access)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(AuthContext, "useAuth").mockReturnValue({
      user: { id: "admin-123" },
      isAdmin: true,
      hasModule: () => true,
    } as any);

    // Mock initial loads
    (supabase.from as any).mockImplementation((table: string) => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockImplementation(() => {
        if (table === "profiles") return { data: [], error: null };
        if (table === "attendance_logs") return { data: [], count: 0, error: null };
        return { data: [], error: null };
      }),
    }));
  });

  it("renders correctly", () => {
    renderWithRouter(<Admin />);
    expect(screen.getByText("Admin Panel")).toBeDefined();
    expect(screen.getByText("Add team member directly")).toBeDefined();
  });

  it("adds a member successfully", async () => {
    (supabase.functions.invoke as any).mockResolvedValue({
      data: { ok: true, message: "Member added", user_id: "new-user-123" },
      error: null,
    });

    renderWithRouter(<Admin />);

    fireEvent.change(screen.getByPlaceholderText("Full name"), { target: { value: "John Doe" } });
    fireEvent.change(screen.getByPlaceholderText("name@ipc.in"), { target: { value: "john@ipc.in" } });
    fireEvent.change(screen.getByPlaceholderText("Set a password"), { target: { value: "password123" } });
    
    const addButton = screen.getByRole("button", { name: /Add member/i });
    fireEvent.click(addButton);

    await waitFor(() => {
      expect(supabase.functions.invoke).toHaveBeenCalledWith(
        "admin-create-member",
        expect.objectContaining({
          body: expect.objectContaining({
            full_name: "John Doe",
            email: "john@ipc.in",
          }),
        })
      );
    });
  });
});
