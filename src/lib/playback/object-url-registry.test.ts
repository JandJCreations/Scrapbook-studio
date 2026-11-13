import { describe, expect, it } from "vitest";

import { createObjectUrlRegistry } from "@/lib/playback/object-url-registry";

function setup() {
  const created: string[] = [];
  const revoked: string[] = [];
  const registry = createObjectUrlRegistry({
    create: () => {
      const url = `blob:${created.length + 1}`;
      created.push(url);
      return url;
    },
    revoke: (url) => {
      revoked.push(url);
    },
  });
  return { registry, created, revoked };
}

describe("createObjectUrlRegistry", () => {
  it("creates a URL for a blob and returns it by media id", () => {
    const { registry } = setup();
    const url = registry.addBlob("m1", new Blob(["x"]));
    expect(url).toBe("blob:1");
    expect(registry.urlFor("m1")).toBe("blob:1");
    expect(registry.urlFor("nope")).toBeNull();
  });

  it("revokes a URL when its media is removed or replaced", () => {
    const { registry, revoked } = setup();
    registry.addBlob("m1", new Blob(["x"]));
    registry.addBlob("m1", new Blob(["y"]));
    expect(revoked).toEqual(["blob:1"]);
    registry.remove("m1");
    expect(revoked).toEqual(["blob:1", "blob:2"]);
    expect(registry.urlFor("m1")).toBeNull();
  });

  it("never revokes a remote URL it did not create", () => {
    const { registry, revoked } = setup();
    registry.addUrl("r1", "https://example.com/a.mp4");
    expect(registry.urlFor("r1")).toBe("https://example.com/a.mp4");
    registry.remove("r1");
    registry.addUrl("r2", "https://example.com/b.mp4");
    registry.revokeAll();
    expect(revoked).toEqual([]);
  });

  it("revokes every owned URL and forgets everything", () => {
    const { registry, revoked } = setup();
    registry.addBlob("a", new Blob(["1"]));
    registry.addBlob("b", new Blob(["2"]));
    registry.addUrl("r", "https://example.com/c.mp4");
    registry.revokeAll();
    expect(revoked.sort()).toEqual(["blob:1", "blob:2"]);
    expect(registry.urlFor("a")).toBeNull();
    expect(registry.urlFor("r")).toBeNull();
  });
});
