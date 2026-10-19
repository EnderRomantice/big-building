export type InferenceCode =
  | "missing_key"
  | "auth"
  | "quota"
  | "rate_limit"
  | "service"
  | "network"
  | "invalid_response"
  | "timeout"
  | "unknown";
const messages: Record<InferenceCode, string> = {
  missing_key: "未配置 DeepSeek API Key，请检查 .env.local 并重启服务。",
  auth: "DeepSeek 凭据校验失败，请检查服务端 API Key。",
  quota: "DeepSeek 账户额度不足。",
  rate_limit: "DeepSeek 请求频率受限，请稍后重试。",
  service: "DeepSeek 服务暂不可用，请稍后重试。",
  network: "无法连接 DeepSeek，请检查网络后重试。",
  invalid_response: "DeepSeek 未返回有效的 NPC 回应，请重试。",
  timeout: "DeepSeek 回应超时，请重试。",
  unknown: "NPC 回应未能完成，请重试。",
};
/** Only these application-owned messages may cross the HTTP boundary. Never expose provider bodies. */
export class InferenceError extends Error {
  constructor(
    readonly code: InferenceCode,
    readonly retryable = false,
  ) {
    super(messages[code]);
    this.name = "InferenceError";
  }
}
export class DialogueError extends Error {
  constructor(readonly failure: InferenceError) {
    super(`${failure.message} 本次对话未结算，输入已保留。`);
    this.name = "DialogueError";
  }
}
export function inferenceFailure(
  error: unknown,
  signal?: AbortSignal,
): InferenceError {
  if (signal?.aborted) return new InferenceError("timeout");
  return error instanceof InferenceError
    ? error
    : new InferenceError("unknown");
}
