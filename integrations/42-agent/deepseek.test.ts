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
});
