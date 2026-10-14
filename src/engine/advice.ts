import type { Command } from "./types";
export interface Proposal {
  command: Command;
  reason: string;
  label: string;
  costMinutes: number;
  source: "42-agent" | "fallback";
}
export interface Advice {
  proposal: Proposal | null;
  narration: string;
  mode: "agent" | "fallback";
  error?: string;
}
