import { TemplateGallery } from "@/components/dashboard/template-gallery";

export default function TemplatesPage() {
  return (
    <div className="flex flex-1 flex-col">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Templates</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Start from a ready-made layout and make it your own.
        </p>
      </div>

      <TemplateGallery />
    </div>
  );
}
