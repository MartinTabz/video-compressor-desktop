import { useEffect, useState } from "react";
import { getCurrentWebview } from "@tauri-apps/api/webview";

/**
 * Files dropped onto the window.
 *
 * The webview's own HTML drop events never fire while Tauri's native drag-drop
 * is enabled, so the platform event is the only way to learn the real path of
 * what was dropped.
 */
export function useFileDrop(
  onDrop: (paths: string[]) => void,
  enabled = true,
): { isOver: boolean } {
  const [isOver, setIsOver] = useState(false);

  useEffect(() => {
    if (!enabled) {
      setIsOver(false);
      return;
    }

    let unlisten: (() => void) | undefined;
    let cancelled = false;

    getCurrentWebview()
      .onDragDropEvent((event) => {
        if (event.payload.type === "enter" || event.payload.type === "over") {
          setIsOver(true);
          return;
        }

        setIsOver(false);

        if (event.payload.type === "drop") {
          onDrop(event.payload.paths);
        }
      })
      .then((dispose) => {
        // The step may have moved on while the listener was being registered.
        if (cancelled) dispose();
        else unlisten = dispose;
      })
      .catch((cause) => {
        console.error("drag-drop listener failed:", cause);
      });

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [onDrop, enabled]);

  return { isOver };
}
