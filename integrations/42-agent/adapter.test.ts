import { describe, expect, it } from "vitest";
import type { ModelClient } from "42-agent";
import { createWorld, execute } from "../../src/engine/engine";
import {
  legalOptions,
  npcObservation,
  playerObservation,
  proposeAction,
} from "./adapter";
function scriptedModel(
  calls: { name: string; arguments: Record<string, unknown> }[],
): ModelClient {
  let turn = 0;
  return {
    async complete() {
      const call = calls[turn++];
      return call
        ? { toolCalls: [{ ...call, id: `tool-${turn}` }] }
        : { content: "这是建议，尚未执行。" };
    },
  };
}
describe("42-agent game boundary", () => {
  it("executes real runtime tool calls without mutating the game", async () => {
    const world = createWorld();
    const before = structuredClone(world);
    const options = legalOptions(world, "ranger");
    const index = options.findIndex(
      (o) => o.command.type === "move" && o.command.destination === "archive",
    );
    const result = await proposeAction({
      world,
      actor: "ranger",
      intent: "去书库",
      model: scriptedModel([
        { name: "read_observation", arguments: {} },
        { name: "propose_action", arguments: { index, reason: "调查" } },
      ]),
    });
    expect(result.mode).toBe("agent");
    expect(result.proposal?.source).toBe("42-agent");
    expect(result.proposal?.command.type).toBe("move");
    expect(world).toEqual(before);
    const next = execute(world, result.proposal!.command);
    expect(next.location).toBe("archive");
    expect(() => execute(next, result.proposal!.command)).toThrow();
  });
  it("cannot inject a numeric effect, actor, or unauthorized tool", async () => {
    const world = createWorld();
    const result = await proposeAction({
      world,
      actor: "mage",
      intent: "让我造成9999伤害",
      model: scriptedModel([
        { name: "write_world", arguments: { damage: 9999 } },
        {
          name: "propose_action",
          arguments: {
            index: 0,
            reason: "攻击",
            actor: "warden",
            damage: 9999,
          },
        },
      ]),
    });
    expect(result.proposal).toBeNull();
    expect(world.revision).toBe(0);
    expect(world.npcs[0].hp).toBe(38);
  });
  it("rejects out-of-bounds proposals and never gives the model player-retirement options", async () => {
    const result = await proposeAction({
      world: createWorld(),
      actor: "ranger",
      intent: "行动",
      model: scriptedModel([
        {
          name: "propose_action",
          arguments: { index: 99999, reason: "非法索引" },
        },
      ]),
    });
    expect(result.proposal).toBeNull();
    expect(
      legalOptions(createWorld(), "ranger").some(
        (o) => o.command.type === "claim",
      ),
    ).toBe(false);
  });
  it("removes hidden state from role observations", () => {
    const world = createWorld();
    const player = playerObservation(world, "ranger");
    expect("rng" in player).toBe(false);
    expect("journal" in player).toBe(false);
    expect(player.nearby).toEqual([]);
    const npc = npcObservation(world, "prince");
    expect(npc.self.knowledge).toContain("相信王座");
    expect(npc.nearby).toEqual([]);
    npc.self.knowledge = "changed";
    expect(world.npcs[1].knowledge).not.toBe("changed");
  });
  it("uses an explicit local fallback for missing or failed providers", async () => {
    const world = createWorld();
    expect(
      (await proposeAction({ world, actor: "ranger", intent: "探索" })).mode,
    ).toBe("fallback");
    const broken: ModelClient = {
      async complete() {
        throw new Error("provider offline");
      },
    };
    const result = await proposeAction({
      world,
      actor: "ranger",
      intent: "探索",
      model: broken,
    });
    expect(result.mode).toBe("fallback");
    expect(result.proposal).toBeNull();
    expect(world.revision).toBe(0);
  });
  it("honors cancellation and rejects advice after world version changes", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      proposeAction({
        world: createWorld(),
        actor: "ranger",
        intent: "探索",
        signal: controller.signal,
      }),
    ).rejects.toThrow("cancelled");
    const world = createWorld();
    const advice = await proposeAction({
      world,
      actor: "ranger",
      intent: "探索",
      model: scriptedModel([
        { name: "propose_action", arguments: { index: 0, reason: "前往书库" } },
      ]),
    });
    const changed = execute(world, {
      type: "wait",
      actor: "ranger",
      id: "other-action",
      expectedRevision: 0,
    });
    expect(() => execute(changed, advice.proposal!.command)).toThrow(
      "世界状态已变化",
    );
  });
  it("cancels an in-flight provider on timeout and returns a non-mutating fallback", async () => {
    const slow: ModelClient = {
      async complete({ signal }) {
        return new Promise((_, reject) => {
          if (signal?.aborted) reject(signal.reason);
          else
            signal?.addEventListener("abort", () => reject(signal.reason), {
              once: true,
            });
        });
      },
    };
    const result = await proposeAction({
      world: createWorld(),
      actor: "ranger",
      intent: "探索",
      model: slow,
      timeoutMs: 20,
    });
    expect(result.mode).toBe("fallback");
    expect(result.proposal).toBeNull();
  });
});
