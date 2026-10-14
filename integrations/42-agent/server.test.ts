import { afterEach, describe, expect, it } from "vitest";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { createWorld, execute, toReplay } from "../../src/engine/engine";
import { createLocalAgentServer } from "./server";
import type { Advice } from "../../src/engine/advice";
const servers: Server[] = [];
async function start() {
  const server = createLocalAgentServer();
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
  it("replays an input save and returns a validated, uncommitted fallback proposal", async () => {
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
    expect(execute(world, advice.proposal!.command).location).toBe("archive");
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
});
