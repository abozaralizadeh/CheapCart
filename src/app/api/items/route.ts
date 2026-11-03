import { itemsHandler } from "../../../server/handlers";
import { limited, reply } from "../../../server/route-helpers";

export const dynamic = "force-dynamic";

export function GET(req: Request) {
  const blocked = limited(req, "general");
  if (blocked) return blocked;
  const q = new URL(req.url).searchParams.get("q") ?? "";
  return reply(itemsHandler(q));
}
