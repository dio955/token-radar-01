// Token Radar — entrypoint (Node 22, standard library only).
//
// Reads the sealed snapshot, builds the radar-2 board with lib/model.ts,
// writes board.json and the dashboard's data.js, copies dashboard/ and
// screenshots/ into the output, and writes dossier.json last with the
// kit's buildDossier. Runs twice must write identical bytes: the build is
// deterministic (ties break by slug, no clock, no randomness).

import { readFileSync, writeFileSync, mkdirSync, readdirSync, copyFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { buildDossier } from "./vendor/makefun-board.ts";
import { buildRadar, boardIssue, MODEL, type Snapshot } from "./lib/model.ts";

const SCREENSHOT_NAME = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/;

function parseArgs(argv: string[]): { input: string; output: string } {
  let input = "/input";
  let output = process.env.MAKEFUN_OUTPUT_DIR ?? "/output";
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--input" && i + 1 < argv.length) input = argv[++i];
    else if (argv[i] === "--output" && i + 1 < argv.length) output = argv[++i];
  }
  return { input, output };
}

function readSnapshot(inputPath: string): Snapshot {
  let file = inputPath;
  try {
    if (statSync(inputPath).isDirectory()) file = join(inputPath, "snapshot.json");
  } catch {
    throw new Error(`snapshot not found: ${inputPath}`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(file, "utf8"));
  } catch (error) {
    throw new Error(`snapshot is not valid JSON (${file}): ${(error as Error).message}`);
  }
  const snapshot = parsed as Snapshot;
  if (
    typeof snapshot.as_of !== "string" ||
    typeof snapshot.source !== "string" ||
    typeof snapshot.floor_usd !== "number" ||
    !Array.isArray(snapshot.protocols) ||
    !Array.isArray(snapshot.watchlist)
  ) {
    throw new Error("snapshot is malformed: as_of, source, floor_usd, protocols or watchlist missing");
  }
  for (const p of snapshot.protocols) {
    if (
      typeof p.slug !== "string" ||
      typeof p.name !== "string" ||
      !Array.isArray(p.chains) ||
      typeof p.tvl_usd !== "number"
    ) {
      throw new Error(`snapshot is malformed: protocol ${String(p?.slug)} misses a required field`);
    }
  }
  return snapshot;
}

function copyDir(source: string, target: string): number {
  mkdirSync(target, { recursive: true });
  let count = 0;
  for (const name of readdirSync(source)) {
    if (name.startsWith(".")) continue;
    const from = join(source, name);
    if (!statSync(from).isFile()) continue;
    copyFileSync(from, join(target, name));
    count++;
  }
  return count;
}

function main(): void {
  const { input, output } = parseArgs(process.argv.slice(2));
  const root = resolve(".");
  const snapshot = readSnapshot(resolve(input));
  const radar = buildRadar(snapshot);
  const issue = boardIssue(radar.rows, snapshot.watchlist);
  if (issue) throw new Error(`board refused: ${issue}`);

  mkdirSync(output, { recursive: true });
  writeFileSync(join(output, "board.json"), JSON.stringify({ rows: radar.rows }) + "\n");

  const compactRows = radar.rows.map((r) => ({
    rank: r.rank,
    slug: r.slug,
    name: r.name,
    category: r.category,
    chains: r.chains,
    tvl_usd: r.tvl_usd,
    change_7d: r.change_7d,
    mcap_usd: r.mcap_usd,
    listed_at: r.listed_at,
    age_days: r.age_days,
    implied_value_usd: r.implied_value_usd,
    category_multiple: r.model.category_multiple,
    growth_multiplier: r.model.growth_multiplier,
    maturity_multiplier: r.model.maturity_multiplier,
  }));
  const radarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model: MODEL,
    model_version: MODEL.version,
    watchlist_size: radar.watchlist_size,
    board_size: radar.rows.length,
    early_size: radar.early_size,
    live_size: radar.live_size,
    category_multiples: radar.category_multiples,
    overall_multiple: radar.overall_multiple,
    rows: compactRows,
    live: radar.live,
  };
  writeFileSync(join(output, "data.js"), `window.RADAR = ${JSON.stringify(radarData)};\n`);

  copyDir(join(root, "dashboard"), join(output, "dashboard"));
  const shotCount = copyDir(join(root, "screenshots"), join(output, "screenshots"));
  if (shotCount < 3) {
    throw new Error(`need at least 3 screenshots, found ${shotCount}`);
  }
  for (const name of readdirSync(join(output, "screenshots"))) {
    if (name.startsWith(".")) continue;
    if (!SCREENSHOT_NAME.test(name)) throw new Error(`screenshot name refused: ${name}`);
  }

  const dossier = buildDossier(output, {
    text_max_bytes: 65536,
    screenshots: { max: 4, max_bytes: 524288 },
    dashboard: { max_files: 400, max_bytes: 4194304 },
  });
  writeFileSync(join(output, "dossier.json"), dossier);
  console.log(
    `token-radar radar-2: ${snapshot.protocols.length} protocols, ` +
      `${radar.watchlist_size} watchlist, ${radar.rows.length} rows scored ` +
      `(${radar.early_size} early), ${radar.live_size} live set aside, ${shotCount} screenshots`,
  );
}

main();
