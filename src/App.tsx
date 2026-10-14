import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowDownToLine,
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Check,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Clock3,
  Compass,
  Crown,
  Database,
  Flame,
  Heart,
  History,
  Layers3,
  Leaf,
  Map,
  MoreHorizontal,
  Orbit,
  Play,
  Plus,
  RotateCcw,
  ScrollText,
  Settings2,
  Shield,
  Sparkles,
  Swords,
  Upload,
  Users,
  WandSparkles,
  X,
  Zap,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  activeNpcs,
  clockText,
  createWorld,
  dayText,
  execute,
  replay,
  toReplay,
} from "./engine/engine";
import { ITEMS, LOCATIONS, SCENARIOS, SKILLS } from "./engine/content";
import type { Command, Hero, HeroId, World } from "./engine/types";
import Portrait from "./components/Portrait";
import WorldMap from "./components/WorldMap";
import Modal from "./components/Modal";
import AgentPanel from "./components/AgentPanel";

const SAVE_KEY = "big-building:journey:v1";
function load(): { world: World; error: string } {
  try {
    const saved = localStorage.getItem(SAVE_KEY);
    return {
      world: saved ? replay(JSON.parse(saved)) : createWorld(),
      error: "",
    };
  } catch {
    return {
      world: createWorld(),
      error:
        "原存档无法读取，已打开新旅程。损坏的原记录保留在浏览器中，直到你执行下一次行动。",
    };
  }
}
function Meter({
  value,
  max,
  variant = "health",
}: {
  value: number;
  max: number;
  variant?: string;
}) {
  return (
    <span className={`meter ${variant}`}>
      <span style={{ width: `${Math.min(100, (value / max) * 100)}%` }} />
    </span>
  );
}
function Stat({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon;
  label: string;
  value: string | number;
}) {
  return (
    <div className="stat">
      <Icon size={15} />
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
const actions: {
  id: string;
  label: string;
  detail: string;
  icon: LucideIcon;
}[] = [
  { id: "attack", label: "普通攻击", detail: "无需消耗", icon: Swords },
  { id: "skill", label: "施放技能", detail: "8 点能量", icon: WandSparkles },
  { id: "heal", label: "治疗队友", detail: "6 点能量", icon: Heart },
  { id: "explore", label: "场景行动", detail: "探索与交涉", icon: Compass },
];
export default function App() {
  const [initial] = useState(load);
  const [world, setWorld] = useState(initial.world);
  const [actorId, setActorId] = useState<HeroId>("ranger");
  const [tab, setTab] = useState("adventure");
  const [action, setAction] = useState("explore");
  const [target, setTarget] = useState("");
  const [mobileDetails, setMobileDetails] = useState(false);
  const [modal, setModal] = useState<
    "save" | "claim" | "reset" | "party" | null
  >(null);
  const [toast, setToast] = useState(initial.error);
  const [saveError, setSaveError] = useState("");
  const [showAll, setShowAll] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const journalRef = useRef<HTMLElement>(null);
  const actor = world.heroes.find((h) => h.id === actorId)!;
  const scenario = SCENARIOS[world.scenario];
  const nearby = activeNpcs(world);
  const hostiles = nearby.filter((n) => n.relation === "hostile");
  const playable = !actor.retired && actor.hp > 0;
  const partyLost = world.heroes.every((h) => h.retired || h.hp === 0);
  const king = world.npcs.find((n) => n.id === "king")!;
  const prince = world.npcs.find((n) => n.id === "prince")!;
  const closeModal = useCallback(() => setModal(null), []);
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(""), 6500);
    return () => clearTimeout(id);
  }, [toast]);
  function persist(w: World) {
    setWorld(w);
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(toReplay(w)));
      setSaveError("");
    } catch {
      setSaveError("浏览器存储不可用，请导出旅程保存进度。");
    }
  }
  function dispatch(payload: Record<string, unknown>) {
    try {
      const command = {
        ...payload,
        id: crypto.randomUUID(),
        expectedRevision: world.revision,
        actor: actorId,
      } as Command;
      const next = execute(world, command);
      persist(next);
      if (
        next.heroes.find((h) => h.id === actorId)!.retired ||
        next.heroes.find((h) => h.id === actorId)!.hp === 0
      ) {
        const alive = next.heroes.find((h) => !h.retired && h.hp > 0);
        if (alive) setActorId(alive.id);
      }
      setTarget("");
    } catch (e) {
      setToast(e instanceof Error ? e.message : "行动未能结算。");
    }
  }
  function commitAdvice(command: Command) {
    try {
      if (command.actor !== actorId)
        throw new Error("行动角色已改变，请重新生成建议。");
      const next = execute(world, command);
      persist(next);
      const active = next.heroes.find((h) => h.id === actorId)!;
      if (active.retired || active.hp === 0) {
        const alive = next.heroes.find((h) => !h.retired && h.hp > 0);
        if (alive) setActorId(alive.id);
      }
      setTarget("");
      setToast("行动已通过规则校验并执行。");
    } catch (e) {
      setToast(e instanceof Error ? e.message : "建议无法执行。");
    }
  }
  function download() {
    const blob = new Blob([JSON.stringify(toReplay(world), null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `界构-旅程-${world.revision}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setToast("旅程记录已导出，包含随机种子与所有行动。");
  }
  async function importFile(file?: File) {
    if (!file) return;
    try {
      if (file.size > 2_000_000)
        throw new Error("文件过大，请使用小于 2 MB 的旅程文件。");
      const next = replay(JSON.parse(await file.text()));
      persist(next);
      setActorId(
        next.heroes.find((h) => !h.retired && h.hp > 0)?.id ?? "ranger",
      );
      setTarget("");
      closeModal();
      setToast(`成功恢复 ${next.history.length} 次行动，已按规则重放验证。`);
    } catch (e) {
      setToast(e instanceof Error ? e.message : "无法读取旅程文件。");
    }
  }
  const attackTarget =
    nearby.find((n) => n.id === target && n.relation !== "ally") ??
    nearby.find((n) => n.relation !== "ally");
  const healTarget =
    world.heroes.find((h) => h.id === target && !h.retired && h.hp < h.maxHp) ??
    world.heroes.find((h) => !h.retired && h.hp < h.maxHp);
  const chapterDone = world.flags.resolved;
  const journal = [...world.journal]
    .reverse()
    .slice(0, showAll ? undefined : 12);
  function handleSceneAction(type: string) {
    if (type === "claim") setModal("claim");
    else dispatch({ type });
  }
  return (
    <div className="app-shell">
      <aside className="rail">
        <button
          className="brand-mark"
          aria-label="界构首页"
          onClick={() => setTab("adventure")}
        >
          <Layers3 size={24} />
        </button>
        <div className="rail-links">
          <button
            className={tab === "adventure" ? "active" : ""}
            title="冒险桌"
            aria-label="冒险桌"
            onClick={() => setTab("adventure")}
          >
            <Compass size={22} />
          </button>
          <button
            className={tab === "world" ? "active" : ""}
            title="世界档案"
            aria-label="世界档案"
            onClick={() => setTab("world")}
          >
            <Map size={21} />
          </button>
          <button
            className={tab === "rules" ? "active" : ""}
            title="规则手册"
            aria-label="规则手册"
            onClick={() => setTab("rules")}
          >
            <BookOpen size={21} />
          </button>
        </div>
        <div className="rail-bottom">
          <button
            title="存档管理"
            aria-label="存档管理"
            onClick={() => setModal("save")}
          >
            <Settings2 size={20} />
          </button>
          <button
            title="玩法说明"
            aria-label="玩法说明"
            onClick={() => setTab("rules")}
          >
            <CircleHelp size={20} />
          </button>
          <span className="local-avatar">旅</span>
        </div>
      </aside>
      <div className="app-content">
        <header className="topbar">
          <div className="wordmark">
            界构 <span>BIG BUILDING</span>
          </div>
          <div className="top-divider" />
          <nav aria-label="主导航">
            {[
              ["adventure", "冒险桌"],
              ["world", "世界档案"],
              ["rules", "规则手册"],
            ].map(([id, label]) => (
              <button
                key={id}
                className={tab === id ? "active" : ""}
                onClick={() => setTab(id)}
              >
                {label}
              </button>
            ))}
          </nav>
          <div className="top-actions">
            <span className="local-status">
              <i /> 本地运行
            </span>
            <button
              className="subtle-button"
              aria-label="旅程存档"
              onClick={() => setModal("save")}
            >
              <Database size={14} />
              <span>{saveError ? "存档异常" : "旅程存档"}</span>
            </button>
          </div>
        </header>
        <div className="page-heading">
          <div>
            <div className="eyebrow">
              你的选择，世界的下一页 <span>/</span> LOCAL PLAYTEST 0.1
            </div>
            <h1>
              {tab === "adventure"
                ? scenario.name
                : tab === "world"
                  ? "世界档案"
                  : "规则手册"}{" "}
              <span className="edition">
                {tab === "adventure" ? "序章" : "v0.1"}
              </span>
            </h1>
            <p>
              {tab === "adventure"
                ? scenario.subtitle
                : tab === "world"
                  ? "每一个状态，都有它发生的原因。"
                  : "自由决定行动，规则决定结果。"}
            </p>
          </div>
          <button className="party-button" onClick={() => setModal("party")}>
            <span className="tiny-portraits">
              {world.heroes.map((h) => (
                <Portrait key={h.id} id={h.id} small />
              ))}
            </span>
            <span>
              本地小队{" "}
              <small>
                {world.heroes.filter((h) => !h.retired).length} 位旅者
              </small>
            </span>
            <ChevronDown size={15} />
          </button>
        </div>
        {saveError && (
          <div className="warning-banner">
            {saveError}
            <button onClick={download}>立即导出</button>
          </div>
        )}
        {partyLost && (
          <div className="warning-banner">
            小队已失去行动能力。这段旅程结束了，你仍可查看事件或导出存档。
            <button onClick={() => setModal("reset")}>重新开始</button>
          </div>
        )}
        <div className="game-layout">
          <aside
            className={`party-panel ${mobileDetails ? "details-open" : ""}`}
          >
            <div className="section-label">
              <span>
                <Users size={15} /> 冒险小队
              </span>
              <span>03</span>
            </div>
            <p className="panel-hint">选择角色，轮流行动</p>
            <div className="hero-list">
              {world.heroes.map((h) => (
                <HeroCard
                  key={h.id}
                  hero={h}
                  actorId={actorId}
                  onSelect={(id) => {
                    setActorId(id);
                    setTarget("");
                  }}
                />
              ))}
            </div>
            <button
              className="mobile-details-toggle"
              aria-expanded={mobileDetails}
              onClick={() => setMobileDetails(!mobileDetails)}
            >
              {actor.name}的属性、技能与行囊 <ChevronDown size={14} />
            </button>
            <div className="character-details">
              <div className="small-heading">
                {actor.name}的角色档案 <Shield size={13} />
              </div>
              <div className="character-stats">
                <Stat icon={Swords} label="攻击" value={actor.attack} />
                <Stat icon={Shield} label="防御" value={actor.defense} />
              </div>
              <div className="xp-label">
                <span>成长进度</span>
                <span>
                  {actor.xp} / {actor.level * 30} XP
                </span>
              </div>
              <Meter value={actor.xp} max={actor.level * 30} variant="xp" />
              <div className="skill-detail">
                <WandSparkles size={17} />
                <div>
                  <strong>{SKILLS[actor.id]}</strong>
                  <span>
                    等级 {actor.skillRank} · 伤害加成 +{6 + actor.skillRank * 2}
                  </span>
                </div>
                <button
                  className="icon-button"
                  title={
                    actor.skillRank >= actor.level
                      ? "角色升级后可提升技能"
                      : "升级技能"
                  }
                  aria-label="升级技能"
                  disabled={!playable || actor.skillRank >= actor.level}
                  onClick={() => dispatch({ type: "upgrade" })}
                >
                  <Plus size={16} />
                </button>
              </div>
            </div>
            <div className="inventory">
              <div className="small-heading">
                随身行囊 <span>{actor.inventory.length} 件</span>
              </div>
              {actor.inventory.map((item, i) => (
                <div
                  className="inventory-item"
                  key={`${item}-${i}`}
                  title={ITEMS[item]}
                >
                  <span className="item-symbol">{i === 0 ? "◇" : "✦"}</span>
                  <span>
                    {item}
                    <small>{i === 0 ? "基础装备" : "可跨剧本携带"}</small>
                  </span>
                </div>
              ))}
            </div>
            <div className="engine-note">
              <span className="live-dot" />
              <span>
                规则引擎在线<small>无需 AI，也能完整运行</small>
              </span>
              <Shield size={15} />
            </div>
          </aside>
          <main className="main-column">
            {tab === "adventure" ? (
              <>
                <section className="scene-panel">
                  <div className="panel-header">
                    <span>
                      <Map size={15} /> 世界地图
                    </span>
                    <span className="muted">
                      {world.scenario === "crown" ? "灰烬王国" : "异域试炼"}{" "}
                      <ChevronDown size={12} />
                    </span>
                  </div>
                  <WorldMap
                    world={world}
                    busy={!playable}
                    onMove={(destination) =>
                      dispatch({ type: "move", destination })
                    }
                  />
                  <div className="scene-description">
                    <div>
                      <span className="eyebrow">
                        {world.scenario === "crown"
                          ? LOCATIONS[world.location].subtitle
                          : "THE SPIRIT PASSAGE"}
                      </span>
                      <h2>
                        {world.scenario === "crown"
                          ? LOCATIONS[world.location].name
                          : "灵境回廊"}
                      </h2>
                      <p>
                        {world.scenario === "crown"
                          ? LOCATIONS[world.location].description
                          : "同一套规则，在另一种力量中流动。击败守卫，取得结晶，再把你的故事带回原来的世界。"}
                      </p>
                    </div>
                    <span className="scene-seal">
                      {world.scenario === "crown" ? (
                        <CastleIcon />
                      ) : (
                        <Orbit size={44} />
                      )}
                    </span>
                  </div>
                </section>
                <AgentPanel
                  world={world}
                  actorId={actorId}
                  onCommit={commitAdvice}
                />
                <section className="action-panel">
                  <div className="panel-header">
                    <span>
                      <span className="live-dot" /> 轮到{actor.name}行动
                    </span>
                    <span className="muted">
                      行动 #{String(world.revision + 1).padStart(3, "0")}
                    </span>
                  </div>
                  <div
                    className="action-tabs"
                    role="tablist"
                    aria-label="行动类型"
                  >
                    {actions.map(({ id, icon: Icon, label, detail }) => (
                      <button
                        key={id}
                        role="tab"
                        aria-selected={action === id}
                        className={action === id ? "selected" : ""}
                        onClick={() => {
                          setAction(id);
                          setTarget("");
                        }}
                      >
                        <Icon size={20} />
                        <strong>{label}</strong>
                        <small>{detail}</small>
                      </button>
                    ))}
                  </div>
                  <div className="action-content">
                    {action === "explore" ? (
                      <div className="scene-actions">
                        {world.location === "courtyard" && (
                          <SceneAction
                            playable={playable}
                            onAction={handleSceneAction}
                            icon={Flame}
                            title="篝火休整"
                            detail="1 小时 · 全队恢复生命与能量"
                            type="rest"
                          />
                        )}
                        {world.scenario === "crown" &&
                          world.location === "archive" && (
                            <SceneAction
                              playable={playable}
                              onAction={handleSceneAction}
                              icon={BookOpen}
                              title={
                                world.flags.lore ? "秘典已解读" : "调查王座秘典"
                              }
                              detail="20 分钟 · 获得知识与 10 经验"
                              type="inspect"
                              disabled={world.flags.lore}
                            />
                          )}
                        {nearby.some(
                          (n) => n.id === "prince" && n.relation !== "hostile",
                        ) && (
                          <SceneAction
                            playable={playable}
                            onAction={handleSceneAction}
                            icon={Users}
                            title="与卡西安交谈"
                            detail="10 分钟 · 了解他的计划"
                            type="talk"
                          />
                        )}
                        {world.scenario === "crown" &&
                          world.location === "throne" &&
                          king.hp > 0 && (
                            <div className="action-tip">
                              <Crown size={18} />
                              <span>
                                国王仍坐在王座上。你可以选择攻击，也可以静观其变。
                              </span>
                            </div>
                          )}
                        {world.scenario === "crown" &&
                          world.location === "throne" &&
                          king.hp === 0 &&
                          !world.flags.throneOwner &&
                          !chapterDone && (
                            <>
                              <SceneAction
                                playable={playable}
                                onAction={handleSceneAction}
                                icon={Leaf}
                                title="净化王座"
                                detail={
                                  world.flags.lore
                                    ? "12 点能量 · 终结诅咒"
                                    : "需要先调查书库秘典"
                                }
                                type="cleanse"
                                disabled={!world.flags.lore}
                              />
                              <SceneAction
                                playable={playable}
                                onAction={handleSceneAction}
                                icon={Crown}
                                title="接受王座的力量"
                                detail="角色将成为敌人 · 需确认"
                                type="claim"
                              />
                            </>
                          )}
                        {world.location === "rift" && (
                          <>
                            <SceneAction
                              playable={playable}
                              onAction={handleSceneAction}
                              icon={Orbit}
                              title={
                                world.scenario === "crown"
                                  ? "前往灵境回廊"
                                  : "返回灰烬王国"
                              }
                              detail="30 分钟 · 当前能量保留 70%"
                              type="travel"
                              disabled={hostiles.length > 0}
                            />
                            <SceneAction
                              playable={playable}
                              onAction={handleSceneAction}
                              icon={Zap}
                              title="测试能量转换"
                              detail="10 → 7 → 4 · 验证转换损耗"
                              type="convert"
                              disabled={hostiles.length > 0}
                            />
                          </>
                        )}
                        {world.scenario === "spirit" &&
                          world.flags.spiritReward && (
                            <SceneAction
                              playable={playable}
                              onAction={handleSceneAction}
                              icon={Flame}
                              title="在回廊休整"
                              detail="1 小时 · 全队恢复生命与能量"
                              type="rest"
                            />
                          )}
                        {hostiles.length > 0 && (
                          <div className="action-tip danger">
                            <Swords size={18} />
                            <span>
                              {hostiles[0].name}
                              阻挡着去路。切换攻击或技能来战斗。
                            </span>
                          </div>
                        )}
                        {chapterDone && world.location === "throne" && (
                          <div className="action-tip">
                            <Check size={18} />
                            <span>
                              王座的故事已经落幕。你仍可探索、成长或穿越界隙。
                            </span>
                          </div>
                        )}
                        <SceneAction
                          playable={playable}
                          onAction={handleSceneAction}
                          icon={Clock3}
                          title="等待一小时"
                          detail="世界与关键人物继续行动"
                          type="wait"
                        />
                      </div>
                    ) : (
                      <>
                        <label className="target-label" htmlFor="target">
                          {action === "heal" ? "选择治疗对象" : "选择行动目标"}
                          <span>
                            {action === "skill"
                              ? SKILLS[actor.id]
                              : action === "heal"
                                ? "恢复 16 生命，可救起倒下的队友"
                                : "目标存活时会立即反击"}
                          </span>
                        </label>
                        <div className="target-row">
                          <select
                            id="target"
                            value={
                              action === "heal"
                                ? (healTarget?.id ?? "")
                                : (attackTarget?.id ?? "")
                            }
                            onChange={(e) => setTarget(e.target.value)}
                          >
                            {action === "heal" ? (
                              healTarget ? (
                                world.heroes
                                  .filter((h) => !h.retired && h.hp < h.maxHp)
                                  .map((h) => (
                                    <option key={h.id} value={h.id}>
                                      {h.name} · {h.hp}/{h.maxHp} 生命
                                    </option>
                                  ))
                              ) : (
                                <option value="">所有队员生命充足</option>
                              )
                            ) : attackTarget ? (
                              nearby
                                .filter((n) => n.relation !== "ally")
                                .map((n) => (
                                  <option key={n.id} value={n.id}>
                                    {n.name} · {n.hp}/{n.maxHp} 生命
                                    {n.relation === "neutral" ? " · 中立" : ""}
                                  </option>
                                ))
                            ) : (
                              <option value="">此处没有可攻击的目标</option>
                            )}
                          </select>
                          <button
                            className="primary-button"
                            disabled={
                              !playable ||
                              (action === "heal"
                                ? !healTarget || actor.energy < 6
                                : !attackTarget ||
                                  (action === "skill" && actor.energy < 8))
                            }
                            onClick={() =>
                              dispatch(
                                action === "heal"
                                  ? { type: "heal", target: healTarget?.id }
                                  : {
                                      type: "attack",
                                      target: attackTarget?.id,
                                      skill: action === "skill",
                                    },
                              )
                            }
                          >
                            执行行动 <ArrowRight size={16} />
                          </button>
                        </div>
                        <div className="formula-preview">
                          <Shield size={12} />
                          {action === "heal"
                            ? "确定效果 · 消耗 6 能量 · 时间推进 10 分钟"
                            : `${actor.attack} 攻击 + d6${action === "skill" ? ` + ${6 + actor.skillRank * 2} 技能` : ""} − 目标防御 · 时间推进 10 分钟`}
                        </div>
                      </>
                    )}
                  </div>
                  <div className="action-footer">
                    <Shield size={12} /> 每个结果都由规则结算，并记录完整过程{" "}
                    <span>规则 v0.1.0</span>
                  </div>
                </section>
              </>
            ) : tab === "world" ? (
              <section className="archive-panel">
                <div className="panel-header">
                  <span>
                    <Database size={16} /> 世界状态快照
                  </span>
                  <span className="muted">版本 {world.revision}</span>
                </div>
                <div className="archive-intro">
                  <h2>世界从不暂停</h2>
                  <p>
                    这是供本地试玩观察的主持人全知视角。角色会依据自己的消息与计划行动；例如国王死讯需要
                    30 分钟传播。
                  </p>
                </div>
                <div className="fact-grid">
                  {[
                    ["国王状态", king.hp > 0 ? "仍然在位" : "已经死亡"],
                    [
                      "王座归属",
                      world.flags.throneOwner === "prince"
                        ? "王子卡西安"
                        : (world.heroes.find(
                            (h) => h.id === world.flags.throneOwner,
                          )?.name ?? "无人占据"),
                    ],
                    ["秘典知识", world.flags.lore ? "已掌握" : "尚未调查"],
                    [
                      "死讯传播",
                      world.flags.deathNewsAt
                        ? `将在 ${clockText(world.flags.deathNewsAt)} 抵达`
                        : king.hp === 0
                          ? "消息已传达"
                          : "尚未发生",
                    ],
                    ["王座诅咒", chapterDone ? "已经终结" : "依然存在"],
                    [
                      "灵境试炼",
                      world.flags.spiritReward ? "已经完成" : "等待旅者",
                    ],
                  ].map(([name, value]) => (
                    <div key={name}>
                      <span>{name}</span>
                      <strong>{value}</strong>
                    </div>
                  ))}
                </div>
                {world.npcs.map((n) => (
                  <div className="npc-record" key={n.id}>
                    <div>
                      <strong>{n.name}</strong>
                      <span
                        className={`relation ${n.hp === 0 ? "dead" : n.relation}`}
                      >
                        {n.hp === 0
                          ? "死亡"
                          : { neutral: "中立", ally: "盟友", hostile: "敌对" }[
                              n.relation
                            ]}
                      </span>
                    </div>
                    <p>目标：{n.goal}</p>
                    <p>认知：{n.knowledge}</p>
                    <small>
                      {LOCATIONS[n.location].name} · HP {n.hp}/{n.maxHp} · 腐蚀{" "}
                      {n.corruption}%
                    </small>
                  </div>
                ))}
              </section>
            ) : (
              <RulesPanel />
            )}
            <section className="journal-panel" ref={journalRef}>
              <div className="panel-header">
                <span>
                  <ScrollText size={16} /> 旅程记录{" "}
                  <span className="count-badge">{world.journal.length}</span>
                </span>
                <button
                  className="text-button"
                  onClick={() => setShowAll(!showAll)}
                >
                  {showAll ? "收起记录" : "完整记录"} <ArrowUpRight size={13} />
                </button>
              </div>
              <div
                className="journal-list"
                aria-live="polite"
                aria-relevant="additions"
              >
                {journal.map((entry) => (
                  <article
                    key={entry.id}
                    className={`journal-entry ${entry.tone}`}
                  >
                    <div className="journal-icon">
                      {entry.tone === "combat" ? (
                        <Swords size={14} />
                      ) : entry.tone === "world" ? (
                        <Orbit size={14} />
                      ) : entry.tone === "system" ? (
                        <Shield size={14} />
                      ) : (
                        <FeatherIcon />
                      )}
                    </div>
                    <div>
                      <div className="journal-title">
                        <strong>{entry.title}</strong>
                        <time>
                          {dayText(entry.minute)} {clockText(entry.minute)}
                        </time>
                      </div>
                      <p>{entry.text}</p>
                      {entry.formula && <code>{entry.formula}</code>}
                    </div>
                  </article>
                ))}
              </div>
            </section>
          </main>
          <aside className="world-panel">
            <section className="world-clock">
              <div className="small-heading">
                世界时间 <Clock3 size={15} />
              </div>
              <div className="clock-display">
                {clockText(world.minute)}
                <span>
                  {dayText(world.minute)}
                  <small>
                    {world.minute % 1440 < 720
                      ? "上午"
                      : world.minute % 1440 < 1080
                        ? "午后"
                        : "夜晚"}
                  </small>
                </span>
              </div>
              <div className="day-track">
                <span
                  style={{ left: `${((world.minute % 1440) / 1440) * 100}%` }}
                />
              </div>
              <div className="clock-caption">
                <span>00:00</span>
                <span>12:00</span>
                <span>24:00</span>
              </div>
              <button
                className="wait-button"
                disabled={!playable}
                onClick={() => dispatch({ type: "wait" })}
              >
                <Play size={13} /> 推进一小时 <ArrowRight size={13} />
              </button>
            </section>
            <section className="quest-panel">
              <div className="small-heading">
                <span>当前篇章</span>
                <span className="chapter-index">01</span>
              </div>
              <div className="quest-icon">
                <Crown size={23} />
              </div>
              <h3>{chapterDone ? "余烬中的新生" : "王冠之下"}</h3>
              <p>
                {chapterDone
                  ? "你们终结了王座的诅咒。旅程仍可继续。"
                  : "王子的计划正在逼近。谁会坐上王座，又将付出什么代价？"}
              </p>
              <div className="quest-checklist">
                <div className={world.flags.lore ? "done" : ""}>
                  {world.flags.lore ? <Check size={13} /> : <span />}
                  调查王座的秘密
                </div>
                <div className={king.hp === 0 ? "done" : ""}>
                  {king.hp === 0 ? <Check size={13} /> : <span />}改变王权的归属
                </div>
                <div className={chapterDone ? "done" : ""}>
                  {chapterDone ? <Check size={13} /> : <span />}决定诅咒的结局
                </div>
              </div>
              <div className="quest-footnote">可选线索 · 没有唯一通关路径</div>
            </section>
            <section className="npc-panel">
              <div className="small-heading">
                人物动向{" "}
                <button
                  className="icon-button"
                  aria-label="查看全部人物"
                  onClick={() => setTab("world")}
                >
                  <MoreHorizontal size={16} />
                </button>
              </div>
              <div className="omniscient-label">主持人视角 · 全知状态</div>
              {[
                king,
                prince,
                ...world.npcs.filter((n) => n.id === "fallen"),
              ].map((n) => (
                <div className="npc-summary" key={n.id}>
                  <span className={`npc-symbol ${n.hp === 0 ? "dead" : ""}`}>
                    {n.id === "king" ? (
                      <Crown size={17} />
                    ) : n.id === "prince" ? (
                      <Swords size={17} />
                    ) : (
                      <Flame size={17} />
                    )}
                  </span>
                  <div>
                    <strong>{n.name.split(" · ")[1]}</strong>
                    <span
                      className={`npc-status ${n.hp === 0 ? "dead" : n.relation}`}
                    >
                      {n.hp === 0
                        ? "已死亡"
                        : n.relation === "hostile"
                          ? "敌对"
                          : n.relation === "ally"
                            ? "盟友"
                            : "正在行动"}
                    </span>
                    <p>{n.hp === 0 ? "他的行动已经结束。" : n.goal}</p>
                    {n.corruption > 0 && (
                      <>
                        <Meter
                          value={n.corruption}
                          max={100}
                          variant="corruption"
                        />
                        <small>腐蚀 {n.corruption}%</small>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </section>
            <div className="world-note">
              <Sparkles size={16} />
              <p>
                世界会记住你的每一次选择。
                <br />
                <span>故事没有预设的终点。</span>
              </p>
            </div>
          </aside>
        </div>
        <footer className="page-footer">
          <span>界构 · 让世界，回应选择。</span>
          <span>
            SEED {world.seed} <i /> {world.history.length} 次已验证行动
          </span>
        </footer>
      </div>
      {toast && (
        <div className="toast" role="status">
          <CircleHelp size={17} />
          <span>{toast}</span>
          <button
            className="icon-button"
            aria-label="关闭提示"
            onClick={() => setToast("")}
          >
            <X size={16} />
          </button>
        </div>
      )}
      <input
        className="hidden-input"
        type="file"
        accept="application/json,.json"
        ref={fileRef}
        aria-label="导入旅程文件"
        onChange={(e) => {
          void importFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      {modal === "save" && (
        <Modal title="旅程存档" onClose={closeModal}>
          <p className="modal-copy">
            每次行动后自动保存在当前浏览器。导出的文件包含随机种子与指令历史，可以在另一台设备上重放恢复。
          </p>
          <div className="save-summary">
            <Database size={24} />
            <div>
              <strong>
                {scenario.name} · {dayText(world.minute)}
              </strong>
              <span>
                {world.history.length} 次行动 · 规则 v0.1.0 ·{" "}
                {clockText(world.minute)}
              </span>
            </div>
            <Check size={18} />
          </div>
          <div className="modal-actions">
            <button className="primary-button" onClick={download}>
              <ArrowDownToLine size={16} /> 导出旅程
            </button>
            <button
              className="secondary-button"
              onClick={() => fileRef.current?.click()}
            >
              <Upload size={16} /> 导入并替换当前旅程
            </button>
            <button
              className="secondary-button"
              onClick={() => {
                try {
                  const result = replay(toReplay(world));
                  setToast(
                    JSON.stringify(result) === JSON.stringify(world)
                      ? `重放验证通过：${world.history.length} 次行动产生完全一致的世界状态。`
                      : "重放结果不一致。",
                  );
                } catch (e) {
                  setToast(String(e));
                }
              }}
            >
              <History size={16} /> 验证确定性重放
            </button>
            <button className="danger-button" onClick={() => setModal("reset")}>
              <RotateCcw size={16} /> 开始新的旅程
            </button>
          </div>
        </Modal>
      )}
      {modal === "claim" && (
        <Modal title="接受王座的力量？" onClose={closeModal}>
          <div className="claim-illustration">
            <Crown size={44} />
          </div>
          <p className="modal-copy">
            {actor.name}将主动接受全部腐蚀，
            <strong>永久退出当前旅程的可控小队，成为敌对首领</strong>
            。其他队员继续冒险，得知国王死讯后的王子会协助他们作战。
          </p>
          <p className="modal-copy">
            这是首版用于验证剧情变化的明确选择。你可以先导出旅程保留分支。
          </p>
          <div className="modal-actions horizontal">
            <button className="secondary-button" onClick={closeModal}>
              离开王座
            </button>
            <button
              className="danger-button"
              onClick={() => {
                closeModal();
                dispatch({ type: "claim" });
              }}
            >
              确认让{actor.name}成为敌人
            </button>
          </div>
        </Modal>
      )}
      {modal === "reset" && (
        <Modal title="开始新的旅程？" onClose={closeModal}>
          <p className="modal-copy">
            这会替换当前浏览器中的进度。建议先导出记录，以便日后恢复。
          </p>
          <div className="modal-actions">
            <button className="secondary-button" onClick={download}>
              <ArrowDownToLine size={16} /> 先导出当前旅程
            </button>
            <button
              className="danger-button"
              onClick={() => {
                persist(createWorld());
                setActorId("ranger");
                setTarget("");
                setTab("adventure");
                closeModal();
                setToast("新的旅程已经开始。");
              }}
            >
              确认重新开始
            </button>
          </div>
        </Modal>
      )}
      {modal === "party" && (
        <Modal title="一张桌，三位旅者" onClose={closeModal}>
          <p className="modal-copy">
            首版支持同一台设备上的小队轮流操作。点击左侧角色即可切换行动者，共享世界时间、地点与故事进度。
          </p>
          <div className="party-modal-list">
            {world.heroes.map((h) => (
              <div key={h.id}>
                <Portrait id={h.id} />
                <span>
                  <strong>
                    {h.name} · {h.title}
                  </strong>
                  <small>
                    Lv.{h.level} ·{" "}
                    {h.retired
                      ? "已成为敌人"
                      : h.hp > 0
                        ? "可以行动"
                        : "需要救援"}
                  </small>
                </span>
              </div>
            ))}
          </div>
          <p className="modal-copy">
            网络联机与权威服务器留到后续版本。当前没有账号、房间或远程同步。
          </p>
          <button className="primary-button full-width" onClick={closeModal}>
            回到冒险 <ArrowRight size={16} />
          </button>
        </Modal>
      )}
    </div>
  );
}
function CastleIcon() {
  return <Crown size={48} strokeWidth={1} />;
}
function FeatherIcon() {
  return <Leaf size={14} />;
}
function RulesPanel() {
  return (
    <section className="rules-panel">
      <div className="panel-header">
        <span>
          <BookOpen size={16} /> 通用规则 v0.1.0
        </span>
        <span className="muted">无模型依赖</span>
      </div>
      <div className="archive-intro">
        <h2>先有世界，再有故事</h2>
        <p>
          这是一个可完整游玩的规则原型。可通过按钮直接行动，也可让 DeepSeek
          理解意图、由 42-agent
          提出经过规则校验的建议，确认后再执行。创作者编辑器和网络联机尚未接入。
        </p>
      </div>
      {[
        [
          "01",
          "开始你的第一场冒险",
          "点击地图前往秘典书库，调查王座诅咒。再前往荆棘王座，用普通攻击或技能挑战国王。你也可以等待到正午，观察王子的原定计划。",
        ],
        [
          "02",
          "每一击，都有依据",
          "普通伤害 = max(1, 攻击 + d6 − 防御)。技能额外增加 6 + 2 × 技能等级，消耗 8 能量。目标存活就反击，伤害 = max(1, 敌方攻击 − 防御)。d6 来自固定种子的伪随机序列。",
        ],
        [
          "03",
          "一起战斗，一起成长",
          "击败敌人，全体未退出角色获得 30 经验。每次升级需要当前等级 × 30 经验；升级增加 6 生命上限、2 攻击与 4 能量上限。技能可免费升至角色等级，每级增加 2 点技能伤害。",
        ],
        [
          "04",
          "时间是一种资源",
          "移动消耗 30 分钟，攻击、治疗与交谈消耗 10 分钟，调查消耗 20 分钟，休整与等待消耗 60 分钟。升级技能与转换试验不推进时间。即使穿越场景，王城的事件仍持续计算。",
        ],
        [
          "05",
          "你能改变因果",
          "若国王与王子都存活，正午会触发刺杀，王子加冕并累积腐蚀。玩家提前击败国王后，死讯延迟 30 分钟抵达，王子成为盟友。掌握秘典后可净化空王座，也可以明确选择让一个队员成为首领。",
        ],
        [
          "06",
          "跨过世界，保留自我",
          "在界隙之门穿越到灵境回廊。等级、生命和道具保留；当前能量乘以 70% 并向下取整，之后在目标世界恢复其原生能量。往返转换总有损耗，不会凭空产生能量。此为同品阶资源的最小验证。",
        ],
        [
          "07",
          "所有结果都可追溯",
          "每条指令携带唯一 ID 和预期世界版本。重复或过期指令被拒绝。存档只保存种子和指令，通过同一规则内核重放得到世界；最多 2000 次行动。未来权威服务器可以使用相同内核。",
        ],
      ].map(([n, title, text]) => (
        <div className="rule-item" key={n}>
          <span>{n}</span>
          <div>
            <h3>{title}</h3>
            <p>{text}</p>
          </div>
        </div>
      ))}
      <div className="rule-notice">
        <Shield size={18} />
        <span>
          当前数值用于验证机制，尚未经过正式平衡测试。NPC
          使用明确的条件与时间规则，自定义剧本和审核 Agent 是后续工作。
        </span>
      </div>
    </section>
  );
}

function SceneAction({
  icon: Icon,
  title,
  detail,
  type,
  disabled = false,
  playable,
  onAction,
}: {
  icon: LucideIcon;
  title: string;
  detail: string;
  type: string;
  disabled?: boolean;
  playable: boolean;
  onAction: (type: string) => void;
}) {
  return (
    <button
      className="scene-action"
      disabled={disabled || !playable}
      onClick={() => onAction(type)}
    >
      <Icon size={17} />
      <span>
        <strong>{title}</strong>
        <small>{detail}</small>
      </span>
      <ChevronRight size={16} />
    </button>
  );
}

function HeroCard({
  hero,
  actorId,
  onSelect,
}: {
  hero: Hero;
  actorId: HeroId;
  onSelect: (id: HeroId) => void;
}) {
  return (
    <button
      className={`hero-card ${actorId === hero.id ? "selected" : ""} ${hero.retired || !hero.hp ? "unavailable" : ""}`}
      onClick={() => onSelect(hero.id)}
      aria-pressed={actorId === hero.id}
    >
      <div className="hero-card-top">
        <Portrait id={hero.id} />
        <div>
          <div className="hero-name">
            {hero.name}
            <span>Lv.{hero.level}</span>
          </div>
          <div className="hero-class">
            {hero.title}
            <span>
              {hero.retired
                ? "已成为敌人"
                : hero.hp === 0
                  ? "倒下"
                  : actorId === hero.id
                    ? "正在行动"
                    : "等待行动"}
            </span>
          </div>
        </div>
        {actorId === hero.id && <span className="selected-indicator" />}
      </div>
      <div className="hero-bars">
        <div>
          <Heart size={11} />
          <Meter value={hero.hp} max={hero.maxHp} />
          <span>
            {hero.hp}
            <small>/{hero.maxHp}</small>
          </span>
        </div>
        <div>
          <Zap size={11} />
          <Meter value={hero.energy} max={hero.maxEnergy} variant="energy" />
          <span>
            {hero.energy}
            <small>/{hero.maxEnergy}</small>
          </span>
        </div>
      </div>
    </button>
  );
}
