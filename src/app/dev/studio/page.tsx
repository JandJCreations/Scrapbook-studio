import { notFound } from "next/navigation";

import { StudioDevClient } from "@/app/dev/studio/studio-dev-client";

// A developer harness for the studio editor: never served in production.
export default function StudioDevPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <StudioDevClient />;
}
