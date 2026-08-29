import type { Metadata } from "next";

import { SettingsClient } from "./settings-client";
import { zhHant } from "@/lib/i18n/zh-Hant";

export const metadata: Metadata = { title: zhHant.settings.title };

export default function SettingsPage() {
  return <SettingsClient />;
}
