import { AdaptedModelClient } from "42-agent/provider";
import type { ModelClient, ModelRequest, ToolCall } from "42-agent";
interface ChatMessage {
  role: string;
  content: string | null;
  tool_calls?: unknown[];
  tool_call_id?: string;
  name?: string;
}
interface ChatRequest {
  model: string;
  messages: ChatMessage[];
  tools: unknown[];
  stream: false;
  max_tokens: number;
  thinking: { type: "disabled" };
}
interface ChatResponse {
  choices?: {
    finish_reason?: string;
    message?: {
      content?: string;
      tool_calls?: {
        id: string;
        function: { name: string; arguments: string };
      }[];
    };
  }[];
}
/** Official DeepSeek endpoint only. The API key never leaves the Node transport closure. */
export function createDeepSeekClient(config: {
  apiKey: string;
  model?: string;
  fetcher?: typeof fetch;
}): ModelClient {
  if (!config.apiKey) throw new Error("缺少 DeepSeek 凭据。");
  const model = config.model ?? "deepseek-flash";
  const client = new AdaptedModelClient<ChatRequest, ChatResponse, never>(
    {
      async complete(body, signal) {
        const response = await (config.fetcher ?? fetch)(
          "https://api.deepseek.com/chat/completions",
          {
            method: "POST",
            signal,
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${config.apiKey}`,
            },
            body: JSON.stringify(body),
          },
        );
        if (!response.ok) {
          await response.body?.cancel();
          throw new Error(
            response.status === 401
              ? "DeepSeek 凭据校验失败。"
              : response.status === 402
                ? "DeepSeek 账户额度不足。"
                : response.status === 429
                  ? "DeepSeek 请求频率受限，请稍后再试。"
                  : `DeepSeek 服务暂不可用（HTTP ${response.status}）。`,
          );
        }
        return (await response.json()) as ChatResponse;
      },
    },
    {
      toProviderRequest(request: ModelRequest) {
        const messages: ChatMessage[] = [
          { role: "system", content: request.systemPrompt },
        ];
        for (const m of request.messages) {
          if (m.role === "tool")
            messages.push({
              role: "tool",
              content: m.content,
              name: m.name,
              tool_call_id: m.toolCallId,
            });
          else if (m.role === "assistant") {
            const calls = m.metadata?.toolCalls as ToolCall[] | undefined;
            messages.push({
              role: "assistant",
              content: m.content || null,
              ...(calls?.length
                ? {
                    tool_calls: calls.map((c) => ({
                      id: c.id,
                      type: "function",
                      function: {
                        name: c.name,
                        arguments: JSON.stringify(c.arguments),
                      },
                    })),
                  }
                : {}),
            });
          } else messages.push({ role: m.role, content: m.content });
        }
        return {
          model,
          messages,
          stream: false,
          thinking: { type: "disabled" },
          max_tokens: 1024,
          tools: request.tools.map((t) => ({
            type: "function",
            function: {
              name: t.name,
              description: t.description,
              parameters: t.inputSchema,
            },
          })),
        };
      },
      fromProviderResponse(response) {
        const choice = response.choices?.[0];
        if (!choice?.message || choice.finish_reason === "length")
          throw new Error("DeepSeek 返回了不完整的建议，请重试。");
        return {
          content: choice.message.content ?? "",
          toolCalls: choice.message.tool_calls?.map((c) => ({
            id: c.id,
            name: c.function.name,
            arguments: JSON.parse(c.function.arguments) as Record<
              string,
              unknown
            >,
          })),
        };
      },
      fromProviderStreamEvent() {
        return null;
      },
    },
  );
  return {
    capabilities: { contextWindowTokens: 32000, maxOutputTokens: 1024 },
    complete: (request) => client.complete(request),
  };
}
