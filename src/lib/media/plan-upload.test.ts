import { describe, expect, it } from "vitest";

import { describeSkipped, formatSpace, planUpload } from "@/lib/media/plan-upload";

const MB = 1024 * 1024;
/** A file that says it is `mb` big without holding that much. */
const file = (name: string, type: string, mb = 1) => {
  const f = new File(["x"], name, { type });
  Object.defineProperty(f, "size", { value: mb * MB });
  return f;
};

describe("planUpload", () => {
  it("takes every photo, video and song when there is room", () => {
    const files = [file("a.jpg", "image/jpeg"), file("b.mov", "video/quicktime"), file("c.m4a", "audio/mp4")];
    const plan = planUpload(files, { usedBytes: 0 });
    expect(plan.accepted).toEqual(files);
    expect(describeSkipped(plan)).toBeNull();
  });

  it("leaves out what a folder carries along that isn't media", () => {
    const plan = planUpload(
      [file("IMG_1.JPG", ""), file(".DS_Store", ""), file("._IMG_1.JPG", ""), file("Thumbs.db", ""), file("notes.txt", "text/plain"), file("IMG_1.AAE", "")],
      { usedBytes: 0 },
    );
    expect(plan.accepted.map((f) => f.name)).toEqual(["IMG_1.JPG"]);
    expect(plan.notMedia).toBe(5);
    expect(describeSkipped(plan)).toBe("Adding 1 file. Skipped 5 files that aren't photos, videos or songs.");
  });

  it("takes the first ones up to the most one pick can hold, instead of refusing the lot", () => {
    const files = Array.from({ length: 7 }, (_, i) => file(`${i}.jpg`, "image/jpeg"));
    const plan = planUpload(files, { usedBytes: 0, maxFiles: 5 });
    expect(plan.accepted).toEqual(files.slice(0, 5));
    expect(plan.overCount).toBe(2);
    expect(describeSkipped(plan)).toMatch(/^Adding 5 files\. Skipped 2 files past the \d+ you can add at once/);
  });

  it("stops short of the storage space, still fitting smaller files after a big one", () => {
    const plan = planUpload(
      [file("a.jpg", "image/jpeg", 6), file("big.jpg", "image/jpeg", 8), file("b.jpg", "image/jpeg", 3)],
      { usedBytes: 0, limitBytes: 10 * MB },
    );
    expect(plan.accepted.map((f) => f.name)).toEqual(["a.jpg", "b.jpg"]);
    expect(plan.overSpace).toBe(1);
    expect(describeSkipped(plan, 10 * MB)).toBe("Adding 2 files. Skipped 1 file that won't fit in your 10 MB of storage.");
  });

  it("counts a long video at the size it is shrunk to", () => {
    // Over the 50 MB per-file limit, a video is re-encoded to fit it before saving.
    const plan = planUpload([file("long.mov", "video/quicktime", 400)], { usedBytes: 0, limitBytes: 60 * MB });
    expect(plan.accepted).toHaveLength(1);
  });

  it("skips the space check while the library's size isn't known", () => {
    const plan = planUpload([file("a.jpg", "image/jpeg", 5)], { usedBytes: null, limitBytes: 1 * MB });
    expect(plan.accepted).toHaveLength(1);
  });

  it("says plainly when nothing could be added", () => {
    const plan = planUpload([file("a.jpg", "image/jpeg", 5)], { usedBytes: 9 * MB, limitBytes: 10 * MB });
    expect(describeSkipped(plan, 10 * MB)).toBe("Nothing was added. Skipped 1 file that won't fit in your 10 MB of storage.");
  });
});

describe("formatSpace", () => {
  it("shows a whole plan in GB", () => {
    expect(formatSpace(1024 * MB)).toBe("1 GB");
    expect(formatSpace(100 * 1024 * MB)).toBe("100 GB");
    expect(formatSpace(500 * MB)).toBe("500 MB");
  });
});
