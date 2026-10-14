import { useEffect, useRef, useState } from "react";
import { ArrowRight, Check, LoaderCircle, Sparkles, X } from "lucide-react";
import type { Advice } from "../engine/advice";
import type { Command, HeroId, World } from "../engine/types";
import { toReplay } from "../engine/engine";

export default function AgentPanel({
  world,
  actorId,
  onCommit,
}: {
  world: World;
  actorId: HeroId;
  onCommit: (command: Command) => void;
}) {
  const [intent, setIntent] = useState("");
  const [busy, setBusy] = useState(false);
  const [advice, setAdvice] = useState<Advice | null>(null);
  const [error, setError] = useState("");
  const [available, setAvailable] = useState<boolean | null>(null);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => {
    const statusController = new AbortController();
    fetch("/api/agent/status", { signal: statusController.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data) => setAvailable(data.available === true))
      .catch(() => {
        if (!statusController.signal.aborted) setAvailable(false);
      });
    return () => statusController.abort();
  }, []);
  useEffect(
    () => () => {
      controller.current?.abort();
    },
    [world.revision, actorId],
  );
  const actor = world.heroes.find((h) => h.id === actorId)!;
  const command = advice?.proposal?.command;
  const stale = Boolean(
    command &&
      (command.expectedRevision !== world.revision ||
        command.actor !== actorId),
  );
  async function ask() {
    if (!intent.trim() || busy) return;
    const current = new AbortController();
    controller.current = current;
    setBusy(true);
    setError("");
    setAdvice(null);
    try {
      const response = await fetch("/api/agent/advice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: current.signal,
        body: JSON.stringify({
          replay: toReplay(world),
          actor: actorId,
          intent: intent.trim(),
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "建议服务暂不可用。");
      if (!current.signal.aborted) setAdvice(data as Advice);
    } catch (e) {
      if (!current.signal.aborted)
        setError(
          e instanceof Error
            ? e.message
            : "无法连接本地 Agent，请确认 npm run dev 已启动。",
        );
    } finally {
      if (controller.current === current) {
        setBusy(false);
        controller.current = null;
      }
    }
  }
  return (
    <section className="agent-panel">
      <div className="panel-header">
        <span>
          <Sparkles size={16} /> 自由描述你的行动
        </span>
        <span className="agent-badge">
          {available === null
            ? "连接中"
            : available
              ? "DeepSeek · 42-agent"
              : "本地规则建议"}
        </span>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void ask();
        }}
      >
        <label htmlFor="action-intent" className="sr-only">
          描述行动意图
        </label>
        <textarea
          id="action-intent"
          value={intent}
          maxLength={4000}
          onChange={(e) => setIntent(e.target.value)}
          placeholder="例如：先去书库找找王座的秘密，别急着介入王位之争……"
          rows={2}
        />
        <div className="agent-input-footer">
          <span>以{actor.name}的视角 · 建议经规则校验后，由你确认</span>
          {busy ? (
            <button
              type="button"
              className="secondary-button"
              onClick={() => controller.current?.abort()}
            >
              <LoaderCircle className="spinning" size={14} /> 生成中{" "}
              <X size={13} />
            </button>
          ) : (
            <button
              className="agent-ask"
              type="submit"
              disabled={!intent.trim() || actor.retired || actor.hp <= 0}
            >
              生成行动建议 <ArrowRight size={14} />
            </button>
          )}
        </div>
      </form>
      {error && (
        <div className="agent-error" role="alert">
          {error}
        </div>
      )}
      {advice && (
        <div className="agent-result" aria-live="polite">
          <div className="agent-result-meta">
            <span>
              {advice.mode === "agent" ? "Agent 建议" : "本地兜底建议"}
            </span>
            <span>{stale ? "状态已变化，请重新生成" : "尚未执行"}</span>
          </div>
          {advice.narration && <p>{advice.narration.replace(/\*\*/g, "")}</p>}
          {advice.error && <small>{advice.error}</small>}
          {advice.proposal && (
            <div className="proposal">
              <div>
                <strong>
                  {advice.proposal.label}{" "}
                  <small>· {advice.proposal.costMinutes ?? "—"} 分钟</small>
                </strong>
                <span>{advice.proposal.reason}</span>
              </div>
              <button
                className="primary-button"
                disabled={stale || actor.retired || !actor.hp}
                onClick={() => {
                  if (command) onCommit(command);
                }}
              >
                <Check size={14} /> 确认执行
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
