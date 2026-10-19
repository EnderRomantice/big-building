import {
  enableCareers,
  enterCharacter,
  readCharacters,
  rememberCharacter,
  saveCharacter,
} from "./game/characters";
import { characterFromWorld, type CharacterRecord } from "./engine/careers";
import Home from "./components/Home";
import { createSuccession } from "./engine/succession";
import { replay, toReplay, ensureAdventure } from "./engine/engine";
import { journeySlot } from "./game/journey";
import { useMotionState } from "./game/motion";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { activeNpcs, clockText, createWorld, dayText } from "./engine/engine";
import { legalOptions } from "./engine/actions";
import type { ActionOption } from "./engine/actions";
import { SCENARIOS } from "./engine/content";
import type {
  ActionAim,
  Command,
  HeroId,
  JournalEntry,
  NpcId,
} from "./engine/types";
import { useJourney } from "./game/useJourney";
import PlayerPanel from "./components/PlayerPanel";
import SceneGrid from "./components/SceneGrid";
import JourneyMenu from "./components/JourneyMenu";
import Modal from "./components/Modal";
import RegionMap from "./components/LocalMap";
import CharacterDetails from "./components/CharacterDetails";

type ContentView =
  | { kind: "scene" | "map" }
  | { kind: "person"; id: HeroId | NpcId };

