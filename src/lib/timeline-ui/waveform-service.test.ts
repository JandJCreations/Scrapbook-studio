import { describe, expect, it } from "vitest";

import { createWaveformService } from "@/lib/timeline-ui/waveform-service";

const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

function setup(urls: Record<string, string | null> = { m: "blob:m" }) {
  const loads: Array<{ url: string; resolve: (p: number[]) => void; reject: (e: Error) => void }> = [];
  const service = createWaveformService({
    urlFor: (id) => urls[id] ?? null,
    loadPeaks: (url) =>
      new Promise((resolve, reject) => {
        loads.push({ url, resolve, reject });
      }),
  });
  const notified = { count: 0 };
  service.subscribe(() => {
    notified.count += 1;
  });
  return { service, loads, notified };
}

describe("createWaveformService", () => {
  it("starts one load per media and serves the peaks once they arrive", async () => {
    const { service, loads, notified } = setup();
    expect(service.get("m")).toBeNull();
    expect(service.get("m")).toBeNull();
    expect(loads).toHaveLength(1);
    expect(loads[0].url).toBe("blob:m");

    loads[0].resolve([0.1, 0.9]);
    await flush();
    expect(service.get("m")).toEqual([0.1, 0.9]);
    expect(service.getVersion()).toBe(1);
    expect(notified.count).toBe(1);
    expect(loads).toHaveLength(1);
  });

  it("does not retry a failed media until it is invalidated", async () => {
    const { service, loads } = setup();
    service.get("m");
    loads[0].reject(new Error("cannot decode"));
    await flush();
    expect(service.failed("m")).toBe(true);
    service.get("m");
    expect(loads).toHaveLength(1);
    service.invalidate("m");
    expect(service.failed("m")).toBe(false);
    service.get("m");
    expect(loads).toHaveLength(2);
  });

  it("starts nothing for a media without a URL", () => {
    const { service, loads } = setup({ m: null });
    expect(service.get("m")).toBeNull();
    expect(loads).toHaveLength(0);
  });

  it("ignores a load that finishes after dispose", async () => {
    const { service, loads, notified } = setup();
    service.get("m");
    service.dispose();
    loads[0].resolve([1]);
    await flush();
    expect(notified.count).toBe(0);
    expect(service.get("m")).toBeNull();
  });
});
