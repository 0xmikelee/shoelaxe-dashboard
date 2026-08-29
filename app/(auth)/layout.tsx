import { redirect } from "next/navigation";

import { createServerSupabase } from "@/lib/auth/server";
import { zhHant } from "@/lib/i18n/zh-Hant";

export const metadata = { title: zhHant.auth.title };

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createServerSupabase();
  if (supabase) {
    const { data } = await supabase.auth.getUser();
    if (data.user) redirect("/approvals");
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background p-6">
      {children}
    </div>
  );
}
