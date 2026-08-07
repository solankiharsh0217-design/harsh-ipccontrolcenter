import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { LoadingState, LoadingRow } from "@/components/ui-bits";

describe("LoadingState", () => {
  it("renders an element with role='status'", () => {
    render(<LoadingState />);
    expect(screen.getByRole("status")).toBeDefined();
  });

  it("has aria-live='polite'", () => {
    render(<LoadingState />);
    const status = screen.getByRole("status");
    expect(status.getAttribute("aria-live")).toBe("polite");
  });

  it("with no props renders the default label text Loading…", () => {
    render(<LoadingState />);
    // Note: the ellipsis is a single character \u2026
    expect(screen.getByText("Loading…")).toBeDefined();
  });

  it("renders a custom label when the label prop is passed", () => {
    render(<LoadingState label="Loading roles…" />);
    expect(screen.getByText("Loading roles…")).toBeDefined();
  });

  it("spinner icon is hidden from assistive technology (aria-hidden='true')", () => {
    const { container } = render(<LoadingState />);
    // The Loader2 icon is an svg
    const svg = container.querySelector("svg");
    expect(svg?.getAttribute("aria-hidden")).toBe("true");
  });
});

describe("LoadingRow", () => {
  it("renders a table row containing a cell whose colSpan equals the colSpan prop passed in", () => {
    render(
      <table>
        <tbody>
          <LoadingRow colSpan={5} />
        </tbody>
      </table>
    );
    const cell = screen.getByRole("cell");
    expect(cell.getAttribute("colSpan")).toBe("5");
  });

  it("exposes role='status'", () => {
    render(
      <table>
        <tbody>
          <LoadingRow colSpan={5} />
        </tbody>
      </table>
    );
    expect(screen.getByRole("status")).toBeDefined();
  });
});
