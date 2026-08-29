"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

import { Button } from "@/components/ui/button";
import { createBrowserSupabase, isGoogleProviderEnabled } from "@/lib/auth/browser";
import { AUTH_REQUIRED, isSupabaseConfigured, MOCKS_ENABLED } from "@/lib/public-env";
import { zhHant } from "@/lib/i18n/zh-Hant";

const t = zhHant.auth;

function LoginForm() {
  const params = useSearchParams();
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<"provider" | "disabled" | null>(null);
  const reason = params.get("reason");
  const configured = isSupabaseConfigured();
  const showDevBypass = MOCKS_ENABLED && !AUTH_REQUIRED;

  const signIn = async () => {
    const supabase = createBrowserSupabase();
    if (!supabase) return;
    setPending(true);
    setFailure(null);

    const enabled = await isGoogleProviderEnabled();
    if (enabled === false) {
      setPending(false);
      setFailure("disabled");
      return;
    }

    // Let supabase-js navigate. A manual fetch of the authorize URL (to probe a disabled
    // provider) consumes the PKCE challenge, so the later callback cannot exchange the code.
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) {
      setPending(false);
      setFailure("provider");
    }
  };

  return (
    <section className="flex w-full max-w-sm flex-col gap-4 rounded-lg border border-border bg-card p-6">
      <h1 className="text-title font-bold">{t.title}</h1>
      <p className="text-body text-muted-foreground">{t.subtitle}</p>
      {reason === "expired" ? (
        <p className="text-meta text-warning-foreground">{zhHant.shell.sessionExpired}</p>
      ) : null}
      {failure === "disabled" ? (
        <p className="text-meta text-error-foreground">{t.providerDisabled}</p>
      ) : params.get("error") === "invalid_key" ? (
        <p className="text-meta text-error-foreground">{t.invalidApiKey}</p>
      ) : failure === "provider" || params.get("error") ? (
        <p className="text-meta text-error-foreground">{t.providerError}</p>
      ) : null}
      {configured ? (
        <Button onClick={() => void signIn()} disabled={pending}>
          {pending ? t.signingIn : t.signInWithGoogle}
        </Button>
      ) : null}
      {showDevBypass ? (
        <Button asChild variant={configured ? "outline" : "default"}>
          <a href="/approvals">{t.continueAsDev}</a>
        </Button>
      ) : null}
      <p className="text-meta text-muted-foreground">{t.allowList}</p>
      <p className="text-meta text-muted-foreground">
        {t.noAccess} {t.contactAdmin}
      </p>
      <p className="text-meta text-muted-foreground">{t.terms}</p>
    </section>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
