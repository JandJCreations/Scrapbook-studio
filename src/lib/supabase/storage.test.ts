import { describe, expect, it } from "vitest";

import { formatMegabytes, safeFileName } from "@/lib/supabase/storage";

describe("safeFileName", () => {
  it("keeps plain names as they are", () => {
    expect(safeFileName("IMG_1234.JPG")).toBe("IMG_1234.JPG");
  });

  it("turns characters Storage refuses into underscores", () => {
    expect(safeFileName("Beach 🌊 #2 (été).mov")).toBe("Beach_2_ete_.mov");
  });

  it("never returns an empty or hidden name", () => {
    expect(safeFileName("🌊🌊")).toBe("file");
    expect(safeFileName(".hidden")).toBe("hidden");
  });
});

describe("formatMegabytes", () => {
  it("rounds big sizes and keeps a decimal for small ones", () => {
    expect(formatMegabytes(78 * 1024 * 1024)).toBe("78 MB");
    expect(formatMegabytes(2.5 * 1024 * 1024)).toBe("2.5 MB");
  });
});
