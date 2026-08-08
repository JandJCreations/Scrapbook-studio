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
import { saveProjectFrame } from "@/lib/sync/project-content-sync";
import { useCanvasFrameStore } from "@/store/use-canvas-frame-store";
import { useDashboardUiStore } from "@/store/use-dashboard-ui-store";
import { useProjectStore } from "@/store/use-project-store";
import { useSettingsStore } from "@/store/use-settings-store";

const formSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Give your scrapbook a name")
    .max(80, "Keep it under 80 characters"),
});

type FormValues = z.infer<typeof formSchema>;

export function NewProjectDialog({
  children,
}: {
  children: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(false);
  const createProject = useProjectStore((s) => s.createProject);
  const setFrame = useCanvasFrameStore((s) => s.setFrame);
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
      const preset =
        FRAME_PRESETS.find((p) => p.id === defaultFramePresetId) ??
        DEFAULT_FRAME_PRESET;
      const frame = { width: preset.width, height: preset.height };
      setFrame(project.id, frame);
      saveProjectFrame(project.id, frame).catch((error) => {
        console.error("Failed to save canvas frame:", error);
      });
      toast.success(`"${project.name}" created`);
      reset();
      setOpen(false);
      router.push("/dashboard");
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
            <DialogTitle>New scrapbook</DialogTitle>
            <DialogDescription>
              Give your project a name. You can rename it anytime.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-2 py-4">
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

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              Create scrapbook
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
