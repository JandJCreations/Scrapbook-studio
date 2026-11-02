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

const formSchema = z.object({
  name: z.string().trim().min(1, "Give your video a name").max(80, "Keep it under 80 characters"),
});

type FormValues = z.infer<typeof formSchema>;

/** Starts a new, empty video project and opens it in the editor. */
export function NewProjectDialog({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
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
      try {
        const preset = FRAME_PRESETS.find((p) => p.id === defaultFramePresetId) ?? DEFAULT_FRAME_PRESET;
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
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <form onSubmit={handleSubmit(onSubmit)}>
          <DialogHeader>
            <DialogTitle>New video</DialogTitle>
            <DialogDescription>
              Give your video a name. You add photos, clips and music next, and can rename it anytime.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="project-name">Name</Label>
              <Input id="project-name" placeholder="e.g. Summer Road Trip 2026" autoFocus {...register("name")} />
              {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
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
