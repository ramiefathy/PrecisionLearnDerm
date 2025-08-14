import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import FlashcardsPage from "../pages/FlashcardsPage";

vi.mock("../lib/api", () => ({
  api: {
    pe: {
      srsDue: vi.fn().mockResolvedValue({ cards: [{ id: "c1", ease: 2.3, intervalDays: 0, dueAt: Date.now(), topicIds: [] }] }),
      srsUpdate: vi.fn().mockResolvedValue({ ease: 2.4, intervalDays: 1, dueAt: Date.now() + 86400000 })
    }
  }
}));

describe("FlashcardsPage", () => {
  it("loads due card and grades it", async () => {
    render(<FlashcardsPage/>);
    expect(await screen.findByText(/Card c1/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /again/i }));
  });
});
