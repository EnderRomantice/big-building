import { describe, expect, it } from "vitest";
import type { ModelClient, ModelRequest } from "42-agent";
import {
  createWorld,
  ensureAdventure,
  execute,
  replay,
  toReplay,
} from "../../src/engine/engine";
import type { Command, World } from "../../src/engine/types";
import type { ActionPayload } from "../../src/engine/actions";
import { finishByRules } from "../../src/engine/turn";
import type { TurnDecision } from "../../src/engine/turn";
import { runTurn, turnObservation } from "./turn";
function command(world: World, action: ActionPayload): Command {
  return {
    ...action,
    actor: "ranger",
    id: crypto.randomUUID(),
    expectedRevision: world.revision,
  };
}
function atSmithy() {
  let world = ensureAdventure(createWorld());
  world = execute(
    world,
    command(world, { type: "move", destination: "smithy" }),
  );
  return finishByRules(world).reduce(execute, world);
}
function model(
  decisions: TurnDecision[],
  requests: ModelRequest[] = [],
): ModelClient {
  return {
    async complete(request) {
      requests.push(request);
      const decision = decisions.shift();
      return decision
        ? {
            toolCalls: [
              {
                id: crypto.randomUUID(),
                name: "npc_action",
                arguments: { ...decision },
              },
            ],
          }
        : { content: "结束。" };
    },
  };
}
describe("real runtime NPC loop", () => {
  it("records direct dialogue and passes previous conversation to the next independent NPC session", async () => {
    const before = atSmithy();
    const result = await runTurn({
      world: before,
      command: command(before, {
        type: "say",
        target: "smith",
        text: "我叫小雨。你是谁？",
      }),
      model: model([{ choice: "speak", text: "小雨，我叫布兰。", done: true }]),
    });
    expect(result.degraded).toBe(false);
    expect(result.commands).toHaveLength(2);
    const world = result.commands.reduce(execute, before);
    expect(before.journal.some((e) => e.text === "小雨，我叫布兰。")).toBe(
      false,
    );
    expect(world.journal.at(-1)?.text).toBe("小雨，我叫布兰。");
    const pending = execute(
      world,
      command(world, {
        type: "say",
        target: "smith",
        text: "还记得我叫什么吗？",
      }),
    );
    expect(turnObservation(pending).recent.map((e) => e.text)).toContain(
      "我叫小雨。你是谁？",
    );
    expect(JSON.stringify(turnObservation(pending))).not.toContain(
      "正午刺杀国王",
    );
    expect(replay(toReplay(world))).toEqual(world);
  });
  it("lets a hostile NPC speak then attack, and finishes without a third decision", async () => {
    const world = atSmithy();
    const requests: ModelRequest[] = [];
    const result = await runTurn({
      world,
      command: command(world, {
        type: "strike",
        target: "smith",
        skill: false,
      }),
      model: model(
        [
          { choice: "speak", text: "别在铺子里动手！", done: false },
          { choice: "attack", text: "", done: false },
        ],
        requests,
      ),
    });
    const after = result.commands.reduce(execute, world);
    expect(result.degraded).toBe(false);
    expect(result.commands).toHaveLength(3);
    expect(requests).toHaveLength(2);
    expect(after.heroes[0].hp).toBe(world.heroes[0].hp - 6);
    expect(after.turn?.queue).toEqual([]);
  });
  it("lets every present NPC decide once, with the addressed NPC first", async () => {
    const world = atSmithy();
    world.npcs.find((n) => n.id === "merchant")!.location = "smithy";
    const result = await runTurn({
      world,
      command: command(world, {
        type: "say",
        target: "merchant",
        text: "你们好",
      }),
      model: model([
        { choice: "speak", text: "你好，我来送货。", done: true },
        { choice: "speak", text: "放在柜台上就好。", done: true },
      ]),
    });
    expect(result.degraded).toBe(false);
    expect(
      result.commands.slice(1).map((c) => c.type === "npc_turn" && c.npc),
    ).toEqual(["merchant", "smith"]);
    expect(result.commands.reduce(execute, world).turn?.queue).toEqual([]);
  });
  it("rejects forged control and falls back explicitly for unavailable or invalid models", async () => {
    const world = atSmithy();
    const action = command(world, {
      type: "say",
      target: "smith",
      text: "你好",
    });
    await expect(
      runTurn({ world, command: { ...action, actor: "mage" } }),
    ).rejects.toThrow("只能提交自己的行动");
    await expect(
      runTurn({ world, command: { ...action, type: "npc_turn" } }),
    ).rejects.toThrow();
    const invalid = await runTurn({
      world,
      command: action,
      model: model([{ choice: "attack", text: "我攻击你", done: true }]),
    });
    expect(invalid.degraded).toBe(true);
    expect(invalid.commands.at(-1)).toMatchObject({
      source: "rules",
      choice: "end",
    });
    expect(invalid.commands.reduce(execute, world).heroes[0].hp).toBe(
      world.heroes[0].hp,
    );
  });
  it("bounds repeated talking, provider timeouts, and cancellation without changing input state", async () => {
    const world = atSmithy();
    const before = structuredClone(world);
    const action = command(world, {
      type: "say",
      target: "smith",
      text: "你好",
    });
    const repeated = await runTurn({
      world,
      command: action,
      model: model(
        Array.from({ length: 6 }, () => ({
          choice: "speak",
          text: "我继续说。",
          done: false,
        })),
      ),
    });
    expect(repeated.commands).toHaveLength(3);
    expect(repeated.degraded).toBe(true);
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
    const timed = await runTurn({
      world,
      command: action,
      model: slow,
      timeoutMs: 15,
    });
    expect(timed.degraded).toBe(true);
    const controller = new AbortController();
    const waiting = runTurn({
      world,
      command: action,
      model: slow,
      signal: controller.signal,
    });
    controller.abort();
    await expect(waiting).rejects.toThrow("取消");
    expect(world).toEqual(before);
  });
});
