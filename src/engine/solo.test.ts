import { describe, expect, it } from "vitest";
import {
  createWorld,
  ensureAdventure,
  execute,
  replay,
  toReplay,
} from "./engine";
import { finishByRules, npcCommand } from "./turn";
import { legalOptions, type ActionPayload } from "./actions";
import type { World } from "./types";
function act(world: World, action: ActionPayload) {
  return execute(world, {
    ...action,
    actor: "ranger",
    id: crypto.randomUUID(),
    expectedRevision: world.revision,
  });
}
function finish(world: World) {
  return finishByRules(world).reduce(execute, world);
}
describe("single player rules and NPC turns", () => {
  it("migrates legacy saves through a replayable command without erasing progress", () => {
    const old = act(createWorld(), { type: "move", destination: "archive" });
    const world = ensureAdventure(old);
    expect(world.location).toBe(old.location);
    expect(world.minute).toBe(old.minute);
    expect(world.heroes).toHaveLength(1);
    expect(world.heroes[0].weapon).toBe("灰木长弓");
    expect(replay(toReplay(world))).toEqual(world);
    expect(ensureAdventure(world)).toBe(world);
    expect(() =>
      execute(world, {
        type: "wait",
        actor: "mage",
        id: "wrong",
        expectedRevision: world.revision,
      }),
    ).toThrow("只能控制自己的角色");
  });
  it("uses fists without a weapon, supports owning and equipping a sword, and never duplicates pickups", () => {
    let world = finish(
      act(ensureAdventure(createWorld()), {
        type: "move",
        destination: "smithy",
      }),
    );
    expect(() => act(world, { type: "equip", weapon: "铁剑" })).toThrow(
      "自己持有",
    );
    world = finish(act(world, { type: "take", item: "iron-sword" }));
    expect(() => act(world, { type: "take", item: "iron-sword" })).toThrow(
      "已不在这里",
    );
    const armed = finish(act(world, { type: "equip", weapon: "铁剑" }));
    const unarmed = finish(act(world, { type: "equip", weapon: null }));
    const swordHit = act(armed, {
      type: "strike",
      target: "smith",
      skill: false,
    });
    const fistHit = act(unarmed, {
      type: "strike",
      target: "smith",
      skill: false,
    });
    expect(
      fistHit.npcs.find((n) => n.id === "smith")!.hp -
        swordHit.npcs.find((n) => n.id === "smith")!.hp,
    ).toBe(10);
    expect(fistHit.journal.at(-1)?.title).toContain("拳头");
    expect(swordHit.journal.at(-1)?.title).toContain("铁剑");
    expect(swordHit.heroes[0].hp).toBe(armed.heroes[0].hp); // NPC decides later, no hidden counterattack.
    const ended = finish(swordHit);
    expect(replay(toReplay(ended))).toEqual(ended);
  });
  it("blocks player actions until NPCs finish and gives each NPC only one speech and attack", () => {
    let world = act(ensureAdventure(createWorld()), {
      type: "move",
      destination: "smithy",
    });
    expect(legalOptions(world, "ranger")).toEqual([]);
    expect(() => act(world, { type: "wait" })).toThrow("NPC 尚未结束");
    expect(() =>
      execute(
        world,
        npcCommand(world, { choice: "attack", text: "", done: true }, "agent"),
      ),
    ).toThrow("只有敌对");
    world = execute(
      world,
      npcCommand(
        world,
        { choice: "speak", text: "欢迎。", done: false },
        "agent",
      ),
    );
    expect(() =>
      execute(
        world,
        npcCommand(
          world,
          { choice: "speak", text: "继续说", done: false },
          "agent",
        ),
      ),
    ).toThrow("已经说过话");
    world = finish(world);
    world = act(world, { type: "strike", target: "smith", skill: false });
    const attack = npcCommand(
      world,
      { choice: "attack", text: "", done: true },
      "agent",
    );
    const after = execute(world, attack);
    expect(after.heroes[0].hp).toBe(world.heroes[0].hp - 6);
    expect(after.turn?.queue).toEqual([]);
    expect(() =>
      execute(after, {
        ...attack,
        id: "repeat",
        expectedRevision: after.revision,
      }),
    ).toThrow("回合已结束");
  });
  it("stops all NPC actions after player death and consumes a healing item only once", () => {
    let world = finish(
      act(ensureAdventure(createWorld()), {
        type: "move",
        destination: "shop",
      }),
    );
    world = finish(act(world, { type: "take", item: "herb" }));
    expect(() => act(world, { type: "use", item: "药草" })).toThrow("生命已满");
    world.heroes[0].hp = 10;
    world = finish(act(world, { type: "use", item: "药草" }));
    expect(world.heroes[0].hp).toBe(26);
    expect(() => act(world, { type: "use", item: "药草" })).toThrow(
      "没有可以使用",
    );
    world = act(world, { type: "strike", target: "merchant", skill: false });
    world.heroes[0].hp = 1;
    world = finish(world);
    expect(world.heroes[0].hp).toBe(0);
    expect(world.playerId).toBe("ranger");
    expect(world.turn?.queue).toEqual([]);
    expect(legalOptions(world, "ranger")).toEqual([]);
  });
});
