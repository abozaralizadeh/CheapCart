import { configHandler } from "../../../server/handlers";
import { reply } from "../../../server/route-helpers";

export const dynamic = "force-dynamic";

export function GET() {
  return reply(configHandler());
}
