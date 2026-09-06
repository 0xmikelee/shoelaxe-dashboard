import type { RouteDoc } from "@/lib/openapi/registry";
import {
  SettingsUpdateResultWire,
  SettingsWire,
  SystemHealthWire,
} from "@/lib/schemas/wire/settings";
import { SettingsPatchBody } from "@/lib/schemas/params/settings";
import { SESSION_ERRORS, WRITE_ERRORS } from "./common";

export const getSettingsDoc = {
  operationId: "getSettings",
  method: "get",
  path: "/api/v1/settings",
  summary: "Thresholds, the system default margin, the rounding toggle",
  tags: ["settings"],
  auth: "session",
  consumedBy: "Screen 2 (系統配置)",
  response: SettingsWire,
  errors: [...SESSION_ERRORS],
  idempotency: "Safe. The same values ride on /me as a snapshot for formula previews.",
} satisfies RouteDoc;

export const updateSettingsDoc = {
  operationId: "updateSettings",
  method: "patch",
  path: "/api/v1/settings",
  summary: "Save changed settings, returning the recompute job when one was needed",
  description:
    "Gap 7. Changing a threshold, the default margin or the rounding toggle re-prices every listing " +
    "resolving to the system default, which is a worker fan-out. The server answers **202** when it " +
    "enqueued and 200 when nothing needed recomputing, with the identical body either way — so " +
    "branch on `job`, not on the status code. Without it the screen shows a green tick while prices " +
    "keep moving for the next minute.\n\n" +
    "Disabling the default margin must never retroactively unapprove a live price.",
  tags: ["settings"],
  auth: "session",
  consumedBy: "Screen 2 (儲存設定)",
  request: { body: SettingsPatchBody },
  response: SettingsUpdateResultWire,
  errors: [...WRITE_ERRORS, "job_already_running", "conflict"],
  idempotency: "Saving unchanged values writes nothing and returns `job: null`.",
  sideEffects: ["pricing_settings", "jobs (settings_recompute)", "audit_log"],
} satisfies RouteDoc;

export const getSystemHealthDoc = {
  operationId: "getSystemHealth",
  method: "get",
  path: "/api/v1/system/health",
  summary: "Screen 2's 爬蟲服務運行中 indicators — two of them, not one",
  description:
    "A stale last run means the Apps Script trigger stopped; a stale worker heartbeat means the " +
    "background service died. Same symptom in the browser, different fix, so one combined light " +
    "would be useless. Distinct from the unauthenticated `/api/health` liveness probe, which stops " +
    "querying the database after its first success.",
  tags: ["ops"],
  auth: "session",
  consumedBy: "Screen 2 (爬取排程 panel)",
  response: SystemHealthWire,
  errors: [...SESSION_ERRORS],
  idempotency: "Safe.",
} satisfies RouteDoc;

export const settingsLiveContract: RouteDoc[] = [getSettingsDoc, updateSettingsDoc];

export const settingsContract: RouteDoc[] = [getSystemHealthDoc];
