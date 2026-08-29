/**
 * Regenerates the generated block of docs/COST.md from Claude Code's session transcripts.
 *
 * A full recompute from an append-only log, so a skipped run is self-healing and there is nothing
 * to keep in sync. Run it whenever you want a number: `pnpm cost`.
 *
 * The one subtle thing here is deduplication. Assistant records are written once per content block,
 * and the duplicates carry *partial streaming snapshots* of output_tokens — measured on this
 * project, summing every record overcounts output by 59% while keeping the first record per
 * message.id undercounts it by 62%. Only max-per-id is correct (verified equal to last-per-id).
 * Every other usage field is identical within a group, which the script asserts rather than assumes.
 */
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { homedir } from "node:os";

const PROJECT_SLUG = "-Users-guel-Documents-projects-shoelaxe-shoelaxe-dashboard";
const TRANSCRIPTS = join(homedir(), ".claude", "projects", PROJECT_SLUG);
const OUT = resolve(import.meta.dirname, "..", "docs", "COST.md");
const CONFIG = resolve(import.meta.dirname, "cost.config.json");
const START = "<!-- GENERATED:START -->";
const END = "<!-- GENERATED:END -->";

interface Rate {
  from?: string;
  until?: string;
  in: number;
  out: number;
  cacheRead: number;
  cacheWrite5m: number;
  cacheWrite1h: number;
}
type Usage = {
  input_tokens?: number;
  output_tokens?: number;
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
  cache_creation?: { ephemeral_5m_input_tokens?: number; ephemeral_1h_input_tokens?: number };
};
interface Row {
  model: string;
  day: string;
  session: string;
  sidechain: boolean;
  ts: string;
  input: number;
  output: number;
  cacheRead: number;
  write5m: number;
  write1h: number;
}

const config = JSON.parse(readFileSync(CONFIG, "utf8")) as {
  models: Record<string, Rate | Rate[]>;
};

function rateFor(model: string, iso: string): Rate | undefined {
  const entry = config.models[model];
  if (!entry) return undefined;
  if (!Array.isArray(entry)) return entry;
  const day = iso.slice(0, 10);
  return entry.find((r) => (!r.from || day >= r.from) && (!r.until || day <= r.until));
}

function walk(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return walk(p);
    return p.endsWith(".jsonl") ? [p] : [];
  });
}

/** The session a transcript belongs to: the top-level file name, or its parent dir for subagents. */
function sessionOf(file: string): string {
  const rel = file.slice(TRANSCRIPTS.length + 1);
  const head = rel.split("/")[0];
  return head.replace(/\.jsonl$/, "");
}

const hkDay = (iso: string) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Hong_Kong" }).format(new Date(iso));

function collect(): { rows: Row[]; warnings: string[] } {
  const byId = new Map<string, Row>();
  const warnings: string[] = [];
  let records = 0;

  for (const file of walk(TRANSCRIPTS)) {
    const session = sessionOf(file);
    for (const line of readFileSync(file, "utf8").split("\n")) {
      if (!line.trim()) continue;
      let o: Record<string, unknown>;
      try {
        o = JSON.parse(line);
      } catch {
        continue;
      }
      if (o.type !== "assistant") continue;
      const m = o.message as { id?: string; model?: string; usage?: Usage } | undefined;
      if (!m?.usage || !m.id || !m.model) continue;
      records++;

      const u = m.usage;
      const w5 = u.cache_creation?.ephemeral_5m_input_tokens ?? 0;
      const w1 = u.cache_creation?.ephemeral_1h_input_tokens ?? 0;
      const declared = u.cache_creation_input_tokens ?? 0;
      if (w5 + w1 !== declared) {
        warnings.push(`cache_creation split ${w5}+${w1} != ${declared} on ${m.id}`);
      }

      const row: Row = {
        model: m.model,
        ts: String(o.timestamp ?? ""),
        day: o.timestamp ? hkDay(String(o.timestamp)) : "unknown",
        session,
        sidechain: Boolean(o.isSidechain),
        input: u.input_tokens ?? 0,
        output: u.output_tokens ?? 0,
        cacheRead: u.cache_read_input_tokens ?? 0,
        write5m: w5,
        write1h: w1,
      };

      const prev = byId.get(m.id);
      if (!prev) {
        byId.set(m.id, row);
        continue;
      }
      // Duplicates: output grows across the stream, everything else must agree.
      if (
        prev.input !== row.input ||
        prev.cacheRead !== row.cacheRead ||
        prev.write5m !== row.write5m ||
        prev.write1h !== row.write1h
      ) {
        warnings.push(`non-output usage disagrees within message ${m.id}`);
      }
      prev.output = Math.max(prev.output, row.output);
    }
  }

  const rows = [...byId.values()];
  warnings.unshift(
    `${records} assistant records collapsed to ${rows.length} messages (${(records / Math.max(rows.length, 1)).toFixed(2)}x)`,
  );
  return { rows, warnings };
}

