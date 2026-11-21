"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
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
import { useDashboardUiStore } from "@/store/use-dashboard-ui-store";
import { useProjectStore } from "@/store/use-project-store";
import { useSettingsStore } from "@/store/use-settings-store";

// A name is optional: a blank one becomes "My video, <today>", so the first video is one tap away.
const formSchema = z.object({
  name: z.string().trim().max(80, "Keep it under 80 characters"),
});

/** The name a video gets when none is typed, e.g. "My video, Nov 21". */
export function defaultVideoName(now = new Date()): string {
  return `My video, ${now.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
}

// The shapes, named by where people share them rather than by their ratio.
const SHAPE_CHOICES = [
  { id: "landscape", label: "Wide", hint: "YouTube, TV, computer" },
  { id: "portrait", label: "Tall", hint: "Reels, TikTok, Stories" },
  { id: "square", label: "Square", hint: "Instagram, Facebook posts" },
] as const;

type FormValues = z.infer<typeof formSchema>;

/** Starts a new, empty video project and opens it in the editor. */
export function NewProjectDialog({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  const createProject = useProjectStore((s) => s.createProject);
  const defaultFramePresetId = useSettingsStore((s) => s.defaultFramePresetId);
  const fetchSettings = useSettingsStore((s) => s.fetchSettings);
  const activeFolderId = useDashboardUiStore((s) => s.activeFolderId);
  const router = useRouter();
  // Starts on the shape from Settings; a pick here is for this video only.
  const [pickedShape, setPickedShape] = React.useState<string | null>(null);
  const shapeId = pickedShape ?? defaultFramePresetId;

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
      const project = await createProject(values.name || defaultVideoName(), activeFolderId);
      try {
        const preset = FRAME_PRESETS.find((p) => p.id === shapeId) ?? DEFAULT_FRAME_PRESET;
        await saveProjectFrameChecked(createClient(), project.id, { width: preset.width, height: preset.height });
        toast.success(`"${project.name}" created`);
      } catch (error) {
        // The project exists and opens fine, just with the editor's default shape.
        toast.error(
          error instanceof Error
            ? `"${project.name}" was created, but its video size could not be saved: ${error.message}`
            : `"${project.name}" was created, but its video size could not be saved.`,
        );
      }
      reset();
      setPickedShape(null);
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
          setPickedShape(null);
        }
      }}
    >
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <form onSubmit={handleSubmit(onSubmit)}>
          <DialogHeader>
            <DialogTitle>New video</DialogTitle>
            <DialogDescription>
              Pick a shape, then choose your photos and clips. You can change both later.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="project-name">
                Name <span className="font-normal text-muted-foreground">(optional)</span>
              </Label>
              <Input id="project-name" placeholder="e.g. Summer Road Trip 2026" {...register("name")} />
              {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
            </div>
            <div role="radiogroup" aria-label="Shape" className="grid gap-2">
              <p className="text-sm font-medium">Shape</p>
              <div className="grid grid-cols-3 gap-2">
                {SHAPE_CHOICES.map(({ id, label, hint }) => {
                  const preset = FRAME_PRESETS.find((p) => p.id === id)!;
                  const ratio = preset.width / preset.height;
                  const picked = shapeId === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      role="radio"
                      aria-checked={picked}
                      aria-label={`${label}: ${hint}`}
                      onClick={() => setPickedShape(id)}
                      className={
                        "flex min-h-24 flex-col items-center gap-1.5 rounded-lg border-2 p-2 text-center transition-colors " +
                        (picked ? "border-primary bg-primary/10" : "border-border hover:border-primary/50")
                      }
                    >
                      <span className="flex h-9 items-center justify-center" aria-hidden>
                        <span
                          className={"block rounded-sm border-2 " + (picked ? "border-primary" : "border-muted-foreground")}
                          style={{ width: `${Math.round(30 * Math.min(1, ratio))}px`, height: `${Math.round(30 / Math.max(1, ratio))}px` }}
                        />
                      </span>
                      <span className="text-sm font-medium">{label}</span>
                      <span className="text-[11px] leading-tight text-muted-foreground">{hint}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              Create video
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
