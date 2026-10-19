import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { loadEnvFile } from "node:process";
import { pathToFileURL } from "node:url";
import type { ModelClient } from "42-agent";
import { replay } from "../../src/engine/engine";
import type { HeroId } from "../../src/engine/types";
import { DialogueError } from "./errors";
import { runTurn } from "./turn";
import { proposeAction } from "./adapter";
import { createDeepSeekClient } from "./deepseek";

function json(res: ServerResponse, status: number, body: unknown) {
  if (res.destroyed) return;
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  res.end(JSON.stringify(body));
}
async function readJson(req: IncomingMessage) {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 1_000_000) throw new Error("请求超过 1 MB 上限。");
    chunks.push(Buffer.from(chunk));
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<
    string,
    unknown
  >;
}
/** Local inference bridge only. It does not own or persist the authoritative game state. */
export function createLocalAgentServer(
  model?: ModelClient,
  modelName = "deepseek-flash",
) {
  let busy = false;
  const controllers = new Set<AbortController>();
  const server = createServer(async (req, res) => {
    if (!/^(127\.0\.0\.1|localhost):\d+$/.test(req.headers.host ?? ""))
      return json(res, 403, { error: "仅允许本地访问。" });
    if (
      req.headers.origin &&
      !["http://127.0.0.1:5173", "http://localhost:5173"].includes(
        req.headers.origin,
      )
    )
      return json(res, 403, { error: "请求来源未获允许。" });
    if (req.method === "GET" && req.url === "/api/agent/status")
      return json(res, 200, {
        available: Boolean(model),
        busy,
        provider: model ? "DeepSeek" : "本地规则",
        runtime: "42-agent",
        model: model ? modelName : null,
      });
    if (
      req.method !== "POST" ||
      !["/api/agent/advice", "/api/agent/turn"].includes(req.url ?? "")
    )
      return json(res, 404, { error: "不存在的接口。" });
    if (!req.headers["content-type"]?.startsWith("application/json"))
      return json(res, 415, { error: "需要 JSON 请求。" });
    if (busy)
      return json(res, 429, { error: "上一回合仍在进行，请稍后再试。" });
    busy = true;
    const controller = new AbortController();
    controllers.add(controller);
    res.on("close", () => {
      if (!res.writableEnded) controller.abort();
    });
    try {
      const body = await readJson(req);
      if (!body || typeof body !== "object") throw new Error("请求格式错误。");
      if (req.url === "/api/agent/turn") {
        const world = replay(body.replay);
        const result = await runTurn({
          world,
          command: body.command,
          model,
          signal: controller.signal,
          onFailure: (diagnostic) =>
            console.warn("[agent:turn]", JSON.stringify(diagnostic)),
        });
        return json(res, 200, result);
      }
      if (
        !body ||
        typeof body !== "object" ||
        !["ranger", "mage", "warden"].includes(String(body.actor)) ||
        typeof body.intent !== "string" ||
        !body.intent.trim() ||
        body.intent.length > 4000
      )
        throw new Error("行动意图或角色格式错误。");
      const world = replay(body.replay);
      if (world.playerId && body.actor !== world.playerId)
        throw new Error("只能控制自己的角色。");
      const advice = await proposeAction({
        world,
        actor: body.actor as HeroId,
        intent: body.intent,
        model,
        signal: controller.signal,
        timeoutMs: 45000,
      });
      json(res, 200, advice);
    } catch (error) {
      if (!controller.signal.aborted)
        json(res, error instanceof DialogueError ? 503 : 400, {
          ...(error instanceof DialogueError
            ? { code: error.failure.code }
            : {}),
          error: error instanceof Error ? error.message : "无法生成建议。",
        });
    } finally {
      busy = false;
      controllers.delete(controller);
    }
  });
  server.requestTimeout = 10000;
  server.on("close", () => {
    for (const controller of controllers) controller.abort();
  });
  return server;
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    loadEnvFile(".env.local");
  } catch {
    /* Missing credentials leave rule-only advice available. */
  }
  const model = process.env.DEEPSEEK_API_KEY
    ? createDeepSeekClient({
        apiKey: process.env.DEEPSEEK_API_KEY,
        model: process.env.DEEPSEEK_MODEL,
      })
    : undefined;
  const server = createLocalAgentServer(model, process.env.DEEPSEEK_MODEL);
  server.listen(5174, "127.0.0.1", () =>
    console.log(
      `Local agent bridge: http://127.0.0.1:5174 (${model ? "DeepSeek via 42-agent" : "rule fallback"})`,
    ),
  );
  server.on("error", (error) => {
    console.error(
      `Agent bridge startup failed: ${(error as NodeJS.ErrnoException).code ?? "unknown"}`,
    );
    process.exitCode = 1;
  });
  const close = () => {
    server.close();
    server.closeAllConnections();
  };
  process.on("SIGTERM", close);
  process.on("SIGINT", close);
}
