# Design tokens — extracted from shoelaxe-dashboard.pen

Read out of the pen.dev variables panel and cross-checked against the HTML+Tailwind export of
Screens 8/9 on 2026-08-23. The `.pen` file stays the visual source of truth; this file is the
machine-readable half of it, and it is what `app/globals.css` should be generated from.

The variable names are **shadcn/ui's vocabulary verbatim** (`--background`, `--foreground`, `--card`,
`--muted`, `--primary`, `--destructive`, `--ring`, `--sidebar-*`). That is not a coincidence to
work around — it is the strongest signal in the design about how to implement it.

## Colour

| Token | Light | Dark |
|---|---|---|
| `--background` | `#F2F3F0` | `#111111` |
| `--foreground` | `#111111` | `#FFFFFF` |
| `--card` | `#FFFFFF` | `#1A1A1A` |
| `--card-foreground` | `#111111` | `#FFFFFF` |
| `--popover` | `#FFFFFF` | `#1A1A1A` |
| `--popover-foreground` | `#111111` | `#FFFFFF` |
| `--primary` | `#FF8400` | `#FF8400` |
| `--primary-foreground` | `#111111` | `#111111` |
| `--secondary` | `#E7E8E5` | `#2E2E2E` |
| `--secondary-foreground` | `#111111` | `#FFFFFF` |
| `--muted` | `#F2F3F0` | `#2E2E2E` |
| `--muted-foreground` | `#666666` | `#B8B9B6` |
| `--accent` | `#F2F3F0` | `#111111` |
| `--accent-foreground` | `#111111` | `#F2F3F0` |
| `--border` | `#CBCCC9` | `#2E2E2E` |
| `--input` | `#CBCCC9` | `#2E2E2E` |
| `--ring` | `#666666` | `#666666` |
| `--destructive` | `#D93C15` | `#FF5C33` |
| `--black` / `--white` | `#000000` / `#FFFFFF` | same |

### Semantic pairs

Each is a tinted background plus a saturated foreground. Used for badges, callouts and Δ values.

| Token | Light bg | Light fg | Dark bg | Dark fg |
|---|---|---|---|---|
| success | `#DFE6E1` | `#004D1A` | `#222924` | `#B6FFCE` |
| warning | `#E9E3D8` | `#804200` | `#291C0F` | `#FF8400` |
| error | `#E5DCDA` | `#8C1C00` | `#24100B` | `#FF5C33` |
| info | `#DFDFE6` | `#000066` | `#222229` | `#B2B2FF` |

### Sidebar — always dark

There are two sidebar sets. The `--sidebar-dark-*` group is **identical in light and dark mode**, and
the export confirms it is the one actually used: the shell renders `bg-[#0F1117]` with `#94A3B8` text
even on the light canvas. So the navigation rail is permanently dark and does not follow the theme.

| Token | Value (both modes) |
|---|---|
| `--sidebar-dark` | `#0F1117` |
| `--sidebar-dark-text` | `#94A3B8` |
| `--sidebar-dark-active` | `#1E293B` |
| `--sidebar-dark-active-text` | `#FFFFFF` |

The theme-following `--sidebar`, `--sidebar-accent`, `--sidebar-border`, `--sidebar-foreground`,
`--sidebar-primary`, `--sidebar-ring` set also exists but is unused by the current screens. Keep the
variables, implement the dark rail.

### Overlay

Modal scrim is `#11111199` — `--foreground` at 60%.

## Type

Three families are declared; **two are actually used**, and the third is a trap:

| Token | Declared | Actually used in the export |
|---|---|---|
| `--font-ui` | Inter | ✅ `Inter, system-ui, sans-serif` — all labels and prose |
| `--font-primary` | JetBrains Mono | ❌ never emitted |
| `--font-secondary` | Geist | ⚠️ emitted as **`'Geist Mono', system-ui, sans-serif`** |

Ship **Inter** and **Geist Mono**. Do not load JetBrains Mono or proportional Geist; the variables are
stale relative to the design. Raise it with the designer, but build what the screens render.

