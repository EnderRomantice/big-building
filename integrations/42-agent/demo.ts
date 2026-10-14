import { readFile } from "node:fs/promises";
import { loadEnvFile } from "node:process";
import { createDeepSeekClient } from "./deepseek";
import type { ModelClient } from "42-agent";
import { createWorld, replay } from "../../src/engine/engine";
import { proposeAction } from "./adapter";
const fileIndex = process.argv.indexOf("--replay");
const world =
  fileIndex >= 0
    ? replay(JSON.parse(await readFile(process.argv[fileIndex + 1], "utf8")))
    : createWorld();
const live = process.argv.includes("--live");
const intentIndex = process.argv.indexOf("--intent");
const intent =
  intentIndex >= 0
    ? process.argv[intentIndex + 1]
    : "我想先去书库调查王座的秘密。";
let model: ModelClient;
if (live) {
  // Credentials are only read by this Node process; never bundled into React or saved in a replay.
  try {
    loadEnvFile(".env.local");
  } catch {
    /* Read externally supplied environment instead. */
  }
  if (!process.env.DEEPSEEK_API_KEY)
    throw new Error(
      "Live mode requires DEEPSEEK_API_KEY in the Node environment.",
    );
  model = createDeepSeekClient({
    apiKey: process.env.DEEPSEEK_API_KEY,
    model: process.env.DEEPSEEK_MODEL,
  });
} else {
  // Scripted test provider. This exercises the real 42-agent loop and tools without a model API.
  let round = 0;
  model = {
    async complete({ messages }) {
      round++;
      if (round === 1)
        return {
          toolCalls: [
            { id: "observe", name: "read_observation", arguments: {} },
          ],
        };
      if (round === 2) {
        const tool = messages.findLast(
          (m) => m.role === "tool" && m.name === "read_observation",
        );
        const data = JSON.parse(tool!.content) as {
          options: { index: number; label: string }[];
        };
        const option =
          data.options.find((o) => o.label === "前往秘典书库") ??
          data.options[0];
        if (!option) return { content: "没有可执行的行动。" };
        return {
          toolCalls: [
            {
              id: "proposal",
              name: "propose_action",
              arguments: {
                index: option.index,
                reason: "先获取王座知识，再决定如何干预。",
              },
            },
          ],
        };
      }
      return {
        content: "建议前往秘典书库。此建议尚未执行，世界状态保持不变。",
      };
    },
  };
}
const actor = world.heroes.find((h) => !h.retired && h.hp > 0)?.id ?? "ranger";
const before = JSON.stringify(world);
const advice = await proposeAction({ world, actor, intent, model });
console.log(
  JSON.stringify(
    {
      provider: live ? "DeepSeek" : "scripted test provider (no LLM)",
      advice,
      worldUnchanged: before === JSON.stringify(world),
    },
    null,
    2,
  ),
);
