// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

import { reportClientError, resetClientErrorReportsForTests } from "@/lib/client-error-report";
import { POST } from "@/app/api/client-error/route";

afterEach(() => {
  resetClientErrorReportsForTests();
  vi.restoreAllMocks();
});

describe("reportClientError", () => {
  it("sends each failure once, with the page path but not the query string", () => {
    const beacon = vi.fn(() => true);
    Object.defineProperty(navigator, "sendBeacon", { value: beacon, configurable: true });
    window.history.replaceState(null, "", "/editor/abc?token=secret");

    reportClientError(new Error("boom"), "error");
    reportClientError(new Error("boom"), "error");

    expect(beacon).toHaveBeenCalledTimes(1);
    const blob = (beacon.mock.calls[0] as unknown as [string, Blob])[1];
    return blob.text().then((text) => {
      const body = JSON.parse(text);
      expect(body).toMatchObject({ message: "boom", kind: "error", page: "/editor/abc" });
    });
  });
});

describe("POST /api/client-error", () => {
  it("logs the report and answers 204", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await POST(
      new Request("http://x/api/client-error", {
        method: "POST",
        headers: { "user-agent": "iPhone Safari" },
        body: JSON.stringify({ message: "boom", kind: "error", page: "/editor/1" }),
      }),
    );
    expect(response.status).toBe(204);
    expect(log.mock.calls[0][1]).toContain("iPhone Safari");
  });

  it("rejects a body that isn't JSON", async () => {
    const response = await POST(new Request("http://x", { method: "POST", body: "nope" }));
    expect(response.status).toBe(400);
  });
});
