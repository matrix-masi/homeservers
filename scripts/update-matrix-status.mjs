#!/usr/bin/env node
/**
 * Probes each Matrix homeserver via GET /_matrix/client/versions,
 * updates status in homeservers.json, and writes online-homeservers.json.
 */

import { readFileSync, writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const HOMESERVERS_PATH = join(ROOT, "homeservers.json");
const ONLINE_HOMESERVERS_PATH = join(ROOT, "online-homeservers.json");

const REQUEST_TIMEOUT_MS = 12_000;
const CONCURRENCY = 15;
/** Round response time to nearest 50ms for a low-precision "ping" indicator. */
const RESPONSE_TIME_GRANULARITY_MS = 50;

function roundResponseTime(ms) {
  return Math.round(ms / RESPONSE_TIME_GRANULARITY_MS) * RESPONSE_TIME_GRANULARITY_MS;
}

async function checkServer(url) {
  const versionsUrl = `${url.replace(/\/$/, "")}/_matrix/client/versions`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const start = Date.now();
  try {
    const res = await fetch(versionsUrl, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
      redirect: "follow",
    });
    clearTimeout(timeout);
    const responseTimeMs = res.ok ? roundResponseTime(Date.now() - start) : undefined;
    return { ok: res.ok, status: res.status, responseTimeMs };
  } catch (err) {
    clearTimeout(timeout);
    return { ok: false, error: err.name || "Error" };
  }
}

async function runInBatches(items, batchSize, fn, onBatch) {
  const results = [];
  const totalBatches = Math.ceil(items.length / batchSize);
  for (let i = 0; i < items.length; i += batchSize) {
    const batchIndex = Math.floor(i / batchSize) + 1;
    const batch = items.slice(i, i + batchSize);
    const batchResults = await Promise.all(batch.map(fn));
    results.push(...batchResults);
    if (onBatch) onBatch(batchIndex, totalBatches, results.length);
  }
  return results;
}

async function main() {
  const startTime = Date.now();
  console.log(`[${new Date().toISOString()}] Starting homeserver status check`);

  const raw = readFileSync(HOMESERVERS_PATH, "utf8");
  const homeservers = JSON.parse(raw);
  const toCheck = homeservers.filter((s) => s.status === "online" || s.status === "offline");
  const deadCount = homeservers.length - toCheck.length;
  console.log(`Loaded ${homeservers.length} homeservers from ${HOMESERVERS_PATH}`);
  if (deadCount > 0) {
    console.log(`Skipping ${deadCount} dead server(s) (no longer checked)`);
  }
  console.log(`Checking ${toCheck.length} server(s) at /_matrix/client/versions (timeout: ${REQUEST_TIMEOUT_MS / 1000}s, concurrency: ${CONCURRENCY})`);
  console.log("");

  const statuses = await runInBatches(
    toCheck,
    CONCURRENCY,
    async (server) => {
      const result = await checkServer(server.url);
      const online = result.ok;
      process.stdout.write(online ? "." : "x");
      return {
        status: online ? "online" : "offline",
        responseTimeMs: result.responseTimeMs,
        result,
      };
    },
    (batchIndex, totalBatches, checkedSoFar) => {
      console.log(`\n[Batch ${batchIndex}/${totalBatches}] Checked ${checkedSoFar}/${toCheck.length} servers`);
    }
  );
  console.log("");

  const failed = [];
  const responseTimes = [];
  toCheck.forEach((server, i) => {
    const status = statuses[i].status;
    if (status === "online") {
      server.status = "online";
      delete server.failCount;
      server.responseTimeMs = statuses[i].responseTimeMs;
      if (statuses[i].responseTimeMs != null) responseTimes.push(statuses[i].responseTimeMs);
    } else {
      const nextCount = (server.failCount ?? 0) + 1;
      if (nextCount >= 12) {
        server.status = "dead";
        server.failCount = 12;
      } else {
        server.status = "offline";
        server.failCount = nextCount;
      }
      delete server.responseTimeMs;
      if (server.status === "offline") {
        failed.push({ name: server.name, url: server.url, error: statuses[i].result.error || `HTTP ${statuses[i].result.status}` });
      }
    }
  });

  const onlineServers = homeservers.filter((s) => s.status === "online");
  const offlineCount = homeservers.filter((s) => s.status === "offline").length;
  const deadCountFinal = homeservers.filter((s) => s.status === "dead").length;
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log("");
  console.log("--- Summary ---");
  console.log(`Online:  ${onlineServers.length}`);
  console.log(`Offline: ${offlineCount}`);
  console.log(`Dead:    ${deadCountFinal}`);
  console.log(`Total:   ${homeservers.length}`);
  console.log(`Duration: ${elapsed}s`);
  if (responseTimes.length > 0) {
    const min = Math.min(...responseTimes);
    const max = Math.max(...responseTimes);
    const avg = Math.round(responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length / RESPONSE_TIME_GRANULARITY_MS) * RESPONSE_TIME_GRANULARITY_MS;
    console.log(`Response time (online): min ${min}ms, avg ${avg}ms, max ${max}ms`);
  }
  if (failed.length > 0) {
    console.log("");
    console.log("Offline servers (first 25):");
    failed.slice(0, 25).forEach(({ name, url, error }) => {
      console.log(`  - ${name} (${url}) [${error}]`);
    });
    if (failed.length > 25) {
      console.log(`  ... and ${failed.length - 25} more`);
    }
  }

  console.log("");
  console.log("Writing output files...");
  writeFileSync(HOMESERVERS_PATH, JSON.stringify(homeservers, null, 2) + "\n");
  writeFileSync(
    ONLINE_HOMESERVERS_PATH,
    JSON.stringify(onlineServers, null, 2) + "\n"
  );
  console.log(`  Updated ${HOMESERVERS_PATH}`);
  console.log(`  Written ${ONLINE_HOMESERVERS_PATH} (${onlineServers.length} servers)`);
  console.log(`[${new Date().toISOString()}] Done`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
