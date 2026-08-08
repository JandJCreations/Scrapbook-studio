"use client";

import { useTheme } from "next-themes";
import { CloudOff, Laptop, Moon, Sun } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { FRAME_PRESETS } from "@/lib/export/frame-presets";
import { RESOLUTION_PRESETS } from "@/lib/export/export-resolutions";
import { FORMAT_GROUPS, type ExportFormat } from "@/lib/export/export-formats";
import { useSettingsStore } from "@/store/use-settings-store";

const THEME_OPTIONS = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Laptop },
];

const ALL_FORMATS: ExportFormat[] = FORMAT_GROUPS.flatMap((g) => g.formats);

export function SettingsView() {
  const { theme, setTheme } = useTheme();
  const defaultExportFormat = useSettingsStore((s) => s.defaultExportFormat);
  const setDefaultExportFormat = useSettingsStore(
    (s) => s.setDefaultExportFormat,
  );
  const defaultResolutionId = useSettingsStore((s) => s.defaultResolutionId);
  const setDefaultResolutionId = useSettingsStore(
    (s) => s.setDefaultResolutionId,
  );
  const defaultFramePresetId = useSettingsStore((s) => s.defaultFramePresetId);
  const setDefaultFramePresetId = useSettingsStore(
    (s) => s.setDefaultFramePresetId,
  );

  return (
    <div className="flex max-w-2xl flex-col gap-5">
      <Card>
        <CardHeader>
          <CardTitle>Appearance</CardTitle>
          <CardDescription>
            Choose how Scrapbook Studio looks on this device.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-2">
            {THEME_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setTheme(opt.value)}
                className={cn(
                  "flex flex-col items-center gap-1.5 rounded-lg border px-3 py-3 text-xs font-medium transition-colors",
                  theme === opt.value
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:bg-accent",
                )}
              >
                <opt.icon className="size-4" />
                {opt.label}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>New project defaults</CardTitle>
          <CardDescription>
            Applied automatically whenever you create a new scrapbook.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-4">
            <span className="text-sm">Canvas size</span>
            <Select
              value={defaultFramePresetId}
              onValueChange={setDefaultFramePresetId}
            >
              <SelectTrigger className="h-8 w-48 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FRAME_PRESETS.map((preset) => (
                  <SelectItem key={preset.id} value={preset.id}>
                    {preset.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Export defaults</CardTitle>
          <CardDescription>
            The starting format and resolution for the export dialog.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <span className="text-sm">Format</span>
            <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-7">
              {ALL_FORMATS.map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setDefaultExportFormat(f)}
                  className={cn(
                    "rounded-md border px-2 py-1.5 text-xs font-medium uppercase transition-colors",
                    defaultExportFormat === f
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:bg-accent",
                  )}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between gap-4">
            <span className="text-sm">Resolution</span>
            <Select
              value={defaultResolutionId}
              onValueChange={setDefaultResolutionId}
            >
              <SelectTrigger className="h-8 w-48 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RESOLUTION_PRESETS.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Account & sync</CardTitle>
          <CardDescription>
            Cloud accounts, autosave, and sync aren&apos;t set up yet.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3 rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
            <CloudOff className="size-5 shrink-0" />
            <p>
              Your projects are stored locally in this browser session.
              Cloud sync and multi-device access are coming in a future
              update.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
