import { redirect } from "next/navigation";

// The studio used to live here while it was built beside the old editor; it is /editor/[id] now.
export default async function StudioRedirect({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/editor/${encodeURIComponent(id)}`);
}
