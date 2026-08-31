import { seed, SEED_ROOT } from "./fixtures/seed.js";

/**
 * webServer が起動する前に fixture のセッションログを書き出す。
 * これで api サーバは CINCH_ROOT=SEED_ROOT を読み、実データに依存しない。
 */
export default async function globalSetup(): Promise<void> {
  await seed();
  // eslint-disable-next-line no-console
  console.log(`[e2e] seeded fixtures at ${SEED_ROOT}`);
}
