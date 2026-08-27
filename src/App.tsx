import { useCallback, useMemo, useReducer, useState } from "react";
import type { KeyboardEvent } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ArrowLeft, ArrowRight } from "lucide-react";

import type { StepId } from "./types";
import { Stepper } from "./components/Stepper";
import { Button } from "./components/ui/Button";
import { AudioStep } from "./components/steps/AudioStep";
import { FrameRateStep } from "./components/steps/FrameRateStep";
import { OutputStep } from "./components/steps/OutputStep";
import { ProgressStep } from "./components/steps/ProgressStep";
import { QualityStep } from "./components/steps/QualityStep";
import { ResolutionStep } from "./components/steps/ResolutionStep";
import { SourceStep, hasAcceptedExtension } from "./components/steps/SourceStep";
import { SpeedStep } from "./components/steps/SpeedStep";
import { SummaryStep } from "./components/steps/SummaryStep";
import { useEncoder } from "./hooks/useEncoder";
import { useVideoMetadata } from "./hooks/useVideoMetadata";
import { baseName } from "./lib/format";
import { estimateSizeForConfig } from "./lib/size";
import {
  STEPS,
  configFromState,
  initialState,
  isStepValid,
  stepIndex,
  wizardReducer,
} from "./lib/wizard";

/**
 * The wizard shell: one step on screen at a time, a stepper above it and the
 * two navigation buttons below. Every decision about what may happen next
 * comes out of `lib/wizard.ts`; this file only draws it.
 */

const UNSUPPORTED = "Tento typ souboru neumím zpracovat. Zkus MP4, MOV nebo AVI.";

export default function App() {
  const [state, dispatch] = useReducer(wizardReducer, initialState);
  const { loading, error: probeError, probe, reset: resetProbe } = useVideoMetadata();
  const encoder = useEncoder();

  const [uiError, setUiError] = useState<string | null>(null);
  const [overwriteAsked, setOverwriteAsked] = useState(false);

  const meta = state.metadata;
  const valid = isStepValid(state, state.step);
  const onLastStep = state.step === "summary";
  const running = state.step === "progress";

  const definition = STEPS[stepIndex(state.step)];

  const pickFile = useCallback(
    async (path: string) => {
      setUiError(null);
      if (!hasAcceptedExtension(path)) {
        setUiError(UNSUPPORTED);
        return;
      }
      const metadata = await probe(path);
      if (metadata) dispatch({ type: "metadataLoaded", metadata });
    },
    [probe],
  );

  const config = useMemo(() => configFromState(state), [state]);

  /** Runs the encode for real — or, in this phase, convincingly pretends to. */
  const runEncode = useCallback(() => {
    if (!config || !meta) return;
    setOverwriteAsked(false);

    encoder.start(config, {
      durationSeconds: meta.durationSeconds,
      originalSizeBytes: meta.fileSizeBytes,
      estimatedSizeBytes: estimateSizeForConfig(config, {
        width: meta.width,
        height: meta.height,
        fps: state.fps,
        durationSeconds: meta.durationSeconds,
      }),
      poster: state.poster,
    });

    dispatch({ type: "goToStep", step: "progress" });
  }, [config, meta, encoder, state.fps, state.poster]);

  /** The final button: asks before it would overwrite something. */
  async function startEncode() {
    if (!config) return;

    try {
      const exists = await invoke<boolean>("file_exists", { path: config.outputPath });
      if (exists) {
        setOverwriteAsked(true);
        return;
      }
    } catch (cause) {
      // A failed existence check must not block the encode; ffmpeg overwrites
      // anyway and the user would only see an unexplained dead button.
      console.error("file_exists failed:", cause);
    }

    runEncode();
  }

  function startOver() {
    encoder.reset();
    resetProbe();
    setUiError(null);
    dispatch({ type: "reset" });
  }

  /**
   * Enter advances the wizard, so the whole thing can be driven from the
   * keyboard. Buttons and links keep their own meaning for the key.
   */
  function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key !== "Enter" || event.defaultPrevented || running) return;

    const target = event.target as HTMLElement;
    if (target.closest("button") || target.closest("a")) return;
    if (!valid) return;

    event.preventDefault();
    if (onLastStep) void startEncode();
    else dispatch({ type: "next" });
  }

  return (
    <main className="min-h-screen bg-bg px-6 py-10" onKeyDown={handleKeyDown}>
      <div className="mx-auto flex max-w-content flex-col gap-10">
        {!running && <Stepper state={state} onJump={(step) => dispatch({ type: "goToStep", step })} />}

        <section
          // Re-keying on the step is what makes the transition play: React
          // remounts the panel, and the animation runs from its first frame.
          key={state.step}
          className="animate-step flex flex-col gap-8"
        >
          <header className="flex flex-col gap-1">
            <h1 className="step-title">
              {running ? "Průběh" : (definition?.title ?? "")}
            </h1>
            {!running && <StepHint step={state.step} />}
          </header>

          {renderStep()}
        </section>

        {!running && (
          <footer className="flex items-center justify-between gap-4">
            <Button
              variant="ghost"
              onClick={() => dispatch({ type: "back" })}
              disabled={stepIndex(state.step) === 0}
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              Zpět
            </Button>

            {!onLastStep && (
              <Button
                variant="primary"
                onClick={() => dispatch({ type: "next" })}
                disabled={!valid}
              >
                Pokračovat
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Button>
            )}
          </footer>
        )}
      </div>

      {overwriteAsked && config && (
        <OverwriteDialog
          fileName={baseName(config.outputPath)}
          onOverwrite={runEncode}
          onRename={() => {
            setOverwriteAsked(false);
            dispatch({ type: "goToStep", step: "output" });
          }}
        />
      )}
    </main>
  );

  function renderStep() {
    switch (state.step) {
      case "source":
        return (
          <SourceStep
            metadata={meta}
            loading={loading}
            error={uiError ?? probeError}
            onPick={pickFile}
            onError={setUiError}
          />
        );

      case "resolution":
        return meta ? (
          <ResolutionStep state={state} meta={meta} dispatch={dispatch} />
        ) : null;

      case "framerate":
        return meta ? (
          <FrameRateStep state={state} meta={meta} dispatch={dispatch} />
        ) : null;

      case "quality":
        return meta ? (
          <QualityStep state={state} meta={meta} dispatch={dispatch} />
        ) : null;

      case "speed":
        return <SpeedStep state={state} dispatch={dispatch} />;

      case "audio":
        return <AudioStep state={state} dispatch={dispatch} />;

      case "output":
        return meta ? (
          <OutputStep
            state={state}
            meta={meta}
            dispatch={dispatch}
            onError={setUiError}
          />
        ) : null;

      case "summary":
        return meta ? (
          <SummaryStep
            state={state}
            meta={meta}
            onEdit={(step) => dispatch({ type: "goToStep", step })}
            onStart={startEncode}
          />
        ) : null;

      case "progress":
        return meta ? (
          <ProgressStep
            state={state}
            meta={meta}
            encoder={encoder}
            onBackToSummary={() => {
              encoder.reset();
              dispatch({ type: "goToStep", step: "summary" });
            }}
            onStartOver={startOver}
          />
        ) : null;
    }
  }
}

