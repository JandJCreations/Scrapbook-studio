import { SettingsView } from "@/components/dashboard/settings-view";

export default function SettingsPage() {
  return (
    <div className="flex flex-1 flex-col">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage appearance and defaults for new projects.
        </p>
      </div>

      <SettingsView />
    </div>
  );
}
