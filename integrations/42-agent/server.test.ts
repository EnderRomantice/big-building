import { createSuccession } from "../../src/engine/succession";
import { replay } from "../../src/engine/engine";
import { enableCareers, enterCharacter } from "../../src/game/characters";
import { starterSkills } from "../../src/engine/careers";
import { afterEach, describe, expect, it } from "vitest";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import {
  createWorld,
  ensureAdventure,
  execute,
  toReplay,
} from "../../src/engine/engine";
import { createLocalAgentServer } from "./server";
import type { ModelClient } from "42-agent";
import type { Advice } from "../../src/engine/advice";
import { findRoute } from "../../src/engine/geography";
const servers: Server[] = [];
async function start(model?: ModelClient) {
  const server = createLocalAgentServer(model);
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}
afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (s) =>
        new Promise<void>((resolve) => {
          s.close(() => resolve());
          s.closeAllConnections();
        }),
    ),
  );
});
describe("local inference HTTP boundary", () => {
  it("replays a cross-world profession over HTTP and lets the NPC plan then cast a real skill", async () => {
    const steps = [
      {
        name: "npc_plan",
        arguments: {
          intent: "先以扑击试探，下一轮保留气力。",
          tactic: "aggressive",
        },
      },
      {
        name: "npc_cast",
        arguments: {
          intent: "扑击眼前的旅人。",
          skill: "job-wild-0",
          target: "ranger",
        },
      },
      { name: "npc_end", arguments: { intent: "观察对手下一步。" } },
    ];
    const requests: string[] = [];
    const model: ModelClient = {
      async complete(request) {
        requests.push(JSON.stringify(request));
        const step = steps.shift();
        return step
          ? { toolCalls: [{ id: crypto.randomUUID(), ...step }] }
          : { content: "结束" };
      },
    };
    const url = await start(model);
    const world = enterCharacter(enableCareers(createSuccession(37)), {
      id: "http-traveler",
      name: "远客",
      profession: "arcanist",
      level: 2,
      xp: 5,
      unlocked: starterSkills("arcanist"),
    });
    const response = await fetch(`${url}/api/agent/turn`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        replay: toReplay(world),
        command: {
          type: "move",
          destination: "s-capital-0-wilds",
          actor: "ranger",
          id: "career-trip",
          expectedRevision: world.revision,
        },
      }),
    });
    expect(response.status).toBe(200);
    const result = await response.json(),
      after = result.commands.reduce(execute, world);
    expect(result.degraded).toBe(false);
    expect(after.heroes[0].career.profession).toBe("arcanist");
    expect(after.heroes[0].hp).toBeLessThan(world.heroes[0].hp);
    expect(
      after.npcs.find((n: { id: string }) => n.id === "n-capital-0-wilds")
        .career.tactic,
    ).toBe("aggressive");
    expect(requests[1]).toContain("majorActionAvailable");
    expect(requests[2]).toContain("扑击");
    expect(replay(toReplay(after))).toEqual(after);
  });
  it("validates roads on the server and returns the same travel time as the map preview", async () => {
    const url = await start();
    const world = ensureAdventure(createWorld(771));
    const post = (destination: string) =>
      fetch(`${url}/api/agent/turn`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          replay: toReplay(world),
          command: {
            type: "move",
            destination,
            actor: "ranger",
            id: "road-trip",
            expectedRevision: world.revision,
          },
        }),
      });
    const locked = await post("ruins");
    expect(locked.status).toBe(400);
    expect((await locked.json()).error).toContain("符文");
    const response = await post("valley");
    expect(response.status).toBe(200);
    const after = (await response.json()).commands.reduce(execute, world);
    expect(after.location).toBe("valley");
    expect(after.minute - world.minute).toBe(
      findRoute(world, "valley")!.minutes,
    );
    expect(after.turn.queue).toEqual([]);
  });
  it("replays an input save and returns an explicit unavailable response without inventing an action", async () => {
    const url = await start();
    const world = createWorld();
    const response = await fetch(`${url}/api/agent/advice`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "http://127.0.0.1:5173",
      },
      body: JSON.stringify({
        replay: toReplay(world),
        actor: "ranger",
        intent: "先去书库",
      }),
    });
    expect(response.status).toBe(200);
    const advice = (await response.json()) as Advice;
    expect(advice.mode).toBe("fallback");
    expect(world.revision).toBe(0);
    expect(advice.proposal).toBeNull();
  });
  it("rejects foreign origins, bad JSON and a corrupt replay", async () => {
    const url = await start();
    const foreign = await fetch(`${url}/api/agent/status`, {
      headers: { Origin: "https://example.com" },
    });
    expect(foreign.status).toBe(403);
    const wrongType = await fetch(`${url}/api/agent/advice`, {
      method: "POST",
      body: "{}",
    });
    expect(wrongType.status).toBe(415);
    const badReplay = await fetch(`${url}/api/agent/advice`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        actor: "ranger",
        intent: "move",
        replay: { format: "invalid" },
      }),
    });
    expect(badReplay.status).toBe(400);
  });
  it("returns a replayable player + NPC transaction and rejects direct NPC impersonation", async () => {
    const url = await start();
    const world = ensureAdventure(createWorld());
    const action = {
      type: "move",
      actor: "ranger",
      id: "hello",
      expectedRevision: world.revision,
      destination: "smithy",
    };
    const post = (command: unknown) =>
      fetch(`${url}/api/agent/turn`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ replay: toReplay(world), command }),
      });
    const response = await post(action);
    expect(response.status).toBe(200);
    const result = await response.json();
    expect(result.degraded).toBe(true);
    expect(result.commands[0]).toEqual(action);
    expect(result.commands.at(-1)).toMatchObject({
      type: "npc_turn",
      source: "rules",
    });
    expect(result.commands.reduce(execute, world).turn.queue).toEqual([]);
    expect(
      (
        await post({
          type: "npc_turn",
          actor: "ranger",
          id: "fake",
          expectedRevision: world.revision,
          npc: "narrator",
          choice: "end",
          text: "",
          done: true,
          source: "agent",
        })
      ).status,
    ).toBe(400);
  });
  it("aborts provider work on client disconnect and releases the next turn", async () => {
    let started!: () => void;
    let aborted!: () => void;
    const called = new Promise<void>((resolve) => {
      started = resolve;
    });
    const cancelled = new Promise<void>((resolve) => {
      aborted = resolve;
    });
    let calls = 0;
    const slow: ModelClient = {
      async complete({ signal }) {
        if (calls++)
          return {
            toolCalls: [
              {
                id: "end",
                name: "npc_end",
                arguments: { intent: "等待玩家" },
              },
            ],
          };
        started();
        return new Promise((_, reject) => {
          const stop = () => {
            aborted();
            reject(signal?.reason);
          };
          if (signal?.aborted) stop();
          else signal?.addEventListener("abort", stop, { once: true });
        });
      },
    };
    const url = await start(slow);
    const world = ensureAdventure(createWorld());
    const body = JSON.stringify({
      replay: toReplay(world),
      command: {
        type: "say",
        actor: "ranger",
        id: "cancelled",
        expectedRevision: world.revision,
        target: "narrator",
        text: "你好",
      },
    });
    const controller = new AbortController();
    const first = fetch(`${url}/api/agent/turn`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      signal: controller.signal,
    });
    const rejected = expect(first).rejects.toThrow();
    await called;
    controller.abort();
    await rejected;
    await cancelled;
    const next = await fetch(`${url}/api/agent/turn`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });
    expect(next.status).toBe(200);
    expect((await next.json()).degraded).toBe(false);
  });
  it("returns an actionable 503 without any committed commands when dialogue cannot run", async () => {
    const url = await start();
    const world = ensureAdventure(createWorld());
    const response = await fetch(`${url}/api/agent/turn`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        replay: toReplay(world),
        command: {
          type: "say",
          actor: "ranger",
          id: "hello",
          expectedRevision: world.revision,
          target: "narrator",
          text: "你好",
        },
      }),
    });
    expect(response.status).toBe(503);
    const result = await response.json();
    expect(result.code).toBe("missing_key");
    expect(result.error).toContain("输入已保留");
    expect(result.commands).toBeUndefined();
  });
});
