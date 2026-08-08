"use client";

import * as React from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useDashboardUiStore } from "@/store/use-dashboard-ui-store";
import { useProjectStore } from "@/store/use-project-store";

const formSchema = z.object({
  name: z.string().trim().min(1, "Give the folder a name").max(60),
});

type FormValues = z.infer<typeof formSchema>;

export function NewProjectFolderDialog({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  const createFolder = useProjectStore((s) => s.createFolder);
  const setActiveFolderId = useDashboardUiStore((s) => s.setActiveFolderId);

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
    const folder = await createFolder(values.name);
    if (!folder) {
      toast.error("Failed to create folder");
      return;
    }
    toast.success(`Folder "${folder.name}" created`);
    setActiveFolderId(folder.id);
    reset();
    setOpen(false);
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
            <DialogTitle>New folder</DialogTitle>
          </DialogHeader>
          <div className="grid gap-2 py-4">
            <Label htmlFor="project-folder-name">Folder name</Label>
            <Input
              id="project-folder-name"
              placeholder="e.g. Family trips"
              autoFocus
              {...register("name")}
            />
            {errors.name && (
              <p className="text-sm text-destructive">{errors.name.message}</p>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              Create folder
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
