/**
 * Receives crashes from people's browsers and writes them to the server log,
 * so a failure that only happens on someone's phone shows up in the hosting
 * logs instead of vanishing. Nothing is stored.
 */

const MAX_FIELD = 2000;

function clip(value: unknown): string {
  return typeof value === "string" ? value.slice(0, MAX_FIELD) : "";
}

export async function POST(request: Request) {
  let body: Record<string, unknown> = {};
  try {
    const text = await request.text();
    if (text.length > 20_000) return new Response(null, { status: 413 });
    body = JSON.parse(text) as Record<string, unknown>;
  } catch {
    return new Response(null, { status: 400 });
  }

  console.error(
    "[client-error]",
    JSON.stringify({
      message: clip(body.message),
      stack: clip(body.stack),
      kind: clip(body.kind),
      page: clip(body.page),
      userAgent: clip(request.headers.get("user-agent")),
    }),
  );
  return new Response(null, { status: 204 });
}
