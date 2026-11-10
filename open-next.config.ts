import { defineCloudflareConfig } from "@opennextjs/cloudflare";
import staticAssetsIncrementalCache from "@opennextjs/cloudflare/overrides/incremental-cache/static-assets-incremental-cache";

export default defineCloudflareConfig({
  // CampusSync currently serves its live data from client-side Supabase/API calls
  // and does not use Next.js time-based revalidation. Keep the initial migration
  // independent of R2, Queues, and Durable Objects.
  incrementalCache: staticAssetsIncrementalCache,
  enableCacheInterception: true,
});
