import { describe, expect, it } from "vitest";
import { createDeepSeekClient } from "./deepseek";
describe("DeepSeek transport boundary", () => {
  it("sends the key only to the official provider and encodes tool history", async () => {
    let sentUrl = "",
      sentBody: Record<string, unknown> = {},
      authorization = "";
    const client = createDeepSeekClient({
      apiKey: "test-only-not-a-real-key",
      fetcher: async (url, init) => {
        sentUrl = String(url);
        sentBody = JSON.parse(String(init?.body));
        authorization = (init?.headers as Record<string, string>).Authorization;
        return Response.json({
          choices: [
            {
              message: {
                content: "",
                tool_calls: [
                  {
                    id: "c2",
                    function: {
                      name: "propose_action",
                      arguments: '{"index":0,"reason":"探索"}',
                    },
                  },
                ],
              },
            },
          ],
        });
      },
    });
    const result = await client.complete({
      systemPrompt: "rules",
      tools: [],
      messages: [
        {
          role: "assistant",
          content: "",
          metadata: {
            toolCalls: [{ id: "c1", name: "read_observation", arguments: {} }],
          },
        },
        {
          role: "tool",
          content: "{}",
          toolCallId: "c1",
          name: "read_observation",
        },
      ],
    });
    expect(sentUrl).toBe("https://api.deepseek.com/chat/completions");
    expect(authorization).toBe("Bearer test-only-not-a-real-key");
    expect(sentBody.thinking).toEqual({ type: "disabled" });
    expect(sentBody.max_tokens).toBe(1024);
    expect(JSON.stringify(sentBody)).not.toContain("test-only-not-a-real-key");
    expect(result.toolCalls?.[0].arguments.index).toBe(0);
  });
  it("never returns the upstream error body to the game", async () => {
    const client = createDeepSeekClient({
      apiKey: "dummy",
      fetcher: async () =>
        new Response("sensitive-provider-body", { status: 401 }),
    });
    await expect(
      client.complete({ systemPrompt: "", tools: [], messages: [] }),
    ).rejects.toThrow("凭据校验失败");
  });
  it("forces the NPC action tool without forcing tools in the legacy advice flow", async () => {
    const bodies: Record<string, unknown>[] = [];
    const client = createDeepSeekClient({
      apiKey: "dummy",
      fetcher: async (_url, init) => {
        bodies.push(JSON.parse(String(init?.body)));
        return Response.json({
          choices: [
            {
              message: {
                content: "",
                tool_calls: [
                  {
                    id: "npc",
                    function: {
                      name: "npc_action",
                      arguments: '{"choice":"speak","text":"你好","done":true}',
                    },
                  },
                ],
              },
            },
          ],
        });
      },
    });
    const tool = {
      name: "npc_action",
      description: "回应",
      inputSchema: { type: "object" },
    };
    await client.complete({ systemPrompt: "", messages: [], tools: [tool] });
    await client.complete({
      systemPrompt: "",
      messages: [],
      tools: [{ ...tool, name: "propose_action" }],
    });
    expect(bodies[0].tool_choice).toEqual({
      type: "function",
      function: { name: "npc_action" },
    });
    expect(bodies[0].thinking).toEqual({ type: "disabled" });
    expect(bodies[1].tool_choice).toBeUndefined();
    await client.complete({
      systemPrompt: "",
      messages: [],
      tools: [
        { ...tool, name: "npc_speak" },
        { ...tool, name: "npc_end" },
      ],
    });
    expect(bodies[2].tool_choice).toBe("required");
  });
  it("classifies network, quota, rate limit and malformed responses without leaking provider data", async () => {
    const request = { systemPrompt: "", tools: [], messages: [] };
    for (const [status, code, retryable] of [
      [402, "quota", false],
      [429, "rate_limit", true],
      [503, "service", true],
    ] as const) {
      const client = createDeepSeekClient({
        apiKey: "dummy",
        fetcher: async () => new Response("private", { status }),
      });
      await expect(client.complete(request)).rejects.toMatchObject({
        code,
        retryable,
      });
    }
    const network = createDeepSeekClient({
      apiKey: "dummy",
      fetcher: async () => {
        throw new Error("private-network-detail");
      },
    });
    await expect(network.complete(request)).rejects.toMatchObject({
      code: "network",
      retryable: true,
    });
    const malformed = createDeepSeekClient({
      apiKey: "dummy",
      fetcher: async () =>
        Response.json({
          choices: [
            {
              message: {
                tool_calls: [
                  {
                    id: "c",
                    function: { name: "npc_action", arguments: "{broken" },
                  },
                ],
              },
            },
          ],
        }),
    });
    await expect(malformed.complete(request)).rejects.toMatchObject({
      code: "invalid_response",
      retryable: true,
    });
  });
});
