import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import WritingPage from "@/app/writing/page";

const rewriteText = vi.fn();
vi.mock("@/lib/api/writing", () => ({
  rewriteText: (...args: unknown[]) => rewriteText(...args),
}));
vi.mock("@/lib/api/projects", () => ({
  listProjects: vi.fn().mockResolvedValue({ items: [], total: 0 }),
}));
vi.mock("@/lib/api/papers", () => ({
  listPapers: vi.fn().mockResolvedValue({ items: [], total: 0 }),
}));
vi.mock("@/lib/api/reviews", () => ({
  generateReview: vi.fn(),
  pollReviewTask: vi.fn(),
}));

describe("WritingPage", () => {
  beforeEach(() => {
    rewriteText.mockReset();
  });

  it("renders two tabs and defaults to Literature Review", async () => {
    render(<WritingPage />);
    expect(
      await screen.findByRole("heading", { name: "Writing Studio" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Literature Review" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Writing Assistant" }),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole("heading", { name: "Literature Review Assistant" }),
    ).toBeInTheDocument();
  });

  it("shows the full Writing Assistant actions in tab 2", () => {
    render(<WritingPage />);
    fireEvent.click(screen.getByRole("button", { name: "Writing Assistant" }));

    expect(screen.getByRole("button", { name: "Polish" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Cover Letter" }),
    ).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText(/Paste the manuscript/i),
    ).toBeInTheDocument();
  });

  it("keeps the Rewrite button disabled until text is entered", () => {
    render(<WritingPage />);
    fireEvent.click(screen.getByRole("button", { name: "Writing Assistant" }));

    const rewriteBtn = screen.getByRole("button", { name: "Rewrite" });
    expect(rewriteBtn).toBeDisabled();

    fireEvent.change(screen.getByPlaceholderText(/Paste the manuscript/i), {
      target: { value: "some draft" },
    });
    expect(rewriteBtn).toBeEnabled();
  });

  it("shows the instruction input only for actions that need it", () => {
    render(<WritingPage />);
    fireEvent.click(screen.getByRole("button", { name: "Writing Assistant" }));

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
    render(<WritingPage />);
    fireEvent.click(screen.getByRole("button", { name: "Writing Assistant" }));

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
    render(<WritingPage />);
    fireEvent.click(screen.getByRole("button", { name: "Writing Assistant" }));

    fireEvent.change(screen.getByPlaceholderText(/Paste the manuscript/i), {
      target: { value: "raw text" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Rewrite" }));

    await waitFor(() =>
      expect(screen.getByText("AI 服务暂时不可用")).toBeInTheDocument(),
    );
  });
});
