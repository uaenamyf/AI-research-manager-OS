import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { rewriteText } from "@/lib/api/writing";
import { ApiError } from "@/types";

function mockFetch(response: unknown, { ok = true, status = 200 } = {}) {
  const fn = vi.fn().mockResolvedValue({
    ok,
    status,
    json: async () => response,
    text: async () => JSON.stringify(response),
  } as Response);
  vi.stubGlobal("fetch", fn);
  return fn;
}

describe("rewriteText", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("posts to /api/writing/rewrite with the request body", async () => {
    const fetchMock = mockFetch({
      code: 0,
      message: "ok",
      data: { action: "polish", text: "polished" },
    });

    const result = await rewriteText({ text: "hi", action: "polish" });

    expect(result).toEqual({ action: "polish", text: "polished" });
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("/api/writing/rewrite");
    expect(init.method).toBe("POST");
    expect(init.credentials).toBe("include");
    expect(JSON.parse(init.body as string)).toEqual({
      text: "hi",
      action: "polish",
    });
  });

  it("forwards the instruction field when provided", async () => {
    const fetchMock = mockFetch({
      code: 0,
      message: "ok",
      data: { action: "translate", text: "你好" },
    });

    await rewriteText({ text: "hello", action: "translate", instruction: "Chinese" });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.instruction).toBe("Chinese");
  });

  it("throws ApiError on non-2xx HTTP response", async () => {
    mockFetch("boom", { ok: false, status: 500 });
    await expect(
      rewriteText({ text: "hi", action: "polish" }),
    ).rejects.toBeInstanceOf(ApiError);
  });

  it("throws ApiError when business code is non-zero", async () => {
    mockFetch({ code: 4001, message: "AI 服务暂时不可用", data: null });
    await expect(
      rewriteText({ text: "hi", action: "polish" }),
    ).rejects.toMatchObject({ status: 4001 });
  });
});
