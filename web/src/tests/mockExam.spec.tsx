import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import MockExamPage from "../pages/MockExamPage";

vi.mock("../lib/attempts", () => ({
  saveAttempt: vi.fn().mockResolvedValue("attempt-1"),
}));

interface MockOption { text: string }
interface MockItem {
  stem: string;
  leadIn: string;
  options: MockOption[];
  keyIndex: number;
  topicIds: string[];
}

const mockItem: MockItem = {
  stem: "Mock Q",
  leadIn: "Which?",
  options: [{ text: "A" }, { text: "B" }, { text: "C" }, { text: "D" }],
  keyIndex: 0,
  topicIds: ["psoriasis.plaque"],
};

describe("MockExamPage", () => {
  it("submits attempt with injected loaders and correct payload shape", async () => {
    const loadBatch = async () => [{ itemId: "m1" }];
    const loadItem = async () => mockItem;
    const { saveAttempt } = await import("../lib/attempts");

    const hrefSetter = vi.spyOn(window, 'location', 'set');
    hrefSetter.mockImplementation(() => {});

    render(<MockExamPage loadBatch={loadBatch} loadItem={loadItem} />);

    // Set number of questions to 1
    const spinner = screen.getByRole('spinbutton');
    await userEvent.clear(spinner);
    await userEvent.type(spinner, '1');

    await userEvent.click(screen.getByRole("button", { name: /start/i }));
    const aButtons = await screen.findAllByRole("button", { name: "A" });
    await userEvent.click(aButtons[0]);
    await userEvent.click(screen.getByRole("button", { name: /submit/i }));

    interface AttemptItem {
      itemRef: string;
      chosenIndex: number;
      correctIndex: number;
      correct: boolean;
      confidence: string | null;
      ratings: { question: number | null; explanation: number | null; reasons: unknown[] };
    }
    interface AttemptPayload {
      startedAt: number;
      finishedAt: number;
      score: number;
      durationSec: number;
      items: AttemptItem[];
    }
    const saveAttemptMock = saveAttempt as unknown as vi.Mock<[AttemptPayload], string>;
    const calls = saveAttemptMock.mock.calls;
    expect(calls.length).toBe(1);
    const payload: AttemptPayload = calls[0][0];
    expect(typeof payload.startedAt).toBe("number");
    expect(typeof payload.finishedAt).toBe("number");
    expect(typeof payload.score).toBe("number");
    expect(typeof payload.durationSec).toBe("number");
    expect(Array.isArray(payload.items)).toBe(true);
    expect(payload.items.length).toBeGreaterThanOrEqual(1);
    const first = payload.items[0];
    expect(first).toEqual(expect.objectContaining({
      itemRef: expect.any(String),
      chosenIndex: expect.any(Number),
      correctIndex: expect.any(Number),
      correct: expect.any(Boolean),
      confidence: expect.any(String),
      ratings: { question: null, explanation: null, reasons: [] },
    }));
    expect(payload.items.some((it: AttemptItem) => it.itemRef === 'm1' && it.chosenIndex === 0 && it.correct === true)).toBe(true);
  });
});
