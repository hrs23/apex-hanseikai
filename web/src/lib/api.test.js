import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, api } from "./api";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("api", () => {
  it("keeps server validation details on failed requests", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: "invalid hansei", details: ["Invalid recording."] }),
    });

    await expect(api("/api/hansei")).rejects.toMatchObject({
      name: "ApiError",
      message: "invalid hansei",
      status: 400,
      details: ["Invalid recording."],
    });
    await expect(api("/api/hansei")).rejects.toBeInstanceOf(ApiError);
  });
});
