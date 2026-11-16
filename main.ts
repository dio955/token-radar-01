// Token Radar radar-2 — entrypoint.
//
// Reads the sealed DefiLlama snapshot, ranks the pre-token protocols by
// implied launch value, and writes the board, the dashboard data, the
// dashboard and screenshots, and the dossier the judge reads.
//
// Usage: node main.ts [--input <snapshot.json|dir>] [--output <dir>]
//   --input defaults to /input, --output to $MAKEFUN_OUTPUT_DIR or /output.
// The repository root is the directory this file lives in (or
// $MAKEFUN_BOT_DIR when the grader sets it), never the working directory:
// the grader runs `node /bot/main.ts` from `/`, so anchoring anything to
// the working directory would look for dashboard/ and screenshots/ in /.

import { copyFileSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import * as nodeUrl from "node:url";
import { buildDossier } from "./vendor/makefun-board.ts";
import { MODEL, boardIssue, buildRadar } from "./lib/model.ts";
import type { Snapshot } from "./lib/model.ts";

const PLAIN_NAME = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/;

function fail(message: string): never {
  throw new Error(`token-radar: ${message}`);
}

function parseArgs(argv: string[]): { input: string; output: string } {
  let input = "/input";
  let output = process.env.MAKEFUN_OUTPUT_DIR ?? "/output";
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === "--input" && i + 1 < argv.length) input = argv[++i]!;
    else if (arg === "--output" && i + 1 < argv.length) output = argv[++i]!;
    else if (arg.startsWith("--input=")) input = arg.slice("--input=".length);
    else if (arg.startsWith("--output=")) output = arg.slice("--output=".length);
    else fail(`unknown argument: ${arg}`);
  }
  return { input, output };
}

function readSnapshot(input: string): Snapshot {
  let path = input;
  try {
    if (statSync(input).isDirectory()) path = join(input, "snapshot.json");
  } catch {
    fail(`cannot read input ${input}: no such file or directory`);
  }
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    fail(`cannot read snapshot at ${path}`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    fail(`snapshot at ${path} is not valid JSON: ${(err as Error).message}`);
  }
  const snap = parsed as { as_of?: unknown; source?: unknown; floor_usd?: unknown; protocols?: unknown; watchlist?: unknown };
  if (!snap || typeof snap !== "object" || !Array.isArray(snap.protocols) || !Array.isArray(snap.watchlist)) {
    fail(`snapshot at ${path} is malformed: expected protocols and watchlist arrays`);
  }
  if (typeof snap.as_of !== "string" || typeof snap.source !== "string" || typeof snap.floor_usd !== "number") {
    fail(`snapshot at ${path} is malformed: expected as_of, source and floor_usd fields`);
  }
  return snap as Snapshot;
}

function copyTree(from: string, to: string): string[] {
  // Copy every regular file under `from` into `to` at the same relative
  // paths, skipping dotfiles and dot-directories. Returns the copied names.
  const copied: string[] = [];
  mkdirSync(to, { recursive: true });
  const walk = (dir: string, rel: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith(".")) continue;
      const src = join(dir, entry.name);
      const relPath = rel === "" ? entry.name : `${rel}/${entry.name}`;
      if (entry.isDirectory()) {
        mkdirSync(join(to, relPath), { recursive: true });
        walk(src, relPath);
      } else if (entry.isFile()) {
        copyFileSync(src, join(to, relPath));
        copied.push(relPath);
      }
    }
  };
  walk(from, "");
  return copied;
}

function main(): void {
  const { input, output } = parseArgs(process.argv.slice(2));
  const botDir = process.env.MAKEFUN_BOT_DIR;
  const root = botDir ?? dirname(nodeUrl.fileURLToPath(import.meta.url));

  const snapshot = readSnapshot(input);
  const radar = buildRadar(snapshot);
  const issue = boardIssue(radar.rows, snapshot.watchlist);
  if (issue) fail(`board refused: ${issue}`);

  mkdirSync(output, { recursive: true });
  writeFileSync(join(output, "board.json"), `${JSON.stringify({ rows: radar.rows })}\n`, "utf8");

  const compactRows = radar.rows.map((row) => ({
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    mcap_usd: row.mcap_usd,
    listed_at: row.listed_at,
    age_days: row.age_days,
    implied_value_usd: row.implied_value_usd,
    category_multiple: row.model.category_multiple,
    growth_multiplier: row.model.growth_multiplier,
    maturity_multiplier: row.model.maturity_multiplier,
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
  writeFileSync(join(output, "data.js"), `window.RADAR = ${JSON.stringify(radarData)};\n`, "utf8");

  copyTree(join(root, "dashboard"), join(output, "dashboard"));
  const shots = copyTree(join(root, "screenshots"), join(output, "screenshots"));
  if (shots.length < 3) fail(`screenshots/ holds ${shots.length} images, need at least 3`);
  for (const name of shots) {
    if (!PLAIN_NAME.test(name)) fail(`screenshot name ${name} is not allowed`);
  }

  writeFileSync(
    join(output, "dossier.json"),
    buildDossier(output, {
      text_max_bytes: 65536,
      screenshots: { max: 4, max_bytes: 524288 },
      dashboard: { max_files: 400, max_bytes: 4194304 },
    }),
  );

  console.log(
    `token-radar ${MODEL.version}: ${snapshot.protocols.length} protocols, ${snapshot.watchlist.length} watchlist, ${radar.rows.length} rows scored (${radar.early_size} early), ${radar.live_size} live set aside, ${shots.length} screenshots`,
  );
}

main();
