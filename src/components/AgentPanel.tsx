import { useRef, useState } from "react";
import { ArrowRight } from "lucide-react";
export default function AgentPanel({
  target,
  busy,
  disabled,
  onSend,
  onCancel,
}: {
  target: string;
  busy: boolean;
  disabled: boolean;
  onSend: (text: string) => Promise<boolean>;
  onCancel: () => void;
}) {
  const [text, setText] = useState("");
  const input = useRef<HTMLTextAreaElement>(null);
  async function send() {
    if (!text.trim() || busy || disabled) return;
    if (await onSend(text.trim())) setText("");
    input.current?.focus();
  }
  return (
    <div className="intent">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void send();
        }}
      >
        <label htmlFor="action-intent" className="conversation-target">
          {target}
        </label>
        <textarea
          ref={input}
          id="action-intent"
          aria-label="输入对话"
          value={text}
          maxLength={2000}
          rows={3}
          onChange={(event) => setText(event.target.value)}
          placeholder="说点什么……"
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
              取消回合
            </button>
          ) : (
            <button
              type="submit"
              className="text-button"
              disabled={!text.trim() || disabled}
            >
              发送 <ArrowRight size={14} />
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
