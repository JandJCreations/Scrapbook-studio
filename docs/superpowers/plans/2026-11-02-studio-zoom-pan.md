# Studio zoom and pan (slice 9)

**Goal:** the stage can be zoomed (buttons, ctrl/pinch wheel, two-finger pinch) and panned (plain wheel when zoomed, middle-mouse drag, two-finger drag, Space+drag), returning the feature the cutover dropped. The painter, the hit/transform layer and the text editor all share one view.

**Design:** `src/lib/editor/view.ts` (pure): `ViewState {zoom, panX, panY}`, `viewFit(geometry, view)` composes the existing fit with zoom about the frame centre plus pan; `zoomAt` keeps the point under the cursor fixed; pan is clamped so the frame never leaves the stage entirely. `src/store/use-stage-view-store.ts` holds the view; the painter gets `setView`, StageInteraction/TextEdit use `viewFit`. Export and thumbnails are unaffected (capture resets the stage to identity and own painters never get a view).

**Out of scope:** persistence of the view, minimap.

**Review focus:** capture/export unaffected by zoom; hit testing matches the drawn picture at every zoom; gestures do not fight clip drags or the text editor; wheel `preventDefault` only when handled; view resets when the project changes.

Tasks: 1 pure view + tests; 2 store + painter `setView` + playback wiring; 3 stage interaction/overlay on `viewFit`, zoom controls, gestures, tests; 4 browser verification, checks, review, finish.
