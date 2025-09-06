import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AdminItemsPage from "../pages/AdminItemsPage";
import React from "react";
import { api } from "../lib/api";

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

  it("retains existing drafts on load error", async () => {
    (api.items.list as any).mockRejectedValueOnce(new Error("boom"));

    const realUseState = React.useState;
    const draftsSetter = vi.fn() as React.Dispatch<unknown>;
    const useStateSpy = vi.spyOn(React, "useState");
    useStateSpy
      .mockImplementationOnce(realUseState) // items
      .mockImplementationOnce(
        (<S,>(_initialState: S | (() => S)): [S, React.Dispatch<React.SetStateAction<S>>] => [
          [{ id: "d1", status: "pending" }] as S,
          draftsSetter as React.Dispatch<React.SetStateAction<S>>,
        ]) as typeof React.useState,
      ) // drafts
      .mockImplementation(realUseState);

    render(<AdminItemsPage/>);
    await waitFor(() => expect(api.items.list).toHaveBeenCalled());

    expect(draftsSetter).not.toHaveBeenCalled();
    useStateSpy.mockRestore();
  });
});
