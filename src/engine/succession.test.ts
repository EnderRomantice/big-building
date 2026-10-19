import { describe, expect, it } from "vitest";
import {
  CITIES,
  BUILDINGS,
  CAMPAIGN_PLACES,
  CAMPAIGN_ROADS,
  CAMPAIGN_ITEMS,
  REGIONAL_SKILLS,
  createSuccession,
} from "./succession";
import { execute, replay, toReplay } from "./engine";
import { legalOptions, type ActionPayload } from "./actions";
import { finishByRules } from "./turn";
import { locationName, pathsFrom, discovered } from "./worldContent";
import { makeStats, damageFor } from "./stats";
import { turnObservation } from "../../integrations/42-agent/turn";
import { journeySlot } from "../game/journey";
import type { World } from "./types";
function act(w: World, payload: ActionPayload) {
  return execute(w, {
    ...payload,
    actor: w.playerId!,
    id: crypto.randomUUID(),
    expectedRevision: w.revision,
  });
}
const finish = (w: World) => finishByRules(w).reduce(execute, w);

describe("九阙争衡", () => {
  it("contains ten connected cities, five complete towns each, and actual social links", () => {
    expect(CITIES).toHaveLength(10);
    const towns = new Set(
      Object.values(CAMPAIGN_PLACES)
        .map((p) => p.town)
        .filter(Boolean),
    );
    expect(towns.size).toBe(50);
    for (const town of towns)
      expect(
        Object.values(CAMPAIGN_PLACES)
          .filter((p) => p.town === town)
          .map((p) => p.building)
          .sort(),
      ).toEqual(BUILDINGS.map((b) => b[0]).sort());
    for (const city of CITIES)
      expect(
        new Set(
          Object.values(CAMPAIGN_PLACES)
            .filter((p) => p.city === city.id && p.town)
            .map((p) => p.town),
        ).size,
      ).toBe(5);
    const seen = new Set(["s-capital-center"]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const r of CAMPAIGN_ROADS) {
        if (seen.has(r.from) && !seen.has(r.to)) {
          seen.add(r.to);
          changed = true;
        }
        if (seen.has(r.to) && !seen.has(r.from)) {
          seen.add(r.from);
          changed = true;
        }
      }
    }
    expect(seen.size).toBe(Object.keys(CAMPAIGN_PLACES).length);
    const world = createSuccession(42);
    for (const npc of world.npcs) {
      expect(npc.background).toBeTruthy();
      expect(npc.relationships!.length).toBeGreaterThan(0);
      for (const relation of npc.relationships!)
        expect(world.npcs.some((n) => n.id === relation.target)).toBe(true);
    }
  });
  it("uses one level and damage template for players, NPCs and monsters", () => {
    const world = createSuccession(42);
    for (const being of [...world.heroes, ...world.npcs])
      expect(being).toMatchObject(makeStats(being.level, being.archetype));
    expect(world.npcs.some((n) => n.kind === "monster")).toBe(true);
    expect(damageFor(world.heroes[0], world.npcs[0], 0, 3)).toBe(
      Math.max(1, world.heroes[0].attack + 3 - world.npcs[0].defense),
    );
  });
  it("keeps unexplored place names out of navigation and model destinations, reveals only after arrival", () => {
    let world = createSuccession(42);
    const destination = "s-capital-0-school";
    expect(locationName(world, destination)).toBe("未探索的去处");
    expect(pathsFrom(world).length).toBe(10);
    expect(JSON.stringify(turnObservation(world).destinations)).not.toContain(
      CAMPAIGN_PLACES[destination].name,
    );
    expect(
      legalOptions(world, world.playerId!)
        .filter((o) => o.command.type === "move")
        .every((o) => !o.label.includes("书院")),
    ).toBe(true);
    expect(() =>
      act(world, { type: "move", destination: "s-desert-palace" }),
    ).toThrow("道路");
    world = finish(act(world, { type: "move", destination }));
    expect(discovered(world, destination)).toBe(true);
    expect(locationName(world, destination)).toBe(
      CAMPAIGN_PLACES[destination].name,
    );
    expect(world.minute).toBe(482);
    expect(replay(toReplay(world))).toEqual(world);
  });
  it("allows attacking a friendly person, applies affinity loss, and does not mutate the starting world", () => {
    const world = createSuccession(42),
      friend = world.npcs.find((n) => n.location === world.location)!;
    expect(friend.affinity).toBe(55);
    const option = legalOptions(world, world.playerId!).find(
      (o) =>
        o.command.type === "assault" &&
        !o.command.skill &&
        o.command.target === friend.id,
    )!;
    expect(option.confirmation).toContain("30 好感");
    const next = execute(world, option.command),
      after = next.npcs.find((n) => n.id === friend.id)!;
    expect(after.hp).toBeLessThan(friend.hp);
    expect(after.affinity).toBe(25);
    expect(after.relation).toBe("ally");
    expect(friend.hp).toBe(friend.maxHp);
    expect(replay(toReplay(next))).toEqual(next);
  });
  it("places distinct skills and equipment across all ten regions, makes learning and casting real actions", () => {
    expect(new Set(REGIONAL_SKILLS.map((s) => s.city)).size).toBe(10);
    expect(CAMPAIGN_ITEMS.filter((i) => i.power)).toHaveLength(50);
    expect(new Set(CAMPAIGN_ITEMS.filter(i=>i.power).map(i=>i.name)).size).toBe(10);
    let world = finish(
      act(createSuccession(42), {
        type: "move",
        destination: "s-capital-0-school",
      }),
    );
    world = finish(act(world, { type: "learn", skill: "art-capital" }));
    expect(world.heroes[0].skills).toContain("art-capital");
    expect(world.heroes[0].gold).toBe(20);
    expect(replay(toReplay(world))).toEqual(world);
    world.heroes[0].hp -= 9;
    const healed = act(world, {
      type: "cast",
      skill: "art-capital",
      target: "ranger",
    });
    expect(healed.heroes[0].hp - world.heroes[0].hp).toBe(7);
    expect(healed.heroes[0].energy).toBe(world.heroes[0].energy - 8);
    expect(() => act(world, { type: "learn", skill: "art-desert" })).toThrow(
      "老师",
    );
    expect(() =>
      act(world, {
        type: "cast",
        skill: "art-desert",
        target: world.npcs[0].id,
      }),
    ).toThrow("学会");
  });
  it("enforces purchase, inventory and equipment boundaries", () => {
    let world = finish(
      act(createSuccession(42), {
        type: "move",
        destination: "s-capital-0-smith",
      }),
    );
    world = finish(act(world, { type: "take", item: "weapon-capital" }));
    expect(world.heroes[0].gold).toBe(15);
    expect(world.heroes[0].inventory).toContain("禁卫短剑");
    world = finish(act(world, { type: "equip", weapon: "禁卫短剑" }));
    expect(world.heroes[0].weapon).toBe("禁卫短剑");
    expect(() =>
      act(world, { type: "take", item: "weapon-capital" }),
    ).toThrow();
    expect(replay(toReplay(world))).toEqual(world);
  });
  it("requires evidence, time and a personally encountered living prince to resolve the succession", () => {
    const world = createSuccession(42);
    world.location = "s-capital-palace";
    expect(() =>
      act(world, { type: "pledge", target: "n-north-royal" }),
    ).toThrow("第七日");
    world.minute = 6 * 1440 + 480;
    expect(() =>
      act(world, { type: "pledge", target: "n-north-royal" }),
    ).toThrow("证词");
    world.heroes[0].inventory.push(
      "北地·封存证词",
      "东地·封存证词",
      "南地·封存证词",
    );
    expect(() =>
      act(world, { type: "pledge", target: "n-north-royal" }),
    ).toThrow("亲自见过");
    world.exploration!.visited.push("s-north-palace");
    const end = act(world, { type: "pledge", target: "n-north-royal" });
    expect(end.flags.resolved).toBe(true);
    expect(end.exploration!.pledged).toBe("n-north-royal");
  });
  it("persists character identity and isolates their save slots", () => {
    const a = createSuccession(42, "mage"),
      b = createSuccession(42, "warden");
    expect(a.heroes[0].name).toBe("陆微");
    expect(a.location).not.toBe(b.location);
    expect(journeySlot(a)).not.toBe(journeySlot(b));
    expect(replay(toReplay(a))).toEqual(a);
  });
});
