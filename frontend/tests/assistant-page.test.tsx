import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import AssistantPage from "@/app/assistant/page";

const rewriteText = vi.fn();
vi.mock("@/lib/api/writing", () => ({
  rewriteText: (...args: unknown[]) => rewriteText(...args),
}));

describe("AssistantPage", () => {
  beforeEach(() => {
    rewriteText.mockReset();
  });

  it("renders the action buttons and text area", () => {
    render(<AssistantPage />);
    expect(screen.getByRole("heading", { name: "Writing Assistant" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Polish" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cover Letter" })).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Paste your draft/i)).toBeInTheDocument();
  });

  it("keeps the Rewrite button disabled until text is entered", () => {
    render(<AssistantPage />);
    const rewriteBtn = screen.getByRole("button", { name: "Rewrite" });
    expect(rewriteBtn).toBeDisabled();

    fireEvent.change(screen.getByPlaceholderText(/Paste your draft/i), {
      target: { value: "some draft" },
    });
    expect(rewriteBtn).toBeEnabled();
  });

  it("shows the instruction input only for actions that need it", () => {
    render(<AssistantPage />);
    expect(
      screen.queryByPlaceholderText("Target language, e.g. Chinese"),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Translate" }));
    expect(
      screen.getByPlaceholderText("Target language, e.g. Chinese"),
    ).toBeInTheDocument();
  });

  it("calls rewriteText and renders the result", async () => {
    rewriteText.mockResolvedValue({ action: "polish", text: "polished output" });
    render(<AssistantPage />);

    fireEvent.change(screen.getByPlaceholderText(/Paste your draft/i), {
      target: { value: "raw text" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Rewrite" }));

    await waitFor(() =>
      expect(screen.getByText("polished output")).toBeInTheDocument(),
    );
    expect(rewriteText).toHaveBeenCalledWith({
      text: "raw text",
      action: "polish",
      instruction: "",
    });
  });

  it("renders an error message when the api call fails", async () => {
    rewriteText.mockRejectedValue(new Error("AI 服务暂时不可用"));
    render(<AssistantPage />);

    fireEvent.change(screen.getByPlaceholderText(/Paste your draft/i), {
      target: { value: "raw text" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Rewrite" }));

    await waitFor(() =>
      expect(screen.getByText("AI 服务暂时不可用")).toBeInTheDocument(),
    );
  });
});
