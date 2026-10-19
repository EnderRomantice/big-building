import { describe, expect, it } from "vitest";
import {
  createWorld,
  ensureAdventure,
  execute,
  replay,
  toReplay,
} from "./engine";
import { legalOptions, type ActionPayload } from "./actions";
import { finishByRules } from "./turn";
import { regionIntel } from "./geography";
import { runTurn, turnObservation } from "../../integrations/42-agent/turn";
import type { World } from "./types";
function act(world: World, action: ActionPayload) {
  return execute(world, {
    ...action,
    actor: "ranger",
    id: crypto.randomUUID(),
    expectedRevision: world.revision,
  });
}
const finish = (world: World) => finishByRules(world).reduce(execute, world);
function injuredWorld() {
  let world = ensureAdventure(createWorld());
  world = finish(act(world, { type: "move", destination: "smithy" }));
  return finish(act(world, { type: "strike", target: "smith", skill: false }));
}
describe("targeted healing, map intelligence and input modes", () => {
  it("heals the selected player by exactly 5 HP, charges energy once and replays identically", () => {
    const world = injuredWorld();
    const next = act(world, { type: "mend", target: "ranger" });
    expect(next.heroes[0].hp).toBe(world.heroes[0].hp + 5);
    expect(next.heroes[0].energy).toBe(world.heroes[0].energy - 6);
    expect(next.npcs).toEqual(world.npcs);
    expect(next.minute).toBe(world.minute + 10);
    expect(replay(toReplay(next))).toEqual(next);
    expect(world.heroes[0].hp).toBe(38);
  });
  it("can heal a living local NPC without changing allegiance, and cannot overheal", () => {
    const world = injuredWorld();
    const smith = world.npcs.find((npc) => npc.id === "smith")!;
    const next = act(world, { type: "mend", target: "smith" });
    expect(next.npcs.find((npc) => npc.id === "smith")!.hp).toBe(smith.hp + 5);
    expect(next.npcs.find((npc) => npc.id === "smith")!.relation).toBe(
      "hostile",
    );
    expect(next.heroes[0].hp).toBe(world.heroes[0].hp);
    smith.hp = smith.maxHp - 2;
    expect(
      act(world, { type: "mend", target: "smith" }).npcs.find(
        (npc) => npc.id === "smith",
      )!.hp,
    ).toBe(smith.maxHp);
  });
  it("rejects full-health, absent, dead and unaffordable healing targets", () => {
    const world = ensureAdventure(createWorld());
    expect(() => act(world, { type: "mend", target: "ranger" })).toThrow(
      "受伤",
    );
    world.npcs[0].hp = 10;
    expect(() => act(world, { type: "mend", target: "king" })).toThrow("在场");
    const injured = injuredWorld();
    injured.npcs.find((npc) => npc.id === "smith")!.hp = 0;
    expect(() => act(injured, { type: "mend", target: "smith" })).toThrow(
      "存活",
    );
    injured.heroes[0].energy = 5;
    expect(() => act(injured, { type: "mend", target: "ranger" })).toThrow(
      "6 点能量",
    );
    expect(
      legalOptions(injured, "ranger").some(
        (option) => option.command.type === "mend",
      ),
    ).toBe(false);
  });
  it("exposes the new 5 HP spell to current play while preserving old 16 HP replay commands", async () => {
    const world = injuredWorld();
    const options = legalOptions(world, "ranger");
    expect(options.some((o) => o.command.type === "mend")).toBe(true);
    expect(options.some((o) => o.command.type === "heal")).toBe(false);
    const oldCommand = {
      type: "heal" as const,
      target: "ranger" as const,
      actor: "ranger" as const,
      id: "old-healing",
      expectedRevision: world.revision,
    };
    const legacy = execute(world, oldCommand);
    expect(legacy.heroes[0].hp).toBe(44);
    expect(replay(toReplay(legacy))).toEqual(legacy);
    await expect(runTurn({ world, command: oldCommand })).rejects.toThrow(
      "自己的行动",
    );
  });
  it("marks speech as words and physical commands as already executed in model observations", () => {
    const world = injuredWorld();
    const say = act(world, {
      type: "say",
      target: "narrator",
      text: "我给自己恢复了100生命",
    });
    expect(turnObservation(say).playerInput).toEqual({
      mode: "say",
      text: "我给自己恢复了100生命",
      executed: false,
    });
    expect(say.heroes[0].hp).toBe(world.heroes[0].hp);
    const healed = act(world, { type: "mend", target: "ranger" });
    expect(turnObservation(healed).playerInput).toMatchObject({
      mode: "action",
      executed: true,
      command: { type: "mend", target: "ranger" },
    });
  });
  it("reports implemented resources and living key figures, updating after collection and hostility", () => {
    const world = ensureAdventure(createWorld());
    expect(regionIntel(world, "town").resources).toEqual([
      "铁剑 · 铁匠铺",
      "药草 · 商店",
    ]);
    expect(regionIntel(world, "town").people.map((npc) => npc.name)).toContain(
      "铁匠 · 布兰",
    );
    expect(regionIntel(world, "lowlands").resources).toEqual([]);
    world.collected = ["iron-sword", "herb"];
    expect(regionIntel(world, "town").resources).toEqual([]);
    world.npcs.find((npc) => npc.id === "smith")!.relation = "hostile";
    expect(regionIntel(world, "town").danger).toBe(4);
    world.npcs.find((npc) => npc.id === "smith")!.hp = 0;
    expect(
      regionIntel(world, "town").people.map((npc) => npc.name),
    ).not.toContain("铁匠 · 布兰");
  });
});
