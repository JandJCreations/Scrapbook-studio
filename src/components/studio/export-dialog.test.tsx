// @vitest-environment jsdom
import "@/test/dom-setup";

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ExportDialog } from "@/components/studio/export-dialog";
import type { StudioExportOptions, StudioExportResult } from "@/lib/export/studio-export";
import { makeClip, makeProject, makeStandardTracks } from "@/lib/timeline/test-utils";

const frame = { width: 1920, height: 1080 };
const project = makeProject(makeStandardTracks(), [makeClip({ id: "a", trackId: "t1" })]);

beforeEach(() => {
  URL.createObjectURL = vi.fn(() => "blob:fake");
  URL.revokeObjectURL = vi.fn();
  HTMLAnchorElement.prototype.click = vi.fn();
});

function setup(exporter: (o: StudioExportOptions) => Promise<StudioExportResult>, overrides = {}) {
  render(
    <ExportDialog
      open
      onOpenChange={vi.fn()}
      projectName="My trip"
      project={project}
      frame={frame}
      urlFor={() => null}
      playhead={2}
      exporter={exporter}
      {...overrides}
    />,
  );
}

const done = async (): Promise<StudioExportResult> => ({ blob: new Blob(["x"]), extension: "png" });

describe("ExportDialog", () => {
  it("offers the formats in two groups", () => {
    setup(done);
    for (const name of ["PNG", "JPG", "PDF", "GIF", "MP4", "MOV", "WebM"]) {
      expect(screen.getByRole("radio", { name })).toBeTruthy();
    }
  });

  it("exports the chosen format at the chosen size and saves the file under the project name", async () => {
    const exporter = vi.fn<(o: StudioExportOptions) => Promise<StudioExportResult>>(done);
    setup(exporter);
    fireEvent.click(screen.getByRole("radio", { name: "PNG" }));
    fireEvent.change(screen.getByLabelText("Resolution"), { target: { value: "720p" } });
    fireEvent.click(screen.getByRole("button", { name: "Export" }));
    await waitFor(() => expect(exporter).toHaveBeenCalledTimes(1));
    const options = exporter.mock.calls[0][0];
    expect(options).toMatchObject({ format: "png", targetWidth: 1280, playhead: 2, transparent: false, frame });
    await screen.findByText(/saved/i);
    expect(URL.createObjectURL).toHaveBeenCalled();
    expect(HTMLAnchorElement.prototype.click).toHaveBeenCalled();
  });

  it("shows the frame rate only for moving pictures and transparency only where it works", () => {
    setup(done);
    fireEvent.click(screen.getByRole("radio", { name: "PNG" }));
    expect(screen.queryByLabelText("Frame rate")).toBeNull();
    expect(screen.getByRole("switch", { name: "Transparent background" })).toBeTruthy();
    fireEvent.click(screen.getByRole("radio", { name: "MP4" }));
    expect(screen.getByLabelText("Frame rate")).toBeTruthy();
    expect(screen.queryByRole("switch", { name: "Transparent background" })).toBeNull();
    fireEvent.click(screen.getByRole("radio", { name: "WebM" }));
    expect(screen.getByRole("switch", { name: "Transparent background" })).toBeTruthy();
  });

  it("passes the frame rate and transparency along", async () => {
    const exporter = vi.fn<(o: StudioExportOptions) => Promise<StudioExportResult>>(async () => ({
      blob: new Blob(["x"]),
      extension: "webm",
    }));
    setup(exporter);
    fireEvent.click(screen.getByRole("radio", { name: "WebM" }));
    fireEvent.change(screen.getByLabelText("Frame rate"), { target: { value: "60" } });
    fireEvent.click(screen.getByRole("switch", { name: "Transparent background" }));
    fireEvent.click(screen.getByRole("button", { name: "Export" }));
    await waitFor(() => expect(exporter).toHaveBeenCalled());
    expect(exporter.mock.calls[0][0]).toMatchObject({ format: "webm", fps: 60, transparent: true });
  });

  it("warns about empty slots that will be left out", () => {
    const withSlots = makeProject(makeStandardTracks(), [
      makeClip({ id: "s1", trackId: "t2", kind: "image", sourceDuration: null, isPlaceholder: true }),
      makeClip({ id: "s2", trackId: "t2", kind: "image", sourceDuration: null, isPlaceholder: true }),
    ]);
    setup(done, { project: withSlots });
    expect(screen.getByText(/2 empty slots will be left out/i)).toBeTruthy();
  });

  it("shows progress while exporting, and cancelling stops it without an error", async () => {
    let aborted = false;
    const exporter = vi.fn(
      (o: StudioExportOptions) =>
        new Promise<StudioExportResult>((_resolve, reject) => {
          o.onProgress("rendering", 0.5);
          o.signal?.addEventListener("abort", () => {
            aborted = true;
            reject(new DOMException("Export cancelled", "AbortError"));
          });
        }),
    );
    setup(exporter);
    fireEvent.click(screen.getByRole("button", { name: "Export" }));
    expect(await screen.findByText(/rendering frames/i)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Cancel export" }));
    await waitFor(() => expect(aborted).toBe(true));
    await waitFor(() => expect(screen.getByRole("button", { name: "Export" })).toBeTruthy());
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("returns to normal when a cancel arrives too late to stop the export", async () => {
    let finish: (r: StudioExportResult) => void = () => {};
    const exporter = vi.fn(
      () =>
        new Promise<StudioExportResult>((resolve) => {
          finish = resolve;
        }),
    );
    setup(exporter);
    fireEvent.click(screen.getByRole("button", { name: "Export" }));
    fireEvent.click(await screen.findByRole("button", { name: "Cancel export" }));
    finish({ blob: new Blob(["x"]), extension: "mp4" });
    expect(await screen.findByRole("button", { name: "Export" })).toBeTruthy();
    expect(screen.queryByText(/saved as/i)).toBeNull();
    expect(HTMLAnchorElement.prototype.click).not.toHaveBeenCalled();
  });

  it("will not start an export too big for the encoder, and says how to fix it", () => {
    setup(done);
    fireEvent.change(screen.getByLabelText("Resolution"), { target: { value: "4k" } });
    fireEvent.change(screen.getByLabelText("Frame rate"), { target: { value: "60" } });
    expect((screen.getByRole("button", { name: "Export" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/too long|too big|too large/i)).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Resolution"), { target: { value: "720p" } });
    fireEvent.change(screen.getByLabelText("Frame rate"), { target: { value: "15" } });
    expect((screen.getByRole("button", { name: "Export" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("tells the user when the export fails, and lets them try again", async () => {
    setup(async () => {
      throw new Error("The video could not be loaded.");
    });
    fireEvent.click(screen.getByRole("button", { name: "Export" }));
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByText(/could not be loaded/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Export" })).toBeTruthy();
  });
});
