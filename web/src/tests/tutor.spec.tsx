import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "./utils";
import { TutorDrawer } from "../components/TutorDrawer";

vi.mock("../lib/api", () => ({
  api: {
    ai: {
      tutorQuery: vi.fn().mockResolvedValue({
        answerMarkdown: 'out-of-scope',
        citations: [],
        domain: 'out-of-scope'
      })
    }
  }
}));

describe("TutorDrawer", () => {
  it("shows refusal for out-of-domain query", async () => {
    renderWithProviders(<TutorDrawer/>);
    await userEvent.click(screen.getByRole('button', { name: /tutor/i }));
    const textarea = await screen.findByPlaceholderText(/ask about this question/i);
    await userEvent.type(textarea, 'What is the capital of France?');
    await userEvent.click(screen.getByRole('button', { name: /ask/i }));
    const refusal = await screen.findByText(/dermatology\/STI topics only/i);
    expect(refusal).toBeInTheDocument();
  });
});
