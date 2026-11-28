import { describe, expect, it } from "vitest";

import { filesFromDrop, pickedFolderName, sortByPath } from "@/lib/media/drop-files";

type Entry = FileSystemEntry;
const fileEntry = (name: string): Entry =>
  ({ name, isFile: true, isDirectory: false, file: (ok: (f: File) => void) => ok(new File(["x"], name)) }) as unknown as Entry;
/** A folder whose reader hands its children over two at a time, as browsers do in batches. */
const folderEntry = (name: string, children: Entry[]): Entry =>
  ({
    name,
    isFile: false,
    isDirectory: true,
    createReader: () => {
      let at = 0;
      return {
        readEntries: (ok: (batch: Entry[]) => void) => {
          ok(children.slice(at, at + 2));
          at += 2;
        },
      };
    },
  }) as unknown as Entry;
const drop = (entries: Entry[]) =>
  ({
    items: entries.map((entry) => ({ kind: "file", webkitGetAsEntry: () => entry })),
    files: [],
    types: ["Files"],
  }) as unknown as DataTransfer;

describe("filesFromDrop", () => {
  it("opens a dropped album folder, subfolders too, in name order", async () => {
    const album = folderEntry("Beach trip", [
      fileEntry("IMG_10.jpg"),
      fileEntry("IMG_2.jpg"),
      folderEntry("Videos", [fileEntry("clip.mov")]),
      fileEntry("IMG_1.jpg"),
    ]);
    const { files, folderName } = await filesFromDrop(drop([album]));
    expect(files.map((f) => f.name)).toEqual(["IMG_1.jpg", "IMG_2.jpg", "IMG_10.jpg", "clip.mov"]);
    expect(folderName).toBe("Beach trip");
  });

  it("names no album when loose files are dropped", async () => {
    const { files, folderName } = await filesFromDrop(drop([fileEntry("a.jpg"), fileEntry("b.jpg")]));
    expect(files).toHaveLength(2);
    expect(folderName).toBeNull();
  });
});

describe("folder picker helpers", () => {
  const picked = (path: string) => {
    const f = new File(["x"], path.split("/").pop()!);
    Object.defineProperty(f, "webkitRelativePath", { value: path });
    return f;
  };

  it("finds the album's name and keeps its photos in order", () => {
    const files = [picked("Wedding/IMG_10.jpg"), picked("Wedding/IMG_9.jpg")];
    expect(pickedFolderName(files)).toBe("Wedding");
    expect(sortByPath(files).map((f) => f.name)).toEqual(["IMG_9.jpg", "IMG_10.jpg"]);
  });
});