const cost = (r: Row, rate: Rate) =>
  (r.input * rate.in +
    r.output * rate.out +
    r.cacheRead * rate.cacheRead +
    r.write5m * rate.cacheWrite5m +
    r.write1h * rate.cacheWrite1h) /
  1_000_000;

const n = (x: number) => x.toLocaleString("en-US");
const usd = (x: number) => `$${x.toFixed(2)}`;

function group<K extends string | number>(rows: Row[], key: (r: Row) => K) {
  const out = new Map<K, Row[]>();
  for (const r of rows) {
    const k = key(r);
    (out.get(k) ?? out.set(k, []).get(k)!).push(r);
  }
  return out;
}

function totals(rows: Row[], unpriced: Map<string, number>) {
  let c = 0;
  const t = { input: 0, output: 0, cacheRead: 0, write: 0, msgs: rows.length };
  for (const r of rows) {
    t.input += r.input;
    t.output += r.output;
    t.cacheRead += r.cacheRead;
    t.write += r.write5m + r.write1h;
    const rate = rateFor(r.model, r.ts);
    if (rate) c += cost(r, rate);
    else unpriced.set(r.model, (unpriced.get(r.model) ?? 0) + 1);
  }
  return { ...t, cost: c };
}

function render(rows: Row[], warnings: string[]): string {
  const unpriced = new Map<string, number>();
  const all = totals(rows, unpriced);
  const L: string[] = [];

  L.push(START);
  L.push(`<!-- Regenerated by \`pnpm cost\`. Edits inside this block are overwritten. -->`);
  L.push("");
  L.push("## Summary — Claude usage");
  L.push("");
  L.push("| | |");
  L.push("|---|---|");
  L.push(`| Messages | ${n(all.msgs)} |`);
  L.push(`| Input tokens | ${n(all.input)} |`);
  L.push(`| Output tokens | ${n(all.output)} |`);
  L.push(`| Cache reads | ${n(all.cacheRead)} |`);
  L.push(`| Cache writes | ${n(all.write)} |`);
  L.push(`| **Cost** | **${usd(all.cost)}** |`);
  L.push("");

  if (unpriced.size) {
    L.push("> ⚠️ **Unpriced models** — excluded from the total, so it is an underestimate:");
    for (const [m, c] of unpriced) L.push(`> - \`${m}\` (${c} messages) — add it to \`scripts/cost.config.json\``);
    L.push("");
  }

  L.push("## By model");
  L.push("");
  L.push("| Model | Messages | Input | Output | Cache read | Cache write | Cost |");
  L.push("|---|---:|---:|---:|---:|---:|---:|");
  for (const [model, rs] of [...group(rows, (r) => r.model)].sort()) {
    const t = totals(rs, new Map());
    L.push(
      `| \`${model}\` | ${n(t.msgs)} | ${n(t.input)} | ${n(t.output)} | ${n(t.cacheRead)} | ${n(t.write)} | ${usd(t.cost)} |`,
    );
  }
  L.push("");

  L.push("## By day (Asia/Hong_Kong)");
  L.push("");
  L.push("| Day | Messages | Output | Cost |");
  L.push("|---|---:|---:|---:|");
  for (const [day, rs] of [...group(rows, (r) => r.day)].sort()) {
    const t = totals(rs, new Map());
    L.push(`| ${day} | ${n(t.msgs)} | ${n(t.output)} | ${usd(t.cost)} |`);
  }
  L.push("");

  L.push("## By session");
  L.push("");
  L.push("| Session | Main | Subagent | Models | Cost |");
  L.push("|---|---:|---:|---|---:|");
  for (const [s, rs] of [...group(rows, (r) => r.session)].sort((a, b) => {
    return totals(b[1], new Map()).cost - totals(a[1], new Map()).cost;
  })) {
    const t = totals(rs, new Map());
    const mix = [...group(rs, (r) => r.model).keys()].map((m) => m.replace("claude-", "")).sort();
    L.push(
      `| \`${s.slice(0, 8)}…\` | ${n(rs.filter((r) => !r.sidechain).length)} | ${n(rs.filter((r) => r.sidechain).length)} | ${mix.join(", ")} | ${usd(t.cost)} |`,
    );
  }
  L.push("");

  L.push("## Data quality");
  L.push("");
  for (const w of warnings.slice(0, 12)) L.push(`- ${w}`);
  if (warnings.length > 12) L.push(`- …and ${warnings.length - 12} more`);
  L.push("");
  L.push(END);
  return L.join("\n");
}

