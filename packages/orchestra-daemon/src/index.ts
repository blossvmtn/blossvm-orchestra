// Public surface consumed by @orchestra/cli and (eventually) the Tauri cockpit's
// Rust side, so they don't reach into the daemon's internals directly.
export { DAEMON_PORT, DAEMON_BASE_URL, orchestraHome, tokenPath, dbPath } from "./paths";
export { readToken, generateAndWriteToken } from "./token";
export { createFetchHandler, type DaemonDeps } from "./server";
export { createDb, type OrchestraDb } from "./db/db";
export * as schema from "./db/schema";
export { rowToWorkIntent, rowToTaskSpec, rowToAgentRun, rowToReceipt } from "./db/mappers";
export { runFixtureCapabilityProvider } from "./fixtureCapabilityProvider";
