import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";

/**
 * Phase 1 screen. Its only job is to prove the bundled ffmpeg sidecar can be
 * executed, and to make the design tokens visible from the very first run.
 */

type CheckState =
  | { status: "idle" }
  | { status: "running" }
  | { status: "ok"; version: string }
  | { status: "error"; message: string };

export default function App() {
  const [check, setCheck] = useState<CheckState>({ status: "idle" });

  async function runCheck() {
    setCheck({ status: "running" });
    try {
      const version = await invoke<string>("check_ffmpeg");
      setCheck({ status: "ok", version });
    } catch (error) {
      // The Rust side always sends a finished Czech sentence. The raw failure
      // is already in the console; never put terminal output in the UI.
      console.error("check_ffmpeg failed:", error);
      setCheck({
        status: "error",
        message:
          typeof error === "string"
            ? error
            : "Chybí součást aplikace. Spusť prosím `scripts/fetch-binaries.sh`.",
      });
    }
  }

  return (
    <main className="min-h-screen bg-bg px-6 py-16">
      <div className="mx-auto flex max-w-content flex-col gap-8">
        <header className="flex flex-col gap-3">
          <p className="label">Interní nástroj</p>
          <h1 className="step-title">Video Kompresor</h1>
          <p className="text-text-muted">
            Připraví video pro web — menší soubor, rychlejší načtení, stejný
            dojem z obrazu.
          </p>
        </header>

        <section className="flex flex-col gap-6 rounded-card border border-border bg-surface p-6">
          <div className="flex flex-col gap-2">
            <h2 className="font-medium text-text">Kontrola instalace</h2>
            <p className="text-text-muted">
              Ověří, že je aplikace kompletní a umí zpracovávat video.
            </p>
          </div>

          <div>
            <button
              type="button"
              onClick={runCheck}
              disabled={check.status === "running"}
              className="focus-ring inline-flex items-center gap-2 rounded-card bg-accent px-5 py-3 font-medium text-bg transition-colors duration-hover hover:bg-accent-soft hover:text-accent disabled:cursor-not-allowed disabled:opacity-60"
            >
              {check.status === "running" && (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              )}
              {check.status === "running"
                ? "Kontroluji…"
                : "Zkontrolovat ffmpeg"}
            </button>
          </div>

          {check.status === "ok" && (
            <Result tone="success" icon={<CheckCircle2 className="h-5 w-5" aria-hidden="true" />}>
              <p className="font-medium text-text">Vše je v pořádku.</p>
              <p className="font-mono text-text-muted">{check.version}</p>
            </Result>
          )}

          {check.status === "error" && (
            <Result tone="danger" icon={<AlertTriangle className="h-5 w-5" aria-hidden="true" />}>
              <p className="font-medium text-text">Něco chybí.</p>
              <p className="text-text-muted">{check.message}</p>
            </Result>
          )}
        </section>
      </div>
    </main>
  );
}

function Result({
  tone,
  icon,
  children,
}: {
  tone: "success" | "danger";
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div
      role="status"
      className="flex items-start gap-3 rounded-input border border-border bg-surface-2 p-4"
    >
      <span className={tone === "success" ? "text-success" : "text-danger"}>
        {icon}
      </span>
      <div className="flex flex-col gap-1">{children}</div>
    </div>
  );
}
