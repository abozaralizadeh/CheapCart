import { areaHandler } from "../../../server/handlers";
import { limited, readJson, reply } from "../../../server/route-helpers";

export const dynamic = "force-dynamic";

// POST on purpose: a location must never end up in a URL or a log.
export async function POST(req: Request) {
  const blocked = limited(req, "general");
  if (blocked) return blocked;
  return reply(areaHandler(await readJson(req)));
}
