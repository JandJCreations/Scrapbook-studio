import { StudioClient } from "@/app/editor/[id]/studio-client";

export default async function StudioPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <StudioClient projectId={id} />;
}
