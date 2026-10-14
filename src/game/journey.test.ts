import { describe, expect, it } from "vitest";
import { createWorld, execute } from "../engine/engine";
import { finishByRules } from "../engine/turn";
import { legalOptions } from "../engine/actions";
import { journeyReducer, startJourney } from "./journey";

describe("journey commit boundary", () => {
  it("serializes rapid clicks and records only the accepted result", () => {
    const start = startJourney();
    const command = legalOptions(start.world, start.actorId)[0].command;
    const first = journeyReducer(start, {
      type: "commit",
      command,
      session: 0,
    });
    const second = journeyReducer(first, {
      type: "commit",
      command,
      session: 0,
    });
    expect(second.world).toBe(first.world);
    expect(second.world.revision).toBe(2);
    expect(second.error).toContain("已经结算");
    expect(first.latest[0].title).toBe("启程");
  });
  it("rejects an old proposal after resetting to the same world revision", () => {
    const start = startJourney();
    const command = legalOptions(start.world, start.actorId)[0].command;
    const reset = journeyReducer(start, {
      type: "replace",
      world: createWorld(),
    });
    const next = journeyReducer(reset, { type: "commit", command, session: 0 });
    expect(next.world.revision).toBe(1);
    expect(next.error).toContain("旅程已更换");
  });
  it("binds the player and never switches control to a companion", () => {
    const start = startJourney();
    const command = {
      ...legalOptions(start.world, start.actorId)[0].command,
      actor: "mage" as const,
    };
    expect(
      journeyReducer(start, { type: "commit", command, session: 0 }).error,
    ).toContain("只能控制自己的角色");
    const world = createWorld();
    world.heroes[0].hp = 0;
    const restored = startJourney(world);
    expect(restored.actorId).toBe("ranger");
    expect(restored.world.heroes).toHaveLength(1);
    expect(legalOptions(restored.world, restored.actorId)).toEqual([]);
  });
  it("commits a whole NPC turn atomically, rejects stale batches and rolls back invalid tails", () => {
    const start = startJourney();
    const command = legalOptions(start.world, start.actorId)[0].command;
    const pending = execute(start.world, command);
    const commands = [command, ...finishByRules(pending)];
    const next = journeyReducer(start, { type: "batch", commands, session: 0 });
    expect(next.world.turn?.queue).toEqual([]);
    expect(next.latest.length).toBeGreaterThan(1);
    const duplicate = journeyReducer(next, {
      type: "batch",
      commands,
      session: 0,
    });
    expect(duplicate.world).toBe(next.world);
    const broken = [
      ...commands,
      { ...command, id: "invalid-tail", expectedRevision: 999 },
    ];
    const rolledBack = journeyReducer(start, {
      type: "batch",
      commands: broken,
      session: 0,
    });
    expect(rolledBack.world).toBe(start.world);
    expect(rolledBack.error).toBeTruthy();
  });
});
