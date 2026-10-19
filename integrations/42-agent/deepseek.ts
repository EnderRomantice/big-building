import { InferenceError } from "./errors";
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
  tool_choice?: "required" | { type: "function"; function: { name: string } };
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
  if (!config.apiKey) throw new InferenceError("missing_key");
  const model = config.model ?? "deepseek-flash";
  const client = new AdaptedModelClient<ChatRequest, ChatResponse, never>(
    {
      async complete(body, signal) {
        let response: Response;
        try {
          response = await (config.fetcher ?? fetch)(
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
        } catch (error) {
          if (signal?.aborted) throw error;
          throw new InferenceError("network", true);
        }
        if (!response.ok) {
          await response.body?.cancel();
          const status = response.status;
          throw new InferenceError(
            status === 401 || status === 403
              ? "auth"
              : status === 402
                ? "quota"
                : status === 429
                  ? "rate_limit"
                  : "service",
            status === 429 || status >= 500,
          );
        }
        try {
          return (await response.json()) as ChatResponse;
        } catch (error) {
          if (signal?.aborted) throw error;
          throw new InferenceError("invalid_response", true);
        }
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
          ...(request.tools.some((t) => t.name === "npc_end")
            ? { tool_choice: "required" as const }
            : request.tools.length === 1 &&
                request.tools[0].name === "npc_action"
              ? {
                  tool_choice: {
                    type: "function" as const,
                    function: { name: "npc_action" },
                  },
                }
              : {}),
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
        try {
          const choice = response.choices?.[0];
          if (!choice?.message || choice.finish_reason === "length")
            throw new Error("Incomplete response");
          return {
            content: choice.message.content ?? "",
            toolCalls: choice.message.tool_calls?.map((c) => {
              const args: unknown = JSON.parse(c.function.arguments);
              if (!args || typeof args !== "object" || Array.isArray(args))
                throw new Error("Invalid arguments");
              return {
                id: c.id,
                name: c.function.name,
                arguments: args as Record<string, unknown>,
              };
            }),
          };
        } catch {
          throw new InferenceError("invalid_response", true);
        }
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
