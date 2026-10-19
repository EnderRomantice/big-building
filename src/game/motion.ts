import { useCallback, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { flushSync } from "react-dom";

let active: ViewTransition | undefined;
let pending: (() => void) | undefined;
let queue: (() => void)[] = [];

// Only visual state uses snapshots; commands and requests keep their normal timing.
export function animateUi(update: () => void) {
  if (
    !document.startViewTransition ||
    document.visibilityState === "hidden" ||
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  ) {
    pending?.();
    active?.skipTransition();
    update();
    return;
  }
  queue.push(update);
  if (queue.length > 1) return;
  queueMicrotask(() => {
    const updates = queue;
    queue = [];
    // Finish a pending DOM update before taking the next snapshot on rapid input.
    pending?.();
    active?.skipTransition();
    let applied = false;
    const commit = () => {
      if (applied) return;
      applied = true;
      if (pending === commit) pending = undefined;
      flushSync(() => updates.forEach((apply) => apply()));
    };
    pending = commit;
    try {
      const transition = document.startViewTransition(commit);
      active = transition;
      void transition.ready.catch(() => {});
      void transition.finished
        .catch(() => {})
        .finally(() => {
          commit();
          if (active === transition) active = undefined;
        });
    } catch {
      commit();
    }
  });
}

export function useMotionState<T>(
  initial: T,
): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState(initial);
  const requested = useRef<T | symbol>(initial);
  const setAnimated = useCallback<Dispatch<SetStateAction<T>>>((next) => {
    if (typeof next !== "function" && Object.is(requested.current, next))
      return;
    requested.current = typeof next === "function" ? Symbol() : next;
    animateUi(() => setValue(next));
  }, []);
  return [value, setAnimated];
}