/** One quiet sentence under each step title. */
function StepHint({ step }: { step: StepId }) {
  const hints: Partial<Record<StepId, string>> = {
    source: "Přetáhni video do okna, nebo ho vyber v počítači.",
    resolution: "Jak velký má být obraz na webu.",
    framerate: "Kolik snímků za sekundu má výsledné video mít.",
    quality: "Čím níž, tím menší soubor. Rozdíl bývá menší, než čekáš.",
    speed: "Jak dlouho si aplikace může hrát s hledáním úspor.",
    audio: "Co se má stát se zvukovou stopou.",
    output: "Kam soubor uložit a jestli k němu chceš i náhledový obrázek.",
    summary: "Zkontroluj nastavení a spusť kompresi.",
  };

  const hint = hints[step];
  return hint ? <p className="text-text-muted">{hint}</p> : null;
}

/** „Soubor už existuje" — the one modal in the app. */
function OverwriteDialog({
  fileName,
  onOverwrite,
  onRename,
}: {
  fileName: string;
  onOverwrite: () => void;
  onRename: () => void;
}) {
  return (
    <div className="fixed inset-0 flex items-center justify-center bg-overlay px-6">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="overwrite-title"
        className="flex w-full max-w-content flex-col gap-6 rounded-card border border-border bg-surface p-6"
      >
        <div className="flex flex-col gap-2">
          <h2 id="overwrite-title" className="step-title">
            Soubor už existuje
          </h2>
          <p className="text-text-muted">
            V cílové složce už je soubor <span className="font-mono text-text">{fileName}</span>.
            Co s ním?
          </p>
        </div>

        <div className="flex justify-end gap-3">
          <Button onClick={onRename}>Zvolit jiný název</Button>
          <Button variant="primary" onClick={onOverwrite}>
            Přepsat
          </Button>
        </div>
      </div>
    </div>
  );
}
