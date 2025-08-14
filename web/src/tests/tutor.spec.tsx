import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TutorDrawer } from "../components/TutorDrawer";

vi.mock("../lib/api", () => ({
  api: {
    ai: {
      chatExplain: vi.fn().mockResolvedValue({ answerMarkdown: 'I can help with dermatology-related inquiries only. Please ask a dermatology-related question.', citations: [] })
    }
  }
}));

describe("TutorDrawer", () => {
  it("shows refusal for out-of-domain query", async () => {
    render(<TutorDrawer/>);
    await userEvent.click(screen.getByRole('button', { name: /tutor/i }));
    const textarea = await screen.findByPlaceholderText(/ask about this question/i);
    await userEvent.type(textarea, 'What is the capital of France?');
    await userEvent.click(screen.getByRole('button', { name: /ask/i }));
    const refusal = await screen.findByText(/dermatology and STI topics only/i);
    expect(refusal).toBeInTheDocument();
  });
});
