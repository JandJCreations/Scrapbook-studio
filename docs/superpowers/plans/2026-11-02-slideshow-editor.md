# Slideshow editor (slice 12)

**Intent (user, verbatim):** "i dont want it to be on a canvas. i want it to just be a video that plays through the pics and vids with whatever music i choose" ... "like capcut". Chosen: slideshow maker; delete the canvas tools.

**Builder's calls (user opted out of questions):**
- Layout like CapCut: toolbar on top; left panel with **Media** and **Audio** tabs; centre **plain video preview** (nothing on it is draggable); right **Details** panel for the selected clip; under the preview a transport row; under that the timeline with a **tool row** (Split, Duplicate, Delete). On a phone the left panel and details open from buttons as a bottom sheet.
- Everything added goes on the one main strip (photos/videos back to back) or the music track. No overlays, stickers, text boxes, templates, zoom/pan, grid, groups, keyframes, crop, layers.
- Kept underneath: the timeline project format, save/history, playback, export, thumbnails, the clip timeline (reorder, trim, split), music library, filters/speed/volume/fades in Details.
- Old projects with overlay clips still open and play (rendering is untouched); there is just no UI to make new ones.
- Frame size stays (16:9, 9:16, 1:1) because a video needs an aspect ratio.
- Deferred: transitions between slides (needs engine work), auto-beat-sync.

**Safety:** all on branch `feature/slideshow-editor`; deletions are git deletions. No database change is run; templates on the dashboard go away from the UI only.