export default function App() {
  const game = useJourney();
  const [home, setHome] = useMotionState(true);
  const [profileName, setProfileName] = useState(() => {
    try {
      return localStorage.getItem("big-building:profile-name") || "旅人";
    } catch {
      return "旅人";
    }
  });
  const [homeError, setHomeError] = useState("");
  const [characters, setCharacters] = useState<CharacterRecord[]>([]);
  useEffect(() => {
    if (home)
      try {
        setCharacters(readCharacters());
      } catch {
        setHomeError("角色档案无法读取，请保留浏览器存档。");
      }
  }, [home, game.world]);
  useEffect(() => {
    if (
      !game.world.careersVersion &&
      !game.world.turn?.queue.length &&
      !game.busy
    )
      game.dispatch({ type: "replace", world: enableCareers(game.world) });
  }, [game.world, game.busy]);
  function enterScript(
    script: "succession" | "crown",
    actor: HeroId,
    profile?: CharacterRecord,
  ) {
    if (game.busy) return;
    try {
      localStorage.setItem(
        journeySlot(game.world),
        JSON.stringify(toReplay(game.world)),
      );
      rememberCharacter(game.world);
      if (profile)
        profile = readCharacters().find((p) => p.id === profile!.id) ?? profile;
      const seed = crypto.getRandomValues(new Uint32Array(1))[0];
      let fresh =
        script === "succession"
          ? createSuccession(seed, actor)
          : ensureAdventure(createWorld(seed));
      fresh = enableCareers(fresh);
      if (profile) fresh = enterCharacter(fresh, profile);
      const saved = localStorage.getItem(journeySlot(fresh));
      let target = saved ? enableCareers(replay(JSON.parse(saved))) : fresh;
      if (profile) {
        rememberCharacter(target);
        profile = readCharacters().find((p) => p.id === profile!.id) ?? profile;
        target = enterCharacter(target, profile);
      }
      game.dispatch({
        type: "replace",
        world: target,
      });
      setHomeError("");
      setAim(null);
      setHome(false);
    } catch (error) {
      setHomeError(
        error instanceof Error
          ? error.message
          : "无法打开剧本，当前旅程仍保留。",
      );
    }
  }

  const { world, actorId } = game;
  const hero = world.heroes.find((h) => h.id === actorId)!;
  const nearby = activeNpcs(world);
  const options = useMemo(() => legalOptions(world, actorId), [world, actorId]);
  const [aim, setAim] = useMotionState<{
    kind: ActionAim;
    revision: number;
    session: number;
  } | null>(null);
  const [content, setContent] = useMotionState<{
    view: ContentView;
    context: string;
  } | null>(null);
  const contentContext = `${game.session}:${world.scenario}:${world.location}`;
  const view: ContentView =
    content?.context === contentContext ? content.view : { kind: "scene" };
  function showContent(view: ContentView) {
    setContent({ view, context: contentContext });
  }
  function inspectPerson(id: HeroId | NpcId) {
    setAim(null);
    showContent({ kind: "person", id });
  }
  const aimTrigger = useRef<HTMLButtonElement | null>(null);
  const aiming =
    aim?.revision === world.revision && aim.session === game.session
      ? aim
      : null;
  const cancelAim = useCallback(() => {
    setAim(null);
    aimTrigger.current?.focus();
  }, []);
  useEffect(() => {
    if (!aiming) return;
    const cancel = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        cancelAim();
      }
    };
    document.addEventListener("keydown", cancel);
    return () => document.removeEventListener("keydown", cancel);
  }, [aiming, cancelAim]);
  const [menu, setMenu] = useMotionState(false);
  const [confirmation, setConfirmation] = useMotionState<{
    option: ActionOption;
    session: number;
  } | null>(null);
  const closeConfirmation = useCallback(() => setConfirmation(null), []);
  const closeMenu = useCallback(() => setMenu(false), []);
  const conversation = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = conversation.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [world.revision, view.kind]);
  const pending = Boolean(world.turn?.queue.length);
  const locked = game.busy || pending;
  function request(option: ActionOption) {
    if (locked) return;
    setAim(null);
    if (
      option.command.type !== "move" &&
      option.command.type !== "unlock_skill"
    )
      showContent({ kind: "scene" });
    if (option.confirmation) setConfirmation({ option, session: game.session });
    else void game.act(option.command);
  }
  function chooseTarget(id: HeroId | NpcId) {
    if (!aiming || locked) return;
    const option = options.find((o) =>
      aiming.kind.startsWith("job-")
        ? o.command.type === "invoke" &&
          o.command.skill === aiming.kind &&
          o.command.target === id
        : aiming.kind.startsWith("art-")
          ? o.command.type === "cast" &&
            o.command.skill === aiming.kind &&
            o.command.target === id
          : aiming.kind === "heal"
            ? o.command.type === "mend" && o.command.target === id
            : (o.command.type === "strike" || o.command.type === "assault") &&
              o.command.target === id &&
              o.command.skill === (aiming.kind === "skill"),
    );
    if (option) request(option);
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
        <nav className="masthead-nav" aria-label="主导航">
          <button
            className="quiet"
            aria-current={home ? "page" : undefined}
            disabled={game.busy}
            onClick={() => {
              setAim(null);
              setHome(true);
            }}
          >
            Home
          </button>
          <button
            className="user-identity"
            disabled={game.busy}
            onClick={() => setHome(true)}
            aria-label={`用户 ${profileName}，打开 Home`}
          >
            <span className="user-avatar" aria-hidden="true">
              {profileName.slice(0, 1)}
            </span>
            <span>{profileName}</span>
          </button>
          <button
            className="quiet"
            disabled={game.busy}
            onClick={() => {
              setAim(null);
              setMenu(true);
            }}
          >
            旅程 <ChevronDown size={12} />
          </button>
        </nav>
      </header>
      {homeError && (
        <p className="notice error" role="alert">
          {homeError}
        </p>
      )}
      {home ? (
        <Home
          world={world}
          name={profileName}
          busy={game.busy}
          onName={(name) => {
            try {
              localStorage.setItem("big-building:profile-name", name);
              setProfileName(name);
              setHomeError("");
            } catch {
              setHomeError("称呼保存失败，请检查浏览器存储。");
            }
          }}
          characters={characters}
          onCreate={(profile) => {
            try {
              saveCharacter(profile);
              setCharacters(readCharacters());
              setHomeError("");
              return true;
            } catch {
              setHomeError("角色保存失败，请检查浏览器存储。");
              return false;
            }
          }}
          onResume={() => setHome(false)}
          onEnter={enterScript}
        />
      ) : (
        <main id="main" className="workspace">
          <aside className="controls" aria-label="操作区">
            <PlayerPanel
              key={game.session}
              world={world}
              hero={hero}
              onInspect={() => inspectPerson(hero.id)}
              aiming={aiming?.kind ?? null}
              onChooseAction={(skill, trigger) => {
                if (locked) return;
                showContent({ kind: "scene" });
                aimTrigger.current = trigger;
                setAim({
                  kind: skill,
                  revision: world.revision,
                  session: game.session,
                });
              }}
              onCancelAim={cancelAim}
              options={options}
              busy={game.busy}
              disabled={pending}
              onAction={request}
              onCancel={game.cancel}
              onPropose={(text) => {
                setAim(null);
                return game.propose(text);
              }}
              onExecute={(command: Command) => {
                setAim(null);
                showContent({ kind: "scene" });
                return game.act(command);
              }}
              onSend={(text) => {
                setAim(null);
                showContent({ kind: "scene" });
                return game.act({
                  type: "say",
                  actor: actorId,
                  id: crypto.randomUUID(),
                  expectedRevision: world.revision,
                  target: "narrator",
                  text,
                });
              }}
            />
            {game.busy && (
              <p className="hint" role="status">
                {game.movingTo
                  ? "移动中…"
                  : game.planning
                    ? "正在识别行动…"
                    : "在场人物正在回应…"}
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
                <button
                  onClick={() => {
                    setAim(null);
                    setMenu(true);
                  }}
                >
                  打开存档
                </button>
              </p>
            )}
          </aside>
          <div className="chapter-line">
            <span>{SCENARIOS[world.scenario].name}</span>
            <span>
              {dayText(world.minute)} <time>{clockText(world.minute)}</time>
            </span>
          </div>
          <section className="content-panel" aria-label="内容区">
            <nav className="content-nav" aria-label="内容切换">
              <button
                aria-pressed={view.kind === "scene"}
                onClick={() => {
                  setAim(null);
                  showContent({ kind: "scene" });
                }}
              >
                场景
              </button>
              <button
                aria-pressed={view.kind === "map"}
                onClick={() => {
                  setAim(null);
                  showContent({ kind: "map" });
                }}
              >
                地图
              </button>
              {view.kind === "person" && (
                <span aria-current="page">人物详情</span>
              )}
            </nav>
            {view.kind === "map" ? (
              <RegionMap
                key={game.session}
                world={world}
                options={options}
                busy={locked}
                aiming={false}
                movingTo={game.movingTo}
                onAction={request}
              />
            ) : view.kind === "person" ? (
              <CharacterDetails
                world={world}
                id={view.id}
                options={options}
                busy={locked}
                onAction={request}
              />
            ) : (
              <>
                <SceneGrid
                  key={game.session}
                  world={world}
                  options={options}
                  nearby={nearby}
                  aiming={aiming?.kind ?? null}
                  busy={locked}
                  onSelect={chooseTarget}
                  onInspect={inspectPerson}
                  onCancelAim={cancelAim}
                  onAction={request}
                />
                <section className="conversation" aria-label="对话与行动记录">
                  <div className="scene-heading">
                    <h2>此刻</h2>
                    <span>
                      {game.busy
                        ? game.planning
                          ? "识别行动中"
                          : "回应中"
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
              </>
            )}
          </section>
        </main>
      )}
      {menu && (
        <JourneyMenu
          world={world}
          onClose={closeMenu}
          onRestore={(next) => {
            game.dispatch({ type: "replace", world: next });
            setAim(null);
            closeMenu();
          }}
          onReset={() => {
            const seed = crypto.getRandomValues(new Uint32Array(1))[0];
            let fresh = enableCareers(
              ensureAdventure(
                world.campaign
                  ? createSuccession(seed, world.initialHero)
                  : createWorld(seed),
              ),
            );
            const profile = characterFromWorld(world);
            if (profile) fresh = enterCharacter(fresh, profile);
            game.dispatch({ type: "replace", world: fresh });
            setAim(null);
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
              确认行动
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
function JournalItem({ entry }: { entry: JournalEntry }) {
  if (entry.decision?.tool === "npc_end")
    return (
      <details className="calculation journal-item">
        <summary>{entry.title}</summary>
        <p>{entry.decision.intent}</p>
        <code>{entry.decision.tool} · 已执行</code>
      </details>
    );
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
      {entry.decision && (
        <details className="calculation">
          <summary>决策与行动</summary>
          <p>{entry.decision.intent}</p>
          <code>{entry.decision.tool} · 已执行</code>
        </details>
      )}
      {entry.formula && (
        <details className="calculation">
          <summary tabIndex={0}>查看计算</summary>
          <p>{entry.formula}</p>
        </details>
      )}
    </article>
  );
}
