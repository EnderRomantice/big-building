import { spawn } from "node:child_process";
const children = [
  spawn(
    process.execPath,
    ["--import", "tsx", "integrations/42-agent/server.ts"],
    { stdio: "inherit" },
  ),
  spawn(
    process.execPath,
    [
      "node_modules/vite/bin/vite.js",
      "--host",
      "127.0.0.1",
      "--port",
      "5173",
      "--strictPort",
    ],
    { stdio: "inherit" },
  ),
];
let stopping = false;
function stop() {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill("SIGTERM");
}
for (const child of children)
  child.on("exit", (code) => {
    if (!stopping) {
      process.exitCode = code || 0;
      stop();
    }
  });
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
