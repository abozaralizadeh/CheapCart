/** The path the app is served under, such as "/cheapcart", or "" at the root. Set by BASE_PATH at build time. */
export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

/** Prefixes an app path like "/api/compare" with the base path. Next's <Link> does this on its own, fetch does not. */
export function withBase(path: string): string {
  return BASE_PATH + path;
}
