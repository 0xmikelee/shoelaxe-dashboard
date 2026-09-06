/**
 * Long-lived Shopify drain + settings recompute. APP_ROLE=worker. Does not serve HTTP.
 *
 *   PUBLISH_TARGET=shopify pnpm worker
 *
 * Ingest never calls drain. Keep `pnpm dev` on PUBLISH_TARGET=none; this process is the publisher.
 * `settings_recompute` jobs run here regardless of PUBLISH_TARGET.
 */
import { loadLocalEnv } from "../scripts/load-local-env";

loadLocalEnv();

const IDLE_MS = 1_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function main(): Promise<void> {
  const { getEnv } = await import("../lib/env-core");
  const env = getEnv();
  const instance = process.env.HOSTNAME ?? `worker-${process.pid}`;
  const { beatWorker, drainBatchFromDb } = await import("../lib/services/publish-db");
  const { drainSettingsRecomputeFromDb } = await import("../lib/services/settings-db");

  let running = true;
  const stop = () => {
    running = false;
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);

  console.log(
    JSON.stringify({
      level: "info",
      msg: "worker_start",
      instance,
      publish_target: env.PUBLISH_TARGET,
      t: new Date().toISOString(),
    }),
  );

  while (running) {
    await beatWorker(instance);
    const settings = await drainSettingsRecomputeFromDb();
    const result = await drainBatchFromDb({ maxProducts: 5 });
    const wait = result.claimed > 0 || settings.processed > 0 ? 0 : IDLE_MS;
    if (wait > 0) await sleep(wait);
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.stack ?? err.message : String(err));
  process.exitCode = 1;
});
