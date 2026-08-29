import { notFound } from "next/navigation";

import { cn } from "@/lib/utils";

export const metadata = { title: "Design tokens" };

interface Swatch {
  /** The CSS custom property, without the leading `--`. */
  token: string;
  /** The utility pair that paints it, so the page proves the Tailwind mapping and not just the var. */
  className: string;
  light: string;
  dark: string;
}

const SURFACES: readonly Swatch[] = [
  { token: "background / foreground", className: "bg-background text-foreground", light: "#F2F3F0", dark: "#111111" },
  { token: "card / card-foreground", className: "bg-card text-card-foreground", light: "#FFFFFF", dark: "#1A1A1A" },
  { token: "popover / popover-foreground", className: "bg-popover text-popover-foreground", light: "#FFFFFF", dark: "#1A1A1A" },
  { token: "primary / primary-foreground", className: "bg-primary text-primary-foreground", light: "#FF8400", dark: "#FF8400" },
  { token: "secondary / secondary-foreground", className: "bg-secondary text-secondary-foreground", light: "#E7E8E5", dark: "#2E2E2E" },
  { token: "muted / muted-foreground", className: "bg-muted text-muted-foreground", light: "#F2F3F0", dark: "#2E2E2E" },
  { token: "accent / accent-foreground", className: "bg-accent text-accent-foreground", light: "#F2F3F0", dark: "#111111" },
];

const SEMANTIC: readonly Swatch[] = [
  { token: "success / success-foreground", className: "bg-success text-success-foreground", light: "#DFE6E1 · #004D1A", dark: "#222924 · #B6FFCE" },
  { token: "warning / warning-foreground", className: "bg-warning text-warning-foreground", light: "#E9E3D8 · #804200", dark: "#291C0F · #FF8400" },
  { token: "error / error-foreground", className: "bg-error text-error-foreground", light: "#E5DCDA · #8C1C00", dark: "#24100B · #FF5C33" },
  { token: "info / info-foreground", className: "bg-info text-info-foreground", light: "#DFDFE6 · #000066", dark: "#222229 · #B2B2FF" },
];

/** Solid action colour, not a badge tint. Kept apart from `error` on the page for the same reason. */
const DESTRUCTIVE: readonly Swatch[] = [
  { token: "destructive", className: "bg-destructive text-card", light: "#D93C15", dark: "#FF5C33" },
];

const LINES: readonly Swatch[] = [
  { token: "border", className: "border-4 border-border bg-card text-card-foreground", light: "#CBCCC9", dark: "#2E2E2E" },
  { token: "input", className: "border-4 border-input bg-card text-card-foreground", light: "#CBCCC9", dark: "#2E2E2E" },
  { token: "ring", className: "border-4 border-ring bg-card text-card-foreground", light: "#666666", dark: "#666666" },
];

/** Declared in `:root` only. Both columns below must render these identically — that is the test. */
const NAV: readonly Swatch[] = [
  { token: "nav / nav-foreground", className: "bg-nav text-nav-foreground", light: "#0F1117 · #94A3B8", dark: "#0F1117 · #94A3B8" },
  { token: "nav-active / nav-active-foreground", className: "bg-nav-active text-nav-active-foreground", light: "#1E293B · #FFFFFF", dark: "#1E293B · #FFFFFF" },
];

const TYPE: readonly { name: string; size: string; role: string }[] = [
  { name: "text-micro", size: "10px", role: "徽章微標籤" },
  { name: "text-badge", size: "10.5px", role: "徽章" },
  { name: "text-meta", size: "11px", role: "次要資訊 / 時間戳 / 欄位標題" },
  { name: "text-label", size: "11.5px", role: "Δ 值" },
  { name: "text-body", size: "12px", role: "表格文字 / 連結 / 按鈕" },
  { name: "text-cell", size: "12.5px", role: "密集儲存格 / 卡片標題" },
  { name: "text-num", size: "13px", role: "價格" },
  { name: "text-title", size: "14px", role: "面板標題" },
  { name: "text-section", size: "15px", role: "區段標題" },
];

const RADII: readonly { name: string; value: string; use: string }[] = [
  { name: "rounded-sm", value: "4px", use: "swatch / 表格 chip" },
  { name: "rounded-md", value: "6px", use: "按鈕 / 輸入 / select" },
  { name: "rounded-lg", value: "8px", use: "卡片 / 彈窗 / 面板" },
  { name: "rounded-xl", value: "12px", use: "最大的卡片" },
  { name: "rounded-full", value: "999px", use: "徽章 / pill / chip / avatar" },
];

function SwatchRow({ swatch, dark }: { swatch: Swatch; dark: boolean }) {
  return (
    <div className={cn("flex items-center justify-between gap-3 rounded-md px-3 py-2", swatch.className)}>
      <span className="text-body font-medium">{swatch.token}</span>
      <span className="num text-meta opacity-80">{dark ? swatch.dark : swatch.light}</span>
    </div>
  );
}

