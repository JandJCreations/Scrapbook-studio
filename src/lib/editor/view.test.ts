import { describe, expect, it } from "vitest";

import { DEFAULT_VIEW, MAX_ZOOM, MIN_ZOOM, panBy, viewFit, zoomAt, zoomTo } from "@/lib/editor/view";

// A 1000x500 stage showing a 1000x500 frame: the fit is 1:1 and centred.
const geo = { width: 1000, height: 500, frameWidth: 1000, frameHeight: 500 };

describe("viewFit", () => {
  it("is the plain fit at the default view", () => {
    expect(viewFit(geo, DEFAULT_VIEW)).toEqual({ scale: 1, x: 0, y: 0 });
    expect(viewFit({ ...geo, frameWidth: 500 }, DEFAULT_VIEW)).toEqual({ scale: 1, x: 250, y: 0 });
  });

  it("zooms about the centre of the stage", () => {
    const fit = viewFit(geo, { zoom: 2, panX: 0, panY: 0 });
    expect(fit.scale).toBe(2);
    // The frame's centre is still the stage's centre.
    expect(fit.x + (1000 * 2) / 2).toBe(500);
    expect(fit.y + (500 * 2) / 2).toBe(250);
  });

  it("moves by the pan", () => {
    expect(viewFit(geo, { zoom: 2, panX: 30, panY: -10 })).toEqual({ scale: 2, x: -500 + 30, y: -250 - 10 });
  });
});

describe("zoomAt", () => {
  it("keeps the frame point under the cursor where it was", () => {
    const view = zoomAt(geo, DEFAULT_VIEW, 2, { x: 800, y: 100 });
    const before = viewFit(geo, DEFAULT_VIEW);
    const after = viewFit(geo, view);
    const frameX = (800 - before.x) / before.scale;
    const frameY = (100 - before.y) / before.scale;
    expect(after.x + frameX * after.scale).toBeCloseTo(800);
    expect(after.y + frameY * after.scale).toBeCloseTo(100);
  });

  it("stays within the zoom limits", () => {
    expect(zoomAt(geo, DEFAULT_VIEW, 1000, { x: 0, y: 0 }).zoom).toBe(MAX_ZOOM);
    expect(zoomAt(geo, DEFAULT_VIEW, 0.0001, { x: 0, y: 0 }).zoom).toBe(MIN_ZOOM);
  });
});

describe("zoomTo", () => {
  it("zooms about the centre", () => {
    expect(zoomTo(geo, { zoom: 1, panX: 40, panY: 0 }, 2)).toMatchObject({ zoom: 2 });
  });

  it("returns exactly to the default view at fit", () => {
    expect(zoomTo(geo, { zoom: 3, panX: 200, panY: 50 }, 1)).toEqual(DEFAULT_VIEW);
  });
});

describe("panBy", () => {
  it("moves the view", () => {
    expect(panBy(geo, { zoom: 2, panX: 0, panY: 0 }, 25, -5)).toMatchObject({ panX: 25, panY: -5 });
  });

  it("never lets the frame leave the stage", () => {
    const far = panBy(geo, { zoom: 2, panX: 0, panY: 0 }, 1e6, -1e6);
    const fit = viewFit(geo, far);
    expect(fit.x).toBeLessThan(geo.width); // still overlapping on the right
    expect(fit.y + geo.frameHeight * fit.scale).toBeGreaterThan(0);
  });

  it("does nothing at the default zoom", () => {
    expect(panBy(geo, DEFAULT_VIEW, 100, 100)).toEqual(DEFAULT_VIEW);
  });
});