**The mono rule is the single most characterful thing about this UI, and it is mechanical:** every
number is mono, everything else is Inter. Prices (`HK$1,530`), sizes (`US 9`), quantities (`2 雙`),
percentages, deltas, SKUs, dates (`2026-08-12`) and times (`14:32`) are all Geist Mono. Column
headers, labels, prose and button text are Inter.

### Scale

Dense, small, and half-step — this is a data tool, not a marketing page. Sizes in use: 10, 10.5, 11,
11.5, 12, 12.5, 13, 14, 15px. Line height is `normal` throughout; there is no type-scale ramp to
invent, so define these as explicit tokens rather than mapping onto Tailwind's default `text-sm`/`base`.

| Role | Size | Weight | Colour |
|---|---|---|---|
| Section heading (價格變更紀錄, 上架圖片) | 15px | bold | foreground |
| Card title (US 9 的價格來源) | 12.5px | bold | foreground |
| Table column header | 11–12px | semibold | muted-foreground |
| Table cell — text | 12–12.5px | normal/medium | foreground |
| Table cell — number | 12.5–13px | medium/bold, **mono** | foreground |
| Price (emphasis) | 13px | bold, mono | foreground |
| Δ value | 11.5–12px | semibold/bold, mono | success-fg or error-fg |
| Secondary / meta / timestamps | 11–11.5px | normal | muted-foreground |
| Micro label inside a badge | 10–10.5px | semibold | semantic fg |
| Inline action link (編輯, 查看全部紀錄) | 12px | semibold | primary |

## Radius

`--radius-none: 0`, `--radius-m: 16`, `--radius-pill: 999`.

The `16` is **not** what the screens use. Observed, by frequency: `999px` (badges, pills, chips — 30
uses), `8px` (26), `6px` (21), `4px` (18), `12px` (6). Implement the observed scale:

| Use | Radius |
|---|---|
| Badge / pill / chip / avatar | `999px` |
| Card, modal, panel | `8px` (occasionally `12px` for the largest cards) |
| Button, input, select | `6px` |
| Small inner element, swatch, table chip | `4px` |

## Spacing

Gaps in use: 2, 3, 4, 5, 6, 8, 9, 10, 12, 14, 16, 20, 24px. Padding is written as explicit pairs
rather than a uniform scale:

| Element | Padding |
|---|---|
| Page content | `20px`, section blocks `24px`, widest cards `32px` |
| Card | `20px` or `24px` |
| Topbar | `0 32px` |
| Nav item | `12px` |
| Button (default) | `6px 12px`; large `9px 16px`; compact `6px 10px` |
| Badge | `2px 7px` / `3px 7px` / `3px 8px` / `4px 9px` |
| Table row | `9px 10px` / `12px 16px` / `14px 16px` |

## Layout

- Design canvas is **1440px** wide. Screen 8 is 1440 × 1784.
- Sidebar **240px**, fixed, dark, `p-4`; sections labelled 主選單 and 系統, each nav item an icon
  (20px) plus label, active row filled `#1E293B`.
- Content column fills the rest; white topbar (`0 32px`) above a `20px`-padded scroll area.
- Screen 8's detail layout is a two-column split with a `400px` right rail (images, product info).
- Modals are **560px** wide: header (title + subtitle + 18px close), `16px` body, footer with a
  ghost 取消 and a primary action.
- Table columns are fixed-width (`88px`, `100px`, `120px`, `360px`, `712px` all appear), not fluid.
- Icons: 11, 12, 13, 14, 18, 20px. 14px inside buttons and callouts, 20px in nav.

## Named components in the file

The design already factors these, and the component layer should mirror the names:
`component/Nav Item`, `component/Metric Card`, `component/Action Button`, `component/Status Badge`,
`component/Info Tooltip`, plus `Product Info Card` and `Listing Images Card` on Screen 8.

## Housekeeping found in the file

- Two orphaned `低於平台底價` text layers are still parked at the canvas origin — leftovers from the
  removed floor-price badges. Still to be deleted.
- `images/image.png` and `images/shoelaxe_logo.webp` both report as empty assets in the share view.
