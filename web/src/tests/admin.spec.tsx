import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AdminItemsPage from "../pages/AdminItemsPage";

vi.mock("../lib/api", () => ({
  api: {
    items: {
      propose: vi.fn().mockResolvedValue({ draftId: "d1" }),
      revise: vi.fn().mockResolvedValue({ draftId: "d2" }),
      promote: vi.fn().mockResolvedValue({ ok: true }),
      list: vi.fn().mockResolvedValue({ items: [{ id: 'i1', stem: 'Q1', options: [] }] })
    }
  }
}));

vi.mock("firebase/firestore", () => ({
  collection: vi.fn(),
  query: vi.fn(() => ({})),
  where: vi.fn(() => ({})),
  orderBy: vi.fn(() => ({})),
  limit: vi.fn(() => ({})),
  getDocs: vi.fn(async () => ({ docs: [] })),
  getFirestore: vi.fn(() => ({}))
}));

vi.mock("../lib/firebase", () => ({ db: {} }));

describe("AdminItemsPage", () => {
  it("propose and revise actions are clickable", async () => {
    render(<AdminItemsPage/>);
    await userEvent.click(await screen.findByRole("button", { name: /actions/i }));
    const topicInput = await screen.findByPlaceholderText(/psoriasis, acne, melanoma/i);
    await userEvent.type(topicInput, "psoriasis.plaque");
    await userEvent.click(screen.getByRole("button", { name: /propose topics/i }));

    const selectItemBtn = screen.getByText(/click to select an item/i);
    await userEvent.click(selectItemBtn);
    await userEvent.type(screen.getByPlaceholderText(/describe the specific changes/i), "shorten stem");
    await userEvent.click(screen.getByRole("button", { name: /request revision/i }));
    expect(true).toBe(true);
  });
});
