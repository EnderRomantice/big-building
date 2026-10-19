import {
  CAREER_WORLDS,
  PROFESSIONS,
  professionById,
  starterSkills,
  skillTree,
} from "../engine/careers";
import type { CharacterRecord } from "../engine/careers";
import type { ScenarioId } from "../engine/types";
import { useState } from "react";
import type { HeroId, World } from "../engine/types";
import { HERO_ORIGINS } from "../engine/succession";
import { SCENARIOS } from "../engine/content";
import { useMotionState } from "../game/motion";
export default function Home({
  world,
  name,
  onName,
  onResume,
  onEnter,
  busy,
  characters,
  onCreate,
}: {
  world: World;
  name: string;
  onName: (name: string) => void;
  onResume: () => void;
  onEnter: (
    script: "succession" | "crown",
    hero: HeroId,
    profile?: CharacterRecord,
  ) => void;
  characters: CharacterRecord[];
  onCreate: (profile: CharacterRecord) => boolean;
  busy: boolean;
}) {
  const [script, setScript] = useMotionState<"succession" | "crown">(
    "succession",
  );
  const [hero, setHero] = useMotionState<HeroId>(world.initialHero ?? "ranger");
  const [draft, setDraft] = useState(name);
  const origin = HERO_ORIGINS[hero];
  const [selected, setSelected] = useState<string | null>(
    world.characterId ?? null,
  );
  const [creating, setCreating] = useMotionState(false);
  const [characterName, setCharacterName] = useState("");
  const [system, setSystem] = useState<ScenarioId>("succession");
  const [profession, setProfession] = useState("swordsman");
  const profile = characters.find((p) => p.id === selected);
  const chosen = professionById(profession)!;
  return (
    <main id="main" className="home-view">
      <div className="home-layout">
        <section aria-label="选择剧本">
          <h2>剧本</h2>
          <div className="script-choices">
            <button
              className={script === "succession" ? "selected" : ""}
              aria-pressed={script === "succession"}
              onClick={() => setScript("succession")}
            >
              <strong>
                九阙争衡 <small>新篇</small>
              </strong>
              <span>主城与九座王爵城 · 五十个小镇</span>
              <p>
                昭帝病危，九子各执一方。你携旧案入局，以地方证词、个人恩怨与公开立场，面对一场没有完美人选的争储。
              </p>
            </button>
            <button
              className={script === "crown" ? "selected" : ""}
              aria-pressed={script === "crown"}
              onClick={() => {
                setScript("crown");
                setHero("ranger");
              }}
            >
              <strong>
                王座余烬 <small>旧篇</small>
              </strong>
              <span>腐蚀、王冠与界隙</span>
              <p>保留原有剧情和存档规则，以艾琳继续未完的旧旅程。</p>
            </button>
          </div>
        </section>
        <section aria-label="选择角色">
          <h2>角色</h2>
          <div className="character-library" aria-label="跨世界角色">
            {characters.map((p) => (
              <button
                key={p.id}
                className={selected === p.id ? "selected" : ""}
                aria-pressed={selected === p.id}
                onClick={() => {
                  setSelected(p.id);
                  setCreating(false);
                }}
              >
                <span className="user-avatar" aria-hidden="true">
                  {p.name.slice(0, 1)}
                </span>
                <span>
                  <strong>{p.name}</strong>
                  <small>
                    {professionById(p.profession)?.name} · Lv.{p.level}
                  </small>
                </span>
              </button>
            ))}
            <button
              className="text-button"
              aria-expanded={creating}
              onClick={() => setCreating(!creating)}
            >
              ＋ 创建角色
            </button>
            <button
              className="text-button"
              aria-pressed={!selected}
              onClick={() => setSelected(null)}
            >
              剧本预设角色
            </button>
          </div>
          {creating && (
            <form
              className="character-creator"
              aria-label="创建角色"
              onSubmit={(e) => {
                e.preventDefault();
                if (!characterName.trim()) return;
                const p: CharacterRecord = {
                  id: crypto.randomUUID(),
                  name: characterName.trim(),
                  profession,
                  level: 1,
                  xp: 0,
                  unlocked: starterSkills(profession),
                };
                if (onCreate(p)) {
                  setSelected(p.id);
                  setCreating(false);
                  setCharacterName("");
                }
              }}
            >
              <label>
                角色名字
                <input
                  required
                  maxLength={24}
                  value={characterName}
                  onChange={(e) => setCharacterName(e.target.value)}
                  placeholder="为旅者取名"
                />
              </label>
              <label>
                职业来源
                <select
                  value={system}
                  onChange={(e) => {
                    const value = e.target.value as ScenarioId;
                    setSystem(value);
                    setProfession(
                      PROFESSIONS.find((p) => p.world === value && p.playable)!
                        .id,
                    );
                  }}
                >
                  {CAREER_WORLDS.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                职业
                <select
                  value={profession}
                  onChange={(e) => setProfession(e.target.value)}
                >
                  {PROFESSIONS.filter(
                    (p) => p.world === system && p.playable,
                  ).map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
              <p>{chosen.description}</p>
              <p className="hint">
                {skillTree(profession)
                  .filter((s) => s.profession)
                  .map((s) => `${s.name} Lv.${s.level}`)
                  .join(" → ")}
              </p>
              <p className="hint">
                Lv.1
                开始。等级、经验和技能树随角色跨界保留；各世界的剧情与物品分别保存。
              </p>
              <button
                className="primary-button"
                disabled={busy || !characterName.trim()}
                type="submit"
              >
                创建角色
              </button>
            </form>
          )}
          {profile ? (
            <div className="origin-story">
              <strong>
                {profile.name} · {professionById(profile.profession)?.name} ·
                Lv.{profile.level}
              </strong>
              <p>{professionById(profile.profession)?.description}</p>
              <p className="hint">
                来自
                {
                  CAREER_WORLDS.find(
                    (w) => w.id === professionById(profile.profession)?.world,
                  )?.name
                }
                ，可带着当前成长进入所选剧本。
              </p>
            </div>
          ) : script === "succession" ? (
            <>
              <div className="origin-choices">
                {(Object.keys(HERO_ORIGINS) as HeroId[]).map((id) => (
                  <button
                    key={id}
                    className={id === hero ? "selected" : ""}
                    aria-pressed={id === hero}
                    onClick={() => {
                      setHero(id);
                      setSelected(null);
                    }}
                  >
                    <span className="user-avatar" aria-hidden="true">
                      {HERO_ORIGINS[id].name.slice(-1)}
                    </span>
                    <span>
                      <strong>{HERO_ORIGINS[id].name}</strong>
                      <small>{HERO_ORIGINS[id].title} · Lv.1</small>
                    </span>
                  </button>
                ))}
              </div>
              <p className="origin-story" key={hero}>
                {origin.background}
              </p>
              <p className="hint">
                独立的开局与存档。玩家、NPC、怪物使用相同的等级与战斗数值规则。
              </p>
            </>
          ) : (
            <p className="origin-story">
              艾琳 · 游侠。旧篇保留已发生的行动，以兼容原有旅程。
            </p>
          )}
          <button
            className="primary-button home-enter"
            disabled={busy}
            onClick={() =>
              onEnter(
                script,
                script === "crown"
                  ? "ranger"
                  : profile
                    ? professionById(profile.profession)?.role === "scholar"
                      ? "mage"
                      : professionById(profile.profession)?.role === "guard"
                        ? "warden"
                        : "ranger"
                    : hero,
                profile,
              )
            }
          >
            进入剧本 / 继续该角色 →
          </button>
          <p className="hint">
            每个剧本、角色分别保存进度，切换不会抹去当前旅程。
          </p>
        </section>
      </div>
      <footer className="home-footer">
        <button className="text-button" onClick={onResume}>
          返回当前旅程 · {SCENARIOS[world.scenario].name} /{" "}
          {world.heroes[0].name} →
        </button>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (draft.trim()) onName(draft.trim().slice(0, 20));
          }}
        >
          <label htmlFor="profile-name">你的称呼</label>
          <input
            id="profile-name"
            value={draft}
            maxLength={20}
            onChange={(e) => setDraft(e.target.value)}
          />
          <button className="text-button" type="submit">
            保存
          </button>
        </form>
      </footer>
    </main>
  );
}
