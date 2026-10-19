import { useMotionState } from "../game/motion";
import { useRef, useState } from "react";
import { ArrowRight } from "lucide-react";
import type { Advice } from "../engine/advice";
import type { Command } from "../engine/types";

export default function AgentPanel({
  busy,
  disabled,
  revision,
  onSend,
  onPropose,
  onExecute,
  onCancel,
}: {
  busy: boolean;
  disabled: boolean;
  revision: number;
  onSend: (text: string) => Promise<boolean>;
  onPropose: (text: string) => Promise<Advice | null>;
  onExecute: (command: Command) => Promise<boolean>;
  onCancel: () => void;
}) {
  const [mode, setMode] = useMotionState<"action" | "say">("say");
  const [drafts, setDrafts] = useState({ action: "", say: "" });
  const [advice, setAdvice] = useMotionState<Advice | null>(null);
  const text = drafts[mode];
  const input = useRef<HTMLTextAreaElement>(null);
  const sending = useRef(false);
  const proposal = advice?.proposal;
  const stale = proposal && proposal.command.expectedRevision !== revision;
  async function send() {
    if (!text.trim() || busy || disabled || sending.current) return;
    sending.current = true;
    try {
      if (mode === "action") setAdvice(await onPropose(text.trim()));
      else if (await onSend(text.trim()))
        setDrafts((drafts) => ({ ...drafts, say: "" }));
    } finally {
      sending.current = false;
      input.current?.focus();
    }
  }
  async function confirm() {
    if (!proposal || stale || busy || disabled || sending.current) return;
    sending.current = true;
    try {
      if (await onExecute(proposal.command)) {
        setAdvice(null);
        setDrafts((drafts) => ({ ...drafts, action: "" }));
      }
    } finally {
      sending.current = false;
      input.current?.focus();
    }
  }
  return (
    <div className="intent">
      <div className="intent-modes" role="group" aria-label="输入模式">
        <button
          type="button"
          aria-pressed={mode === "action"}
          disabled={busy}
          onClick={() => {
            setMode("action");
            setAdvice(null);
          }}
        >
          行动
        </button>
        <button
          type="button"
          aria-pressed={mode === "say"}
          disabled={busy}
          onClick={() => {
            setMode("say");
            setAdvice(null);
          }}
        >
          说话 / Say
        </button>
      </div>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void send();
        }}
      >
        <label htmlFor="action-intent" className="conversation-target">
          {mode === "say" ? "对当前场景说" : "你想做什么？"}
        </label>
        <textarea
          ref={input}
          id="action-intent"
          aria-label={mode === "say" ? "输入对话" : "输入行动"}
          aria-describedby="intent-mode-help"
          value={text}
          maxLength={2000}
          rows={3}
          onChange={(event) => {
            setDrafts({ ...drafts, [mode]: event.target.value });
            setAdvice(null);
          }}
          placeholder={
            mode === "say" ? "说点什么……" : "例如：前往书库，或治疗自己……"
          }
          disabled={disabled}
          readOnly={busy}
          aria-busy={busy}
          onKeyDown={(event) => {
            if (
              event.key === "Enter" &&
              !event.shiftKey &&
              !event.nativeEvent.isComposing &&
              event.keyCode !== 229
            ) {
              event.preventDefault();
              void send();
            }
          }}
        />
        <div className="intent-footer">
          <span>Enter 发送 · Shift + Enter 换行</span>
          {busy ? (
            <button type="button" className="quiet" onClick={onCancel}>
              取消
            </button>
          ) : (
            <button
              type="submit"
              className="text-button"
              disabled={!text.trim() || disabled}
            >
              {mode === "say" ? "说话" : "识别行动"}
              <ArrowRight size={14} />
            </button>
          )}
        </div>
      </form>
      <p id="intent-mode-help" className="hint">
        {mode === "say"
          ? "作为角色台词发送，描述动作不会执行动作。"
          : "识别为可执行动作，确认后才消耗时间与能量。"}
      </p>
      {mode === "action" && advice && (
        <div className="intent-proposal" aria-live="polite">
          <p>{advice.narration}</p>
          {proposal ? (
            <>
              <h3>{proposal.label}</h3>
              <p>
                {proposal.costMinutes} 分钟
                {proposal.energyCost ? ` · ${proposal.energyCost} 能量` : ""}
              </p>
              {proposal.confirmation && (
                <p className="proposal-warning">{proposal.confirmation}</p>
              )}
              {stale && <p role="alert">场景已变化，请重新识别行动。</p>}
              <div className="proposal-actions">
                <button
                  className="quiet"
                  disabled={busy}
                  onClick={() => setAdvice(null)}
                >
                  取消
                </button>
                <button
                  className="primary-button"
                  disabled={busy || disabled || Boolean(stale)}
                  onClick={() => void confirm()}
                >
                  确认行动
                </button>
              </div>
            </>
          ) : (
            <p className="hint">没有执行任何动作，输入已保留。</p>
          )}
        </div>
      )}
    </div>
  );
}
