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

  it("renders the Writing Assistant heading and all action buttons", () => {
    render(<AssistantPage />);
    expect(
      screen.getByRole("heading", { name: "Writing Assistant" }),
    ).toBeInTheDocument();
    ["Polish", "Expand", "Shorten", "Translate", "Reviewer Rebuttal", "Cover Letter"].forEach(
      (label) => {
        expect(screen.getByRole("button", { name: label })).toBeInTheDocument();
      },
    );
  });

  it("keeps the Rewrite button disabled until text is entered", () => {
    render(<AssistantPage />);
    const rewriteBtn = screen.getByRole("button", { name: "Rewrite" });
    expect(rewriteBtn).toBeDisabled();

    fireEvent.change(screen.getByPlaceholderText(/Paste the manuscript/i), {
      target: { value: "some draft" },
    });
    expect(rewriteBtn).toBeEnabled();
  });

  it("shows the instruction input only for actions that need it", () => {
    render(<AssistantPage />);

    // Translate -> target language select
    fireEvent.click(screen.getByRole("button", { name: "Translate" }));
    expect(screen.getByRole("combobox")).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: "Select target language..." }),
    ).toBeInTheDocument();

    // Reviewer Rebuttal -> reviewer comments textarea
    fireEvent.click(screen.getByRole("button", { name: "Reviewer Rebuttal" }));
    expect(
      screen.getByPlaceholderText("Paste the reviewer comments here"),
    ).toBeInTheDocument();

    // Polish -> no instruction input
    fireEvent.click(screen.getByRole("button", { name: "Polish" }));
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(
      screen.queryByPlaceholderText("Paste the reviewer comments here"),
    ).not.toBeInTheDocument();
  });

  it("calls rewriteText and renders the result", async () => {
    rewriteText.mockResolvedValue({ action: "polish", text: "polished output" });
    render(<AssistantPage />);

    fireEvent.change(screen.getByPlaceholderText(/Paste the manuscript/i), {
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

    fireEvent.change(screen.getByPlaceholderText(/Paste the manuscript/i), {
      target: { value: "raw text" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Rewrite" }));

    await waitFor(() =>
      expect(screen.getByText("AI 服务暂时不可用")).toBeInTheDocument(),
    );
  });
});
