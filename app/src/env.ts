/**
 * Bindings for the Cloudflare Worker. Keep this interface in step with
 * `wrangler.jsonc` if another binding is added.
 */
export interface Env {
  /** Static client files (dist/client), served asset-first. */
  ASSETS: Fetcher;
  /** One Durable Object instance per room — `app.manifest.json` → durableObject. */
  ROOMS: DurableObjectNamespace;
}