function SwatchColumn({ dark }: { dark: boolean }) {
  const groups: readonly { title: string; items: readonly Swatch[] }[] = [
    { title: "Surfaces", items: SURFACES },
    { title: "Semantic pairs", items: SEMANTIC },
    { title: "Destructive (≠ error)", items: DESTRUCTIVE },
    { title: "Lines", items: LINES },
    { title: "Nav — theme-invariant", items: NAV },
  ];

  return (
    <div
      // `.dark` on the wrapper is exactly how next-themes drives the app: the custom variant is
      // `&:is(.dark *)`, so everything inside this div resolves the dark column.
      className={cn("flex flex-col gap-5 rounded-lg border border-border bg-background p-4", dark && "dark")}
    >
      <p className="text-meta font-semibold tracking-widest text-muted-foreground uppercase">
        {dark ? "dark" : "light"}
      </p>
      {groups.map((group) => (
        <section key={group.title} className="flex flex-col gap-1.5">
          <h3 className="text-meta font-semibold text-muted-foreground">{group.title}</h3>
          {group.items.map((swatch) => (
            <SwatchRow key={swatch.token} swatch={swatch} dark={dark} />
          ))}
        </section>
      ))}
      <section className="flex flex-col gap-1.5">
        <h3 className="text-meta font-semibold text-muted-foreground">overlay (#11111199)</h3>
        <div className="relative h-16 overflow-hidden rounded-md bg-primary">
          <div className="absolute inset-0 flex items-center justify-center bg-overlay text-body font-medium text-white">
            modal scrim
          </div>
        </div>
      </section>
    </div>
  );
}

/**
 * The acceptance artifact for the token task: every colour pair in both themes side by side, all
 * nine type sizes, all five radii and both families. Screenshot at 1440 and diff against the .pen
 * export. Dev only — it 404s in production rather than shipping an internal reference page.
 */
export default function TokensPage() {
  if (process.env.NODE_ENV === "production") notFound();

  return (
    <div className="min-h-dvh bg-background p-8 text-foreground">
      <div className="mx-auto flex max-w-[1440px] flex-col gap-8">
        <header className="flex flex-col gap-1">
          <h1 className="text-section font-bold">Design tokens</h1>
          <p className="text-meta text-muted-foreground">
            docs/DESIGN-TOKENS.md rendered through app/globals.css. Hex labels are the values the
            design specifies; if a swatch does not match its label, globals.css has drifted.
          </p>
        </header>

        <section className="flex flex-col gap-3">
          <h2 className="text-title font-bold">Colour</h2>
          <div className="grid grid-cols-2 gap-4">
            <SwatchColumn dark={false} />
            <SwatchColumn dark />
          </div>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-title font-bold">Type scale — nine sizes, line-height normal</h2>
          <div className="flex flex-col divide-y divide-border rounded-lg border border-border bg-card">
            {TYPE.map((t) => (
              <div key={t.name} className="flex items-baseline gap-4 px-4 py-2.5">
                <span className="num w-24 shrink-0 text-meta text-muted-foreground">{t.size}</span>
                <span className="w-32 shrink-0 text-meta text-muted-foreground">{t.name}</span>
                <span className={cn("flex-1", t.name)}>
                  價格監控 Air Jordan 1 Retro High OG「Chicago」 <span className="num">HK$1,530</span>
                </span>
                <span className="shrink-0 text-meta text-muted-foreground">{t.role}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-title font-bold">Radius — Tailwind&apos;s scale, remapped</h2>
          <div className="flex flex-wrap gap-4">
            {RADII.map((r) => (
              <div key={r.name} className="flex flex-col items-center gap-2">
                <div
                  className={cn(
                    "flex size-24 items-center justify-center border border-border bg-secondary",
                    r.name,
                  )}
                >
                  <span className="num text-meta text-secondary-foreground">{r.value}</span>
                </div>
                <span className="text-meta text-muted-foreground">{r.name}</span>
                <span className="text-micro text-muted-foreground">{r.use}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-title font-bold">Families</h2>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2 rounded-lg border border-border bg-card p-4">
              <p className="text-meta font-semibold text-muted-foreground">
                font-sans — Inter + PingFang TC / Noto Sans TC / Microsoft JhengHei
              </p>
              <p className="text-section">價格監控與審批 · 產品分組 · 使用者</p>
              <p className="text-body">
                Air Jordan 1 Retro High OG「Chicago」 — 超出閾值，需人工審核
              </p>
            </div>
            <div className="flex flex-col gap-2 rounded-lg border border-border bg-card p-4">
              <p className="text-meta font-semibold text-muted-foreground">
                .num — Geist Mono, tabular-nums
              </p>
              <p className="num text-section">HK$1,530 · US 9.5 · +8.0% · 555088-101</p>
              <div className="num flex flex-col text-num">
                <span>HK$1,111.00</span>
                <span>HK$1,530.00</span>
                <span>HK$18,904.00</span>
              </div>
              <p className="text-meta text-muted-foreground">
                三行的小數點必須對齊；沒有 tabular-nums 就不會。
              </p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
