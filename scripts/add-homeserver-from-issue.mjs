#!/usr/bin/env node
/**
 * Parses an issue body from the "Add new homeserver" form and appends the
 * new entry to homeservers.json. Expects ISSUE_BODY in env.
 * Status and responseTimeMs are left for update-matrix-status.mjs to fill.
 */

import { readFileSync, writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const HOMESERVERS_PATH = join(ROOT, "homeservers.json");

const VALID_TAGS = new Set(["nsfw", "tech", "furry", "bridges"]);

function parseFormBody(body) {
  const fields = {};
  const re = /\*\*([^*]+)\*\*\s*\n+([\s\S]*?)(?=\n\s*\*\*[^*]|$)/g;
  let m;
  while ((m = re.exec(body)) !== null) {
    const label = m[1].trim();
    const value = m[2].trim();
    fields[label] = value;
  }
  return fields;
}

function parseTags(tagsStr) {
  if (!tagsStr || typeof tagsStr !== "string") return [];
  return tagsStr
    .split(",")
    .map((t) => t.trim().toLowerCase())
    .filter((t) => t && VALID_TAGS.has(t));
}

function main() {
  const body = process.env.ISSUE_BODY;
  if (!body) {
    console.error("Missing ISSUE_BODY environment variable.");
    process.exit(1);
  }

  const fields = parseFormBody(body);
  const name = (fields["Name"] || fields["name"] || "").trim();
  const url = (fields["URL"] || fields["url"] || "").trim();
  const tags = parseTags(fields["Tags"] || fields["tags"] || "");

  if (!name || !url) {
    console.error("Missing required fields: name and url must be non-empty.");
    process.exit(1);
  }

  const raw = readFileSync(HOMESERVERS_PATH, "utf8");
  const homeservers = JSON.parse(raw);

  const exists = homeservers.some(
    (s) => s.url === url || s.name.toLowerCase() === name.toLowerCase()
  );
  if (exists) {
    console.error(`Homeserver already exists: ${name} (${url})`);
    process.exit(1);
  }

  const newEntry = {
    name,
    url,
    tags,
    status: "offline",
  };

  homeservers.push(newEntry);
  writeFileSync(HOMESERVERS_PATH, JSON.stringify(homeservers, null, 2) + "\n");
  console.log(`Added: ${name} (${url}) tags=${JSON.stringify(tags)}`);
}

main();
