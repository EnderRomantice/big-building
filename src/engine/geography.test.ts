import { describe, expect, it } from "vitest";
import {
  createWorld,
  ensureAdventure,
  execute,
  replay,
  toReplay,
} from "./engine";
import { legalOptions } from "./actions";
import {
  containsPoint,
  findRoute,
  generateGeography,
  geographyFor,
  regionAt,
} from "./geography";
import type { Command, LocationId, World } from "./types";
import { finishByRules } from "./turn";

function move(world: World, destination: LocationId) {
  return execute(world, {
    type: "move",
    destination,
    actor: "ranger",
    id: `move-${world.revision}`,
    expectedRevision: world.revision,
  });
}
function area(points: { x: number; y: number }[]) {
  return (
    Math.abs(
      points.reduce((sum, p, i) => {
        const q = points[(i + 1) % points.length];
        return sum + p.x * q.y - q.x * p.y;
      }, 0),
    ) / 2
  );
}
describe("seeded geography and road travel", () => {
  it("reproduces a seed, varies the coastline and roads with another seed, and leaves combat RNG alone", () => {
    const world = createWorld(123);
    const original = structuredClone(world);
    const map = generateGeography(world.seed);
    expect(generateGeography(123)).toEqual(map);
    expect(generateGeography(124).outline).not.toEqual(map.outline);
    expect(generateGeography(124).roads).not.toEqual(map.roads);
    findRoute(world, "rift");
    legalOptions(world, "ranger");
    expect(world).toEqual(original);
  });
  it("partitions the entire land without gaps, keeps places inside their regions and roads finite across many seeds", () => {
    for (const seed of [
      0,
      0xffffffff,
      ...Array.from({ length: 250 }, (_, i) => i * 7919),
    ]) {
      const map = generateGeography(seed);
      expect(
        map.regions.reduce((sum, region) => sum + area(region.polygon), 0),
      ).toBeCloseTo(area(map.outline), 5);
      for (const region of map.regions) {
        expect(region.polygon.length).toBeGreaterThanOrEqual(3);
        expect(region.parent).toBe("ashen-realm");
      }
      for (const place of Object.values(map.places)) {
        expect(containsPoint(regionAt(map, place.id).polygon, place)).toBe(
          true,
        );
        expect(
          map.regions.filter((region) => containsPoint(region.polygon, place)),
        ).toHaveLength(1);
      }
      for (const road of map.roads) {
        expect(road.distance).toBeGreaterThan(0);
        expect(road.minutes).toBeGreaterThan(0);
        expect(Number.isFinite(road.minutes)).toBe(true);
      }
      const world = createWorld(seed);
      for (const id of Object.keys(map.places) as LocationId[]) {
        if (id !== "ruins") expect(findRoute(world, id, map)).not.toBeNull();
      }
    }
  });
  it("routes through real road segments, uses the sum of their time and announces crossed regions on arrival", () => {
    const world = createWorld();
    const route = findRoute(world, "rift")!;
    expect(route.stops).toEqual(["courtyard", "gate", "valley", "rift"]);
    expect(route.minutes).toBe(
      route.roads.reduce((sum, road) => sum + road.minutes, 0),
    );
    expect(route.minutes).toBeGreaterThan(findRoute(world, "gate")!.minutes);
    const option = legalOptions(world, "ranger").find(
      (o) => o.command.type === "move" && o.command.destination === "rift",
    )!;
    const after = execute(world, option.command);
    expect(after.minute - world.minute).toBe(route.minutes);
    expect(option.costMinutes).toBe(route.minutes);
    expect(
      after.journal
        .filter((entry) => entry.title.startsWith("已进入"))
        .map((entry) => entry.title),
    ).toEqual(["已进入雾河低地", "已进入界隙荒境"]);
    expect(after.journal.at(-1)?.minute).toBe(after.minute);
    expect(replay(toReplay(after))).toEqual(after);
  });
  it("rejects locked and disconnected routes at the engine boundary, then unlocks the rune road with lore", () => {
    const world = createWorld();
    expect(findRoute(world, "ruins")).toBeNull();
    expect(() => move(world, "ruins")).toThrow("符文");
    expect(
      legalOptions(world, "ranger").some(
        (o) => o.command.type === "move" && o.command.destination === "ruins",
      ),
    ).toBe(false);
    const disconnected = { ...geographyFor(world.seed), roads: [] };
    expect(findRoute(world, "shop", disconnected)).toBeNull();
    world.flags.lore = true;
    expect(move(world, "ruins").location).toBe("ruins");
  });
  it("does not let a long route skip hostile stops or travel in the other world", () => {
    const world = ensureAdventure(createWorld());
    world.npcs.find((npc) => npc.id === "merchant")!.relation = "hostile";
    expect(findRoute(world, "throne")).toBeNull();
    expect(() => move(world, "throne")).toThrow("道路");
    expect(findRoute(world, "shop")).not.toBeNull(); // Can approach an enemy, but must stop there.
    world.scenario = "spirit";
    expect(findRoute(world, "gate")).toBeNull();
    expect(() => move(world, "gate")).toThrow("灵境");
  });
  it("advances distant events during travel and stops at a newly hostile intermediate location", () => {
    const world = createWorld();
    world.location = "throne";
    world.flags.throneOwner = "prince";
    world.npcs[0].hp = 0;
    world.npcs[1].location = "archive";
    world.npcs[1].corruption = 90;
    world.minute = 749;
    const after = move(world, "courtyard");
    expect(after.npcs[1].corruption).toBe(100);
    expect(after.location).toBe("archive");
    expect(after.minute - world.minute).toBe(
      findRoute(world, "archive")!.minutes,
    );
    expect(after.journal.some((entry) => entry.title === "旅程中断")).toBe(
      true,
    );
  });
  it("replays old 30-minute moves before a recorded migration, including pending NPC turns", () => {
    const legacyStart = createWorld(14026, 0);
    const old = move(legacyStart, "rift");
    expect(old.minute).toBe(510);
    const oldFile = toReplay(old);
    delete oldFile.mapVersion; // Actual v1 files did not carry a map version.
    expect(replay(oldFile)).toEqual(old);
    let migrated = ensureAdventure(replay(oldFile));
    expect(migrated.minute).toBe(old.minute);
    expect(migrated.history.at(-1)?.type).toBe("enable_map");
    const route = findRoute(migrated, "courtyard")!;
    migrated = move(migrated, "courtyard");
    expect(migrated.minute - old.minute).toBe(route.minutes);
    migrated = finishByRules(migrated).reduce(execute, migrated);
    expect(replay(toReplay(migrated))).toEqual(migrated);
    expect(ensureAdventure(migrated)).toBe(migrated);

    let pending = execute(createWorld(12, 0), {
      type: "begin",
      actor: "ranger",
      id: "begin",
      expectedRevision: 0,
    });
    pending = move(pending, "smithy");
    const upgraded = ensureAdventure(pending);
    expect(upgraded.turn).toEqual(pending.turn);
    expect(upgraded.minute).toBe(pending.minute);
    expect(replay(toReplay(upgraded))).toEqual(upgraded);
  });
  it("rejects unsupported map versions and forged movement duration", () => {
    const world = createWorld();
    expect(() => replay({ ...toReplay(world), mapVersion: 9 })).toThrow(
      "地图版本",
    );
    expect(() =>
      execute(world, {
        type: "move",
        destination: "rift",
        minutes: 0,
        actor: "ranger",
        id: "forged",
        expectedRevision: 0,
      } as unknown as Command),
    ).toThrow("不支持");
  });
});
