"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  CheckCircle2,
  Loader2,
  LockKeyhole,
  Mail,
  ShieldCheck,
  AlertCircle,
  Eye,
  EyeOff
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

import styles from "./Login.module.css";

function safeNextPath(value: string | null) {
  if (!value || !value.startsWith("/")) return "/";
  return value;
}

export function Login() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  const nextPath = safeNextPath(searchParams.get("next"));
  const initialMessage = searchParams.get("message") || searchParams.get("confirmed");
  const initialError = searchParams.get("error");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loadingMode, setLoadingMode] = useState<"signin" | null>(null);
  const [error, setError] = useState<string | null>(initialError);
  const [message, setMessage] = useState<string | null>(
    initialMessage === "1" ? "Email confirmed. You can sign in now." : initialMessage
  );

  async function handleSignIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoadingMode("signin");
    setError(null);
    setMessage(null);

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (signInError) {
      setError(signInError.message);
      setLoadingMode(null);
      return;
    }

    router.push(nextPath);
    router.refresh();
  }

  return (
    <main className={styles.page}>

      {/* =========================================
          LEFT SIDE: Dark Midnight/Slate Area
          ========================================= */}
      <section className={styles.leftSide}>
        <div className={styles.backgroundAmbience} aria-hidden="true">
          <div className={styles.orbPrimary} />
          <div className={styles.orbSecondary} />
          <div className={styles.gridOverlay} />
        </div>

        <div className={styles.leftContent}>
          <div className={styles.badge}>
            <ShieldCheck className={styles.badgeIcon} />
            <span>Secure procurement workflow</span>
          </div>

          <div className={styles.headingGroup}>
            <h1 className={styles.title}>Sign in before you process client packet cases.</h1>
            <p className={styles.description}>
              This workspace runs with authenticated access. Sign in to upload
              procurement packets, extract fields, verify document data, and securely save results to your workspace.
            </p>
          </div>

          <div className={styles.featureGrid}>
            <div className={styles.featureCard}>
              <div className={styles.featureTitle}>Login-protected</div>
              <div className={styles.featureBody}>
                Unauthenticated visitors are safely redirected here.
              </div>
            </div>
            <div className={styles.featureCard}>
              <div className={styles.featureTitle}>User-owned cases</div>
              <div className={styles.featureBody}>
                Processed packets are securely saved to your account.
              </div>
            </div>
            <div className={styles.featureCard}>
              <div className={styles.featureTitle}>Server-side APIs</div>
              <div className={styles.featureBody}>
                Sensitive network routes require a valid session.
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* =========================================
          RIGHT SIDE: Action / Form Area
          ========================================= */}
      <section className={styles.rightSide}>
        <div className={styles.panelWrapper}>
          <div className={styles.panel}>
            <header className={styles.panelHeader}>
              <h2 className={styles.panelTitle}>Access Workspace</h2>
              <p className={styles.panelDescription}>
                Enter your credentials to continue to your dashboard.
              </p>
            </header>
            <form className={styles.form} onSubmit={handleSignIn}>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>Email Address</span>
                <div className={styles.inputWrap}>
                  <Mail className={styles.fieldIcon} />
                  <Input
                    type="email"
                    required
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="you@company.com"
                    className={styles.input}
                  />
                </div>
              </label>

              <label className={styles.field}>
                <div className={styles.labelRow}>
                  <span className={styles.fieldLabel}>Password</span>
                  <a href="/forgot-password" className={styles.forgotPassword} onClick={(e) => { e.preventDefault(); }}>
                    Forgot password?
                  </a>
                </div>
                <div className={styles.inputWrap}>
                  <LockKeyhole className={styles.fieldIcon} />
                  <Input
                    type={showPassword ? "text" : "password"}
                    required
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="••••••••"
                    className={styles.input}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className={styles.togglePassword}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff /> : <Eye />}
                  </button>
                </div>
              </label>

              <Button type="submit" className={styles.submitButton} disabled={loadingMode !== null}>
                {loadingMode === "signin" ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Authenticating...
                  </>
                ) : (
                  "Sign In to Workspace"
                )}
              </Button>
            </form>

            {message && (
              <div className={`${styles.feedback} ${styles.success}`}>
                <CheckCircle2 className={styles.feedbackIcon} />
                <span>{message}</span>
              </div>
            )}

            {error && (
              <div className={`${styles.feedback} ${styles.error}`}>
                <AlertCircle className={styles.feedbackIcon} />
                <span>{error}</span>
              </div>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
