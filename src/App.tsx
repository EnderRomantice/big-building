import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { activeNpcs, clockText, createWorld, dayText } from "./engine/engine";
import { legalOptions } from "./engine/actions";
import type { ActionOption } from "./engine/actions";
import { SCENARIOS } from "./engine/content";
import type { JournalEntry, NpcId } from "./engine/types";
import { useJourney } from "./game/useJourney";
import PlayerPanel from "./components/PlayerPanel";
import SceneGrid from "./components/SceneGrid";
import JourneyMenu from "./components/JourneyMenu";
import Modal from "./components/Modal";

export default function App() {
  const game = useJourney();
  const { world, actorId } = game;
  const hero = world.heroes.find((h) => h.id === actorId)!;
  const nearby = activeNpcs(world);
  const options = useMemo(() => legalOptions(world, actorId), [world, actorId]);
  const [selected, setSelected] = useState<NpcId | null>(null);
  const target = nearby.find((npc) => npc.id === selected) ?? nearby[0];
  const [menu, setMenu] = useState(false);
  const [confirmation, setConfirmation] = useState<{
    option: ActionOption;
    session: number;
  } | null>(null);
  const closeConfirmation = useCallback(() => setConfirmation(null), []);
  const closeMenu = useCallback(() => setMenu(false), []);
  const conversation = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = conversation.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [world.revision]);
  const pending = Boolean(world.turn?.queue.length);
  const locked = game.busy || pending;
  function request(option: ActionOption) {
    if (locked) return;
    if (option.confirmation) setConfirmation({ option, session: game.session });
    else void game.act(option.command);
  }
  const stale =
    confirmation &&
    (confirmation.session !== game.session ||
      confirmation.option.command.expectedRevision !== world.revision);
  return (
    <div className="page">
      <header className="masthead">
        <a
          className="wordmark"
          href="#main"
          aria-label="Big Building，回到场景"
        >
          Big Building
        </a>
        <button
          className="quiet"
          disabled={game.busy}
          onClick={() => setMenu(true)}
        >
          旅程 <ChevronDown size={12} />
        </button>
      </header>
      <main id="main" className="workspace">
        <aside className="controls" aria-label="操作区">
          <PlayerPanel
            key={game.session}
            world={world}
            hero={hero}
            target={target}
            options={options}
            busy={game.busy}
            disabled={pending}
            onAction={request}
            onCancel={game.cancel}
            onSend={(text) =>
              game.act({
                type: "say",
                actor: actorId,
                id: crypto.randomUUID(),
                expectedRevision: world.revision,
                target: target?.id ?? "narrator",
                text,
              })
            }
          />
          {game.busy && (
            <p className="hint" role="status">
              在场人物正在回应…
            </p>
          )}
          {pending && !game.busy && (
            <button className="text-button" onClick={() => void game.act()}>
              继续未完成的 NPC 回合 →
            </button>
          )}
          {game.error && (
            <p className="notice error" role="alert">
              {game.error}
            </p>
          )}
          {game.warning && (
            <p className="notice" role="status">
              {game.warning}
            </p>
          )}
          {game.saveError && (
            <p className="notice error" role="alert">
              {game.saveError}
              <button onClick={() => setMenu(true)}>打开存档</button>
            </p>
          )}
        </aside>
        <div className="chapter-line">
          <span>{SCENARIOS[world.scenario].name}</span>
          <span>
            {dayText(world.minute)} <time>{clockText(world.minute)}</time>
          </span>
        </div>
        <SceneGrid
          world={world}
          options={options}
          nearby={nearby}
          selected={target?.id ?? null}
          busy={locked}
          onSelect={setSelected}
          onAction={request}
        />
        <section className="conversation" aria-label="对话与行动记录">
          <div className="scene-heading">
            <h2>此刻</h2>
            <span>
              {game.busy
                ? "回应中"
                : !hero.hp || hero.retired
                  ? "旅程已结束"
                  : "轮到你行动"}
            </span>
          </div>
          <div
            ref={conversation}
            className="conversation-entries"
            role="log"
            tabIndex={0}
            aria-live="polite"
            aria-relevant="additions"
          >
            {world.journal.slice(-8).map((entry) => (
              <JournalItem key={entry.id} entry={entry} />
            ))}
          </div>
          {world.journal.length > 8 && (
            <details className="disclosure history">
              <summary tabIndex={0}>
                更早的记录 <ChevronDown size={12} />
              </summary>
              {world.journal.slice(0, -8).map((entry) => (
                <JournalItem key={entry.id} entry={entry} />
              ))}
            </details>
          )}
        </section>
      </main>
      {menu && (
        <JourneyMenu
          world={world}
          onClose={closeMenu}
          onRestore={(next) => {
            game.dispatch({ type: "replace", world: next });
            setSelected(null);
            closeMenu();
          }}
          onReset={() => {
            game.dispatch({ type: "replace", world: createWorld() });
            setSelected(null);
            closeMenu();
          }}
        />
      )}
      {confirmation && (
        <Modal title={confirmation.option.label} onClose={closeConfirmation}>
          <p className="modal-copy">{confirmation.option.confirmation}</p>
          {stale && <p role="alert">状态已经变化，请重新选择行动。</p>}
          <div className="modal-actions">
            <button className="quiet" onClick={closeConfirmation}>
              取消
            </button>
            <button
              className="primary-button"
              disabled={Boolean(stale) || locked}
              onClick={() => {
                void game.act(confirmation.option.command);
                closeConfirmation();
              }}
            >
              发起攻击
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
function JournalItem({ entry }: { entry: JournalEntry }) {
  return (
    <article
      className={`journal-item ${entry.tone === "dialogue" ? "dialogue-entry" : ""}`}
    >
      <div className="journal-heading">
        <h3>{entry.title}</h3>
        <time>
          {dayText(entry.minute)} · {clockText(entry.minute)}
        </time>
      </div>
      <p>{entry.text}</p>
      {entry.formula && (
        <details className="calculation">
          <summary tabIndex={0}>查看计算</summary>
          <p>{entry.formula}</p>
        </details>
      )}
    </article>
  );
}
