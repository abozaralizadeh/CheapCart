import { receiptReadHandler } from "../../../../server/handlers";
import { limited, reply } from "../../../../server/route-helpers";

export const dynamic = "force-dynamic";

// The file is read in memory and never written to disk.
export async function POST(req: Request) {
  const blocked = limited(req, "submit");
  if (blocked) return blocked;
  const type = req.headers.get("content-type") ?? "";
  let bytes: Uint8Array;
  let mime = "text/plain";
  let areaId: string | undefined;
  try {
    if (type.startsWith("multipart/form-data")) {
      const form = await req.formData();
      const file = form.get("file");
      if (!(file instanceof File)) return reply({ status: 400, body: { error: "bad_request", message: "Send a file." } });
      bytes = new Uint8Array(await file.arrayBuffer());
      mime = file.type || "application/octet-stream";
      const a = form.get("areaId");
      if (typeof a === "string") areaId = a;
    } else {
      const body = (await req.json()) as { text?: unknown; areaId?: unknown };
      if (typeof body.text !== "string") return reply({ status: 400, body: { error: "bad_request", message: "Send text or a file." } });
      bytes = new TextEncoder().encode(body.text.slice(0, 20_000));
      if (typeof body.areaId === "string") areaId = body.areaId;
    }
  } catch {
    return reply({ status: 400, body: { error: "bad_request", message: "Could not read the request." } });
  }
  return reply(await receiptReadHandler({ bytes, mime }, areaId));
}
