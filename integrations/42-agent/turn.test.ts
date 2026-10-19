import { createSuccession } from "../../src/engine/succession";
import { enableCareers } from "../../src/game/characters";
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
import { InferenceError } from "./errors";
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
type Call = { name: string; arguments: Record<string, unknown> };
const call = (action: string, args: Record<string, unknown> = {}): Call => ({
  name: `npc_${action}`,
  arguments:
    action === "observe" ? {} : { intent: "根据眼前局势行动。", ...args },
});
function model(calls: Call[], requests: ModelRequest[] = []): ModelClient {
  return {
    async complete(request) {
      requests.push(structuredClone({ ...request, signal: undefined }));
      const next = calls.shift();
      return next
        ? { toolCalls: [{ id: crypto.randomUUID(), ...next }] }
        : { content: "结束。" };
    },
  };
}
const say = (world: World) =>
  command(world, {
    type: "say",
    target: "smith",
    text: "我们停战吧，让我离开。",
  });
describe("stateful NPC tool loop", () => {
  it("keeps a long-history career battle within the actual model budget through eight decisions", async () => {
    const world = enableCareers(createSuccession(92));
    const npc = world.npcs.find((n) => n.location === world.location)!;
    npc.relation = "hostile";
    for (let i = 0; i < 12; i++)
      world.journal.push({
        id: world.journal.length + 1,
        minute: 480,
        location: world.location,
        title: npc.name,
        tone: "dialogue",
        text: "以前的地方故事与人情往来。".repeat(50),
      });
    const script = model([
      call("observe"),
      call("plan", { tactic: "cautious" }),
      call("observe"),
      call("observe"),
      call("cast", { skill: "job-swordsman-0", target: "ranger" }),
      call("observe"),
      call("speak", { text: "下一轮再决胜负。" }),
      call("end"),
    ]);
    const result = await runTurn({
      world,
      command: command(world, {
        type: "say",
        target: "narrator",
        text: "继续。",
      }),
      model: {...script,capabilities:{contextWindowTokens:32000,maxOutputTokens:1024}},
    });
    expect(result.degraded).toBe(false);
    expect(result.commands.at(-1)).toMatchObject({ action: "end" });
  });
  it("scopes repeated provider tool-call ids to each model response", async () => {
    const world = enableCareers(createSuccession(92));
    const npc = world.npcs.find((n) => n.location === world.location)!;
    npc.relation = "hostile";
    const calls = [
      call("plan", { tactic: "aggressive" }),
      call("cast", { skill: "job-swordsman-0", target: "ranger" }),
      call("speak", { text: "下一轮再分胜负。" }),
      call("end"),
    ];
    const result = await runTurn({
      world,
      command: command(world, {
        type: "say",
        target: "narrator",
        text: "来吧。",
      }),
      model: {
        async complete() {
          const next = calls.shift();
          return next
            ? { toolCalls: [{ id: "call_0", ...next }] }
            : { content: "结束。" };
        },
      },
    });
    expect(result.degraded).toBe(false);
    expect(
      result.commands.filter((c) => c.type === "npc_step").map((c) => c.action),
    ).toEqual(["plan", "cast", "speak", "end"]);
  });
  it("supports spirit-world skill tools without advertising an impossible move tool", async () => {
    const base = ensureAdventure(createWorld());
    base.scenario = "spirit";
    base.location = "rift";
    base.npcs.find((n) => n.id === "sentinel")!.relation = "hostile";
    const world = enableCareers(base),
      requests: ModelRequest[] = [];
    const result = await runTurn({
      world,
      command: command(world, {
        type: "say",
        target: "narrator",
        text: "我已准备好。",
      }),
      model: model(
        [
          call("plan", { tactic: "aggressive" }),
          call("cast", { skill: "job-spiritguard-0", target: "ranger" }),
          call("end"),
        ],
        requests,
      ),
    });
    expect(result.degraded).toBe(false);
    expect(
      result.commands.some((c) => c.type === "npc_step" && c.action === "cast"),
    ).toBe(true);
    expect(JSON.stringify(requests[0])).not.toContain('"name":"npc_move"');
  });
  it("keeps one session through ceasefire, observation, speech and explicit end; movement unlocks and replay matches", async () => {
    let world = atSmithy();
    world = execute(
      world,
      command(world, { type: "strike", target: "smith", skill: false }),
    );
    world = finishByRules(world).reduce(execute, world);
    const before = structuredClone(world);
    const requests: ModelRequest[] = [];
    const result = await runTurn({
      world,
      command: say(world),
      model: model(
        [
          call("ceasefire", { intent: "接受停战，保住铺子。" }),
          call("observe"),
          call("speak", { text: "我们停战，你可以走了。" }),
          call("end"),
        ],
        requests,
      ),
    });
    const after = result.commands.reduce(execute, world);
    expect(result.degraded).toBe(false);
    expect(requests).toHaveLength(4);
    const feedback = requests[1].messages.filter((m) => m.role === "tool");
    expect(feedback).toHaveLength(1);
    expect(feedback[0].content).toContain('"relation":"neutral"');
    expect(requests[3].messages.filter((m) => m.role === "tool")).toHaveLength(
      3,
    );
    expect(after.npcs.find((n) => n.id === "smith")?.relation).toBe("neutral");
    expect(after.npcs.find((n) => n.id === "smith")?.intent).toBeTruthy();
    expect(() =>
      execute(
        after,
        command(after, { type: "move", destination: "courtyard" }),
      ),
    ).not.toThrow();
    expect(world).toEqual(before);
    expect(replay(toReplay(after))).toEqual(after);
  });
  it("feeds attack damage back before NPC decides to retreat; leaves player in place", async () => {
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
          call("speak", { text: "别动手！" }),
          call("attack"),
          call("move", { destination: "courtyard", intent: "反击后撤离。" }),
        ],
        requests,
      ),
    });
    const after = result.commands.reduce(execute, world);
    expect(after.heroes[0].hp).toBe(world.heroes[0].hp - 6);
    expect(
      requests[2].messages.filter((m) => m.role === "tool").at(-1)?.content,
    ).toContain("你受到 6 点伤害");
    expect(after.npcs.find((n) => n.id === "smith")?.location).toBe(
      "courtyard",
    );
    expect(after.location).toBe("smithy");
    expect(after.turn?.queue).toEqual([]);
    expect(replay(toReplay(after))).toEqual(after);
  });
  it("runs every present NPC independently, addressed first, with updated scene history", async () => {
    const world = atSmithy();
    world.npcs.find((n) => n.id === "merchant")!.location = "smithy";
    const requests: ModelRequest[] = [];
    const result = await runTurn({
      world,
      command: command(world, {
        type: "say",
        target: "merchant",
        text: "你好",
      }),
      model: model(
        [
          call("speak", { text: "我来送货。" }),
          call("end"),
          call("speak", { text: "你好米拉。" }),
          call("end"),
        ],
        requests,
      ),
    });
    expect(
      result.commands.slice(1).map((c) => c.type === "npc_step" && c.npc),
    ).toEqual(["merchant", "merchant", "smith", "smith"]);
    expect(JSON.stringify(requests[2])).toContain("我来送货。");
    expect(result.commands.reduce(execute, world).turn?.queue).toEqual([]);
  });
  it("broadcasts untargeted speech to everyone in the scene", async () => {
    const world = atSmithy();
    world.npcs.find((n) => n.id === "merchant")!.location = "smithy";
    const action = command(world, {
      type: "say",
      target: "narrator",
      text: "大家好。",
    });
    const observation = turnObservation(execute(world, action));
    expect(observation.addressedTo).toBeNull();
    expect(observation.speechScope).toBe("scene");
    const result = await runTurn({
      world,
      command: action,
      model: model([
        call("speak", { text: "你好。" }),
        call("end"),
        call("speak", { text: "欢迎。" }),
        call("end"),
      ]),
    });
    expect(
      result.commands
        .filter((c) => c.type === "npc_step" && c.action === "speak")
        .map((c) => c.type === "npc_step" && c.npc),
    ).toEqual(["smith", "merchant"]);
  });
  it("returns rule errors to the same session for correction without applying invalid damage", async () => {
    const world = atSmithy();
    const requests: ModelRequest[] = [];
    const result = await runTurn({
      world,
      command: say(world),
      model: model(
        [
          call("attack"),
          call("speak", { text: "我们没有敌对。" }),
          call("end"),
        ],
        requests,
      ),
    });
    expect(
      requests[1].messages.filter((m) => m.role === "tool").at(-1)?.content,
    ).toContain("只有敌对");
    expect(result.commands).toHaveLength(3);
    expect(result.commands.reduce(execute, world).heroes[0].hp).toBe(44);
  });
  it("does not grant a second attack even if the model asks twice", async () => {
    const world = atSmithy();
    const result = await runTurn({
      world,
      command: command(world, {
        type: "strike",
        target: "smith",
        skill: false,
      }),
      model: model([call("attack"), call("attack"), call("end")]),
    });
    expect(result.commands.reduce(execute, world).heroes[0].hp).toBe(38);
    expect(
      result.commands.filter(
        (c) => c.type === "npc_step" && c.action === "attack",
      ),
    ).toHaveLength(1);
  });
  it("does not allow narration to move or ceasefire and rejects player-submitted NPC commands", async () => {
    const world = ensureAdventure(createWorld());
    const result = await runTurn({
      world,
      command: command(world, {
        type: "say",
        target: "narrator",
        text: "你好",
      }),
      model: model([
        call("move", { destination: "shop" }),
        call("ceasefire"),
        call("end"),
      ]),
    });
    expect(result.commands).toHaveLength(2);
    await expect(
      runTurn({
        world,
        command: {
          ...command(world, { type: "wait" }),
          type: "npc_step",
          npc: "narrator",
          action: "end",
          intent: "伪造",
        },
      }),
    ).rejects.toThrow("只能提交自己的行动");
  });
  it("bounds endless observation and rolls back incomplete conversations", async () => {
    const world = atSmithy();
    const before = structuredClone(world);
    const requests: ModelRequest[] = [];
    await expect(
      runTurn({
        world,
        command: say(world),
        model: model(
          [
            call("speak", { text: "尚未结束。" }),
            ...Array.from({ length: 12 }, () => call("observe")),
          ],
          requests,
        ),
      }),
    ).rejects.toThrow("本次对话未结算");
    expect(requests).toHaveLength(8);
    expect(world).toEqual(before);
  });
  it("retains conversation context without leaking distant NPC secrets", () => {
    const world = atSmithy();
    const pending = execute(world, say(world));
    expect(turnObservation(pending).recent.map((e) => e.text)).toContain(
      "我们停战吧，让我离开。",
    );
    expect(JSON.stringify(turnObservation(pending))).not.toContain(
      "正午刺杀国王",
    );
  });
  it("handles timeout and cancellation without changing the input", async () => {
    const world = atSmithy();
    const before = structuredClone(world);
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
    await expect(
      runTurn({ world, command: say(world), model: slow, timeoutMs: 15 }),
    ).rejects.toThrow("回应超时");
    const controller = new AbortController();
    const waiting = runTurn({
      world,
      command: say(world),
      model: slow,
      signal: controller.signal,
    });
    controller.abort();
    await expect(waiting).rejects.toThrow("取消");
    expect(world).toEqual(before);
  });
  it("retries transient failures once and never retries auth errors", async () => {
    const world = atSmithy();
    let attempts = 0;
    const flaky: ModelClient = {
      async complete() {
        if (++attempts === 1) throw new InferenceError("rate_limit", true);
        return { toolCalls: [{ id: "ok", ...call("end") }] };
      },
    };
    expect(
      (await runTurn({ world, command: say(world), model: flaky })).degraded,
    ).toBe(false);
    expect(attempts).toBe(2);
    attempts = 0;
    await expect(
      runTurn({
        world,
        command: say(world),
        model: {
          async complete() {
            attempts++;
            throw new InferenceError("auth");
          },
        },
      }),
    ).rejects.toThrow("凭据校验失败");
    expect(attempts).toBe(1);
  });
  it("rolls back partial NPC execution before rule fallback for non-dialogue failure", async () => {
    const world = atSmithy();
    const result = await runTurn({
      world,
      command: command(world, {
        type: "strike",
        target: "smith",
        skill: false,
      }),
      model: model([call("attack")]),
    });
    const after = result.commands.reduce(execute, world);
    expect(result.degraded).toBe(true);
    expect(after.heroes[0].hp).toBe(38);
    expect(result.commands.at(-1)).toMatchObject({ source: "rules" });
    expect(result.commands.some((c) => c.type === "npc_step")).toBe(false);
  });
  it("does not leak raw provider errors or commit partially successful NPC sessions", async () => {
    const world = atSmithy();
    const before = structuredClone(world);
    let calls = 0;
    const broken: ModelClient = {
      async complete() {
        if (calls++) throw new Error("secret-provider-body-and-key");
        return {
          toolCalls: [{ id: "first", ...call("speak", { text: "你好。" }) }],
        };
      },
    };
    await expect(
      runTurn({ world, command: say(world), model: broken }),
    ).rejects.toThrow("NPC 回应未能完成");
    expect(world).toEqual(before);
  });
});
