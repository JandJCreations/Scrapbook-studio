import { EditorClient } from "@/app/editor/[id]/editor-client";

export default async function EditorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return <EditorClient projectId={id} />;
}
