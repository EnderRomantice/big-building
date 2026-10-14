import { describe, expect, it } from "vitest";
import { createWorld, execute } from "./engine";
import { legalOptions } from "./actions";
import type { World, Command } from "./types";

function choose(world: World, type: Command["type"]) {
  return legalOptions(world, "ranger", true).find(
    (o) => o.command.type === type,
  )!;
}
describe("shared actions", () => {
  it("lists only executable options without changing world state", () => {
    const world = createWorld();
    const original = structuredClone(world);
    const options = legalOptions(world, "ranger", true);
    expect(options.some((o) => o.command.type === "attack")).toBe(false);
    for (const option of options)
      expect(() => execute(world, option.command)).not.toThrow();
    expect(world).toEqual(original);
  });
  it("keeps skill cost accurate even when the killing blow restores energy on level-up", () => {
    let world = createWorld();
    world = execute(
      world,
      legalOptions(world, "ranger").find(
        (o) => o.command.type === "move" && o.command.destination === "throne",
      )!.command,
    );
    const attack = () =>
      legalOptions(world, "ranger").find(
        (o) => o.command.type === "attack" && o.command.skill,
      )!;
    expect(attack().confirmation).toContain("尚未与你为敌");
    world = execute(world, attack().command);
    expect(attack().confirmation).toBeUndefined();
    expect(attack().energyCost).toBe(8);
    world = execute(world, attack().command);
    expect(world.heroes[0].level).toBe(2);
    expect(choose(world, "claim")).toBeDefined();
    expect(
      legalOptions(world, "ranger").some((o) => o.command.type === "claim"),
    ).toBe(false);
  });
  it("hides travel during combat and unaffordable skills while preserving ordinary attacks", () => {
    const world = createWorld();
    world.location = "throne";
    world.npcs[0].relation = "hostile";
    world.heroes[0].energy = 0;
    const options = legalOptions(world, "ranger");
    expect(options.some((o) => o.command.type === "move")).toBe(false);
    expect(
      options.some((o) => o.command.type === "attack" && o.command.skill),
    ).toBe(false);
    expect(
      options.some((o) => o.command.type === "attack" && !o.command.skill),
    ).toBe(true);
  });
});
