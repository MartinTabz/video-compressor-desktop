import type { WizardState } from "../../types";
import type { WizardAction } from "../../lib/wizard";
import { Choice } from "../ui/Choice";

/**
 * Two questions, the second revealed only once the first is answered „Ano".
 * Asking about music up front would make no sense to someone who has already
 * decided the video is silent.
 */
interface AudioStepProps {
  state: WizardState;
  dispatch: (action: WizardAction) => void;
}

const NO_AUDIO_HINT =
  "Video na pozadí nebo animace zvuk většinou nepotřebuje. Ušetříš tím místo.";

export function AudioStep({ state, dispatch }: AudioStepProps) {
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-3">
        <p className="text-text">Potřebuje video zvuk?</p>
        <Choice
          ariaLabel="Potřebuje video zvuk?"
          value={state.audioWanted}
          options={[
            { value: true, label: "Ano" },
            { value: false, label: "Ne" },
          ]}
          onChange={(wanted) => dispatch({ type: "setAudioWanted", wanted })}
        />
        {state.audioWanted === false && (
          <p className="text-text-muted">{NO_AUDIO_HINT}</p>
        )}
      </div>

      {state.audioWanted === true && (
        <div className="flex animate-step flex-col gap-3">
          <p className="text-text">Je ve videu hudba?</p>
          <Choice
            ariaLabel="Je ve videu hudba?"
            value={state.audioMusic}
            options={[
              { value: false, label: "Ne (jen mluvené slovo)" },
              { value: true, label: "Ano (hudba nebo ruchy)" },
            ]}
            onChange={(music) => dispatch({ type: "setAudioMusic", music })}
          />
          <p className="text-text-muted">
            {state.audioMusic === true
              ? "Zvuk zůstane stereo ve vyšší kvalitě."
              : "Mluvené slovo uložíme v mono – zní stejně a zabere méně místa."}
          </p>
        </div>
      )}

      {state.audioWanted === null && (
        <p className="text-text-muted">Vyber jednu z možností a pokračuj dál.</p>
      )}
    </div>
  );
}
