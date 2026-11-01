"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { Clapperboard, Image as ImageIcon } from "lucide-react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FRAME_PRESETS, DEFAULT_FRAME_PRESET } from "@/lib/export/frame-presets";
import { createClient } from "@/lib/supabase/client";
import { saveProjectFrameChecked } from "@/lib/sync/project-frame";
import { createSupabaseTimelineStorage } from "@/lib/sync/supabase-timeline-storage";
import { TEMPLATE_CATALOG } from "@/lib/templates/template-catalog";
import { writeTemplateProject } from "@/lib/templates/write-template-project";
import { useDashboardUiStore } from "@/store/use-dashboard-ui-store";
import { useProjectStore } from "@/store/use-project-store";
import { useSettingsStore } from "@/store/use-settings-store";
import { cn } from "@/lib/utils";

const VIDEO_COLLAGE_TEMPLATE_ID = "photo-video-mix";

type ProjectFormat = "scrapbook" | "video-collage";

const formSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Give your project a name")
    .max(80, "Keep it under 80 characters"),
});

type FormValues = z.infer<typeof formSchema>;

export function NewProjectDialog({
  children,
}: {
  children: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(false);
  const [format, setFormat] = React.useState<ProjectFormat>("scrapbook");
  const createProject = useProjectStore((s) => s.createProject);
  const defaultFramePresetId = useSettingsStore((s) => s.defaultFramePresetId);
  const fetchSettings = useSettingsStore((s) => s.fetchSettings);
  const activeFolderId = useDashboardUiStore((s) => s.activeFolderId);
  const router = useRouter();

  React.useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { name: "" },
  });

  async function onSubmit(values: FormValues) {
    try {
      const project = await createProject(values.name, activeFolderId);
      const client = createClient();
      const saveFrame = (frame: { width: number; height: number }) =>
        saveProjectFrameChecked(client, project.id, frame);

      try {
        if (format === "video-collage") {
          const template = TEMPLATE_CATALOG.find((t) => t.id === VIDEO_COLLAGE_TEMPLATE_ID);
          if (template) {
            await writeTemplateProject({
              storage: createSupabaseTimelineStorage(client),
              saveFrame,
              template,
              projectId: project.id,
            });
          }
        } else {
          const preset =
            FRAME_PRESETS.find((p) => p.id === defaultFramePresetId) ?? DEFAULT_FRAME_PRESET;
          await saveFrame({ width: preset.width, height: preset.height });
        }
      } catch (error) {
        // The project exists and opens fine, just without its starting content.
        toast.error(
          error instanceof Error
            ? `"${project.name}" was created, but its starting layout could not be saved: ${error.message}`
            : `"${project.name}" was created, but its starting layout could not be saved.`,
        );
        reset();
        setFormat("scrapbook");
        setOpen(false);
        router.push(`/editor/${project.id}`);
        return;
      }

      toast.success(`"${project.name}" created`);
      reset();
      setFormat("scrapbook");
      setOpen(false);
      router.push(`/editor/${project.id}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to create project");
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          reset();
          setFormat("scrapbook");
        }
      }}
    >
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <form onSubmit={handleSubmit(onSubmit)}>
          <DialogHeader>
            <DialogTitle>
              {format === "video-collage" ? "New video collage" : "New scrapbook"}
            </DialogTitle>
            <DialogDescription>
              Pick a format and give your project a name. You can rename it anytime.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>Format</Label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setFormat("scrapbook")}
                  aria-pressed={format === "scrapbook"}
                  className={cn(
                    "flex flex-col items-start gap-1 rounded-lg border p-3 text-left transition-colors",
                    format === "scrapbook"
                      ? "border-primary bg-primary/5"
                      : "border-border hover:bg-accent",
                  )}
                >
                  <ImageIcon className="size-4 text-primary" />
                  <span className="text-sm font-medium">Scrapbook</span>
                  <span className="text-xs text-muted-foreground">
                    A photo &amp; text page
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setFormat("video-collage")}
                  aria-pressed={format === "video-collage"}
                  className={cn(
                    "flex flex-col items-start gap-1 rounded-lg border p-3 text-left transition-colors",
                    format === "video-collage"
                      ? "border-primary bg-primary/5"
                      : "border-border hover:bg-accent",
                  )}
                >
                  <Clapperboard className="size-4 text-primary" />
                  <span className="text-sm font-medium">Video Collage</span>
                  <span className="text-xs text-muted-foreground">
                    Mix photos &amp; clips
                  </span>
                </button>
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="project-name">Project name</Label>
              <Input
                id="project-name"
                placeholder="e.g. Summer Road Trip 2026"
                autoFocus
                {...register("name")}
              />
              {errors.name && (
                <p className="text-sm text-destructive">
                  {errors.name.message}
                </p>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {format === "video-collage" ? "Create collage" : "Create scrapbook"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
