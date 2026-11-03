import { submissionConfirmHandler } from "../../../../server/handlers";
import { limited, readJson, reply } from "../../../../server/route-helpers";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const blocked = limited(req, "submit");
  if (blocked) return blocked;
  return reply(submissionConfirmHandler(await readJson(req)));
}
