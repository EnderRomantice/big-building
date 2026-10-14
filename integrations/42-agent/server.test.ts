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
      type: "say",
      actor: "ranger",
      id: "hello",
      expectedRevision: world.revision,
      target: "narrator",
      text: "你好",
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
                name: "npc_action",
                arguments: { choice: "end", text: "", done: true },
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
});
