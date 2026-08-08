"use client";

import { AssetPanel } from "@/components/canvas/asset-panel";
import { LayersPanel } from "@/components/canvas/layers-panel";
import { MediaPanel } from "@/components/canvas/media-panel";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useEditorUiStore } from "@/store/use-editor-ui-store";

interface EditorSidebarProps {
  projectId: string;
  stageWidth: number;
  stageHeight: number;
}

function SidebarTabs({
  projectId,
  stageWidth,
  stageHeight,
}: EditorSidebarProps) {
  return (
    <Tabs defaultValue="media" className="flex min-h-0 flex-1 flex-col gap-0">
      <TabsList className="m-2 mb-0">
        <TabsTrigger value="media">Media</TabsTrigger>
        <TabsTrigger value="assets">Assets</TabsTrigger>
        <TabsTrigger value="layers">Layers</TabsTrigger>
      </TabsList>
      <TabsContent value="media" className="flex min-h-0 flex-col">
        <MediaPanel
          projectId={projectId}
          stageWidth={stageWidth}
          stageHeight={stageHeight}
        />
      </TabsContent>
      <TabsContent value="assets" className="flex min-h-0 flex-col">
        <AssetPanel
          projectId={projectId}
          stageWidth={stageWidth}
          stageHeight={stageHeight}
        />
      </TabsContent>
      <TabsContent value="layers" className="flex min-h-0 flex-col">
        <LayersPanel projectId={projectId} />
      </TabsContent>
    </Tabs>
  );
}

export function EditorSidebar(props: EditorSidebarProps) {
  const sidebarOpen = useEditorUiStore((s) => s.sidebarOpen);
  const setSidebarOpen = useEditorUiStore((s) => s.setSidebarOpen);

  return (
    <>
      <aside className="hidden w-64 shrink-0 flex-col border-r border-border bg-background lg:flex">
        <SidebarTabs {...props} />
      </aside>

      <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
        <SheetContent side="left" className="w-72 p-0 lg:hidden">
          <SheetHeader className="h-12 justify-center border-b border-border px-4 py-0">
            <SheetTitle className="text-sm">Panels</SheetTitle>
          </SheetHeader>
          <SidebarTabs {...props} />
        </SheetContent>
      </Sheet>
    </>
  );
}
