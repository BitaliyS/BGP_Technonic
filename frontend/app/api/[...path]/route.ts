import { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Имя контейнера backend — стабильнее, чем compose-service `backend`. */
const BACKEND =
  process.env.BACKEND_URL?.replace(/\/$/, "") ||
  "http://technonicol-ai-backend:8000";

async function proxy(
  req: NextRequest,
  ctx: { params: { path: string[] } }
) {
  const suffix = (ctx.params.path || []).join("/");
  const target = new URL(`${BACKEND}/api/${suffix}`);
  target.search = req.nextUrl.search;

  const headers = new Headers();
  const auth = req.headers.get("authorization");
  const contentType = req.headers.get("content-type");
  const accept = req.headers.get("accept");
  if (auth) headers.set("authorization", auth);
  if (contentType) headers.set("content-type", contentType);
  if (accept) headers.set("accept", accept);

  const method = req.method.toUpperCase();
  const init: RequestInit = { method, headers, cache: "no-store" };
  if (method !== "GET" && method !== "HEAD") {
    init.body = Buffer.from(await req.arrayBuffer());
  }

  try {
    const res = await fetch(target, init);
    const out = new Headers();
    const pass = ["content-type", "cache-control", "x-request-id"];
    for (const key of pass) {
      const v = res.headers.get(key);
      if (v) out.set(key, v);
    }
    return new Response(res.body, { status: res.status, headers: out });
  } catch (err) {
    const message = err instanceof Error ? err.message : "proxy failed";
    return Response.json(
      { detail: `backend unreachable: ${message}`, target: target.toString() },
      { status: 502 }
    );
  }
}

export function GET(req: NextRequest, ctx: { params: { path: string[] } }) {
  return proxy(req, ctx);
}
export function POST(req: NextRequest, ctx: { params: { path: string[] } }) {
  return proxy(req, ctx);
}
export function PUT(req: NextRequest, ctx: { params: { path: string[] } }) {
  return proxy(req, ctx);
}
export function PATCH(req: NextRequest, ctx: { params: { path: string[] } }) {
  return proxy(req, ctx);
}
export function DELETE(req: NextRequest, ctx: { params: { path: string[] } }) {
  return proxy(req, ctx);
}
