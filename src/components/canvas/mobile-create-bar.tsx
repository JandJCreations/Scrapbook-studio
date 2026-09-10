"use client";

import { Download, ImagePlus, Music, Type } from "lucide-react";

import { useAddText } from "@/hooks/use-add-text";
import { useEditorUiStore } from "@/store/use-editor-ui-store";

interface MobileCreateBarProps {
  projectId: string;
  stageWidth: number;
  stageHeight: number;
}

/**
 * The mobile equivalent of the desktop toolbar's Add text/Export buttons
 * (which hide on mobile — see canvas-toolbar.tsx), styled after CapCut/
 * iMovie's bottom row of large labeled icons for the primary creation
 * actions, rather than the small icon-only controls a top bar has room for.
 * Sits in normal document flow between the canvas and the timeline panel,
 * not fixed/floating, so it can never overlap either one.
 */
export function MobileCreateBar({ projectId, stageWidth, stageHeight }: MobileCreateBarProps) {
  const setSidebarOpen = useEditorUiStore((s) => s.setSidebarOpen);
  const setExportOpen = useEditorUiStore((s) => s.setExportOpen);
  const timelineCollapsed = useEditorUiStore((s) => s.timelineCollapsed);
  const setTimelineCollapsed = useEditorUiStore((s) => s.setTimelineCollapsed);
  const addText = useAddText({ projectId, stageWidth, stageHeight });

  const items = [
    {
      key: "media",
      label: "Media",
      icon: ImagePlus,
      tour: "panels-button",
      onClick: () => setSidebarOpen(true),
    },
    {
      key: "text",
      label: "Text",
      icon: Type,
      tour: "add-text-button-mobile",
      onClick: addText,
    },
    {
      key: "audio",
      label: "Audio",
      icon: Music,
      // No tour target here — the real "+ Add audio track" button in the
      // timeline is already always visible regardless of mobile/desktop or
      // collapsed state, so that step points straight at it. This button is
      // just a shortcut to reveal it if the timeline happens to be collapsed.
      tour: undefined,
      onClick: () => {
        if (timelineCollapsed) setTimelineCollapsed(false);
      },
    },
    {
      key: "export",
      label: "Export",
      icon: Download,
      tour: "export-button-mobile",
      onClick: () => setExportOpen(true),
    },
  ];

  return (
    <nav className="flex shrink-0 items-stretch justify-around border-t border-border bg-background lg:hidden">
      {items.map((item) => (
        <button
          key={item.key}
          type="button"
          data-tour={item.tour}
          onClick={item.onClick}
          className="flex flex-1 flex-col items-center gap-1 py-2 text-muted-foreground transition-colors active:bg-accent active:text-accent-foreground"
        >
          <item.icon className="size-5" />
          <span className="text-[11px] font-medium">{item.label}</span>
        </button>
      ))}
    </nav>
  );
}
