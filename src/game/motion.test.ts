import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("react-dom", () => ({ flushSync: (update: () => void) => update() }));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

async function setup(reduced = false, supported = true) {
  const transitions: {
    update: () => void;
    skipTransition: ReturnType<typeof vi.fn>;
    finish: () => void;
  }[] = [];
  const startViewTransition = vi.fn((update: () => void) => {
    let finish!: () => void;
    const finished = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const transition = { update, skipTransition: vi.fn(), finish };
    transitions.push(transition);
    return {
      ready: Promise.resolve(),
      finished,
      skipTransition: transition.skipTransition,
    };
  });
  vi.stubGlobal("document", {
    visibilityState: "visible",
    startViewTransition: supported ? startViewTransition : undefined,
  });
  vi.stubGlobal("window", { matchMedia: () => ({ matches: reduced }) });
  const { animateUi } = await import("./motion");
  return { animateUi, transitions, startViewTransition };
}

describe("visual transitions", () => {
  it.each([
    [true, true],
    [false, false],
  ])(
    "updates immediately with reduced motion or unsupported snapshots (%s, %s)",
    async (reduced, supported) => {
      const { animateUi, startViewTransition } = await setup(
        reduced,
        supported,
      );
      const update = vi.fn();
      animateUi(update);
      expect(update).toHaveBeenCalledOnce();
      expect(startViewTransition).not.toHaveBeenCalled();
    },
  );

  it("batches related changes and commits rapid switches in order, exactly once even if old snapshots finish late", async () => {
    const { animateUi, transitions } = await setup();
    const results: string[] = [];
    animateUi(() => results.push("map"));
    animateUi(() => results.push("cancel target"));
    await Promise.resolve();
    expect(transitions).toHaveLength(1);
    animateUi(() => results.push("character"));
    await Promise.resolve();
    expect(results).toEqual(["map", "cancel target"]);
    expect(transitions[0].skipTransition).toHaveBeenCalledOnce();
    transitions[1].update();
    transitions[0].update();
    transitions.forEach((transition) => transition.finish());
    await Promise.resolve();
    expect(results).toEqual(["map", "cancel target", "character"]);
  });
});
