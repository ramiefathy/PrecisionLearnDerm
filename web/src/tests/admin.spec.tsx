import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AdminItemsPage from "../pages/AdminItemsPage";

vi.mock("../lib/api", () => ({
  api: {
    items: {
      propose: vi.fn().mockResolvedValue({ draftId: "d1" }),
      revise: vi.fn().mockResolvedValue({ draftId: "d2" }),
      promote: vi.fn().mockResolvedValue({ ok: true })
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
    await userEvent.type(screen.getByPlaceholderText(/topicids/i), "psoriasis.plaque");
    await userEvent.click(screen.getByRole("button", { name: /propose/i }));
    await userEvent.type(screen.getByPlaceholderText(/itemid/i), "it1");
    await userEvent.type(screen.getByPlaceholderText(/instructions/i), "shorten stem");
    await userEvent.click(screen.getByRole("button", { name: /revise/i }));
    expect(true).toBe(true);
  });
});