const TEMPLATE = `# Shoelaxe — Project Cost

What this project has cost to build: Claude usage below is generated from the session transcripts by
\`pnpm cost\`; the infrastructure section underneath is maintained by hand.

${START}
${END}

## Infrastructure & non-AI costs

Hand-maintained — the generator does not touch this section.

### Recurring (monthly, USD)

| Item | Plan | Cost | Notes |
|---|---|---:|---|
| DigitalOcean App Platform — \`web\` | apps-s-1vcpu-1gb | 12.00 | |
| DigitalOcean App Platform — \`worker\` | apps-s-1vcpu-0.5gb | 5.00 | |
| DigitalOcean App Platform — scheduled job | apps-s-1vcpu-0.5gb | ~0.05 | billed only while running |
| Supabase | _tier TBC_ | ? | confirm Free vs Pro |
| Domain | | ? | |
| **Total** | | **?** | |

### One-off

| Item | Cost | Notes |
|---|---:|---|
| Supabase region move (Tokyo → Singapore) | 0.00 | new project on the same plan |
| Latency probe droplet | ~0.50 | destroyed after use |

### Not yet costed

- Shopify plan, once store access exists.
- Log forwarding, if the App Platform retention window proves too short.

## By milestone

Hand-maintained. Fill in the cost column from the "by day" table above as each milestone closes.

| Milestone | Status | Claude cost |
|---|---|---:|
| M0 Decide, freeze, measure | done | |
| M1 Deployment skeleton | blocked — needs DigitalOcean account | |
| M2 Repo tooling and contracts | in progress | |
| M3 Migrations + region move | | |
| M4 Domain core | | |
| M5 DB layer + /api/ingest | | |
| M6 Auth + approval queue | | |
| M7 Apps Script — Gmail path | | |
| M8 Apps Script — sheet + retire RPCs | | |
| M9 Remaining reads | | |
| M10 Writes and approvals | | |
| M11 Job runner | | |
| M12 Publishing port | | |
| M13 API docs and cutover | | |
`;

function main() {
  const { rows, warnings } = collect();
  const block = render(rows, warnings);

  let doc = existsSync(OUT) ? readFileSync(OUT, "utf8") : TEMPLATE;
  const a = doc.indexOf(START);
  const b = doc.indexOf(END);
  if (a === -1 || b === -1) {
    throw new Error(`docs/COST.md is missing the ${START} / ${END} markers`);
  }
  doc = doc.slice(0, a) + block + doc.slice(b + END.length);
  writeFileSync(OUT, doc);

  const unpriced = new Map<string, number>();
  const t = totals(rows, unpriced);
  console.log(`docs/COST.md updated — ${rows.length} messages, ${usd(t.cost)}`);
  for (const [m, c] of unpriced) console.warn(`WARN: unpriced model ${m} (${c} messages)`);
}

main();
