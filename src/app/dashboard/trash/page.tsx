import { TrashView } from "@/components/dashboard/trash-view";

export default function TrashPage() {
  return (
    <div className="flex flex-1 flex-col">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Trash</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Deleted projects stay here for 30 days before they&apos;re
          permanently removed.
        </p>
      </div>

      <TrashView />
    </div>
  );
}
