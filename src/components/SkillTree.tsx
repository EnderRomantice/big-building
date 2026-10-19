import {
  careerSkill,
  professionById,
  skillPoints,
  skillTree,
  CAREER_WORLDS,
} from "../engine/careers";
import type { Hero, Npc } from "../engine/types";
import type { ActionOption } from "../engine/actions";
export default function SkillTree({
  person,
  options = [],
  busy = false,
  onAction,
}: {
  person: Hero | Npc;
  options?: ActionOption[];
  busy?: boolean;
  onAction?: (o: ActionOption) => void;
}) {
  if (!person.career) return null;
  const profession = professionById(person.career.profession)!;
  const tree = skillTree(profession.id);
  return (
    <section className="skill-tree" aria-label={`${profession.name}技能树`}>
      <div className="scene-heading">
        <h3>{profession.name} · 技能树</h3>
        {"inventory" in person && <span>可用技能点 {skillPoints(person)}</span>}
      </div>
      <p className="hint">
        {CAREER_WORLDS.find((w) => w.id === profession.world)!.name} ·{" "}
        {profession.description}
      </p>
      {[true, false].map((job) => (
        <div key={String(job)} className="skill-branch">
          <h4>{job ? "职业传承" : "世界通用"}</h4>
          {tree
            .filter((s) => Boolean(s.profession) === job)
            .map((s) => {
              const learned = person.career!.unlocked.includes(s.id),
                option = options.find(
                  (o) =>
                    o.command.type === "unlock_skill" &&
                    o.command.skill === s.id,
                );
              const reason =
                person.level < s.level
                  ? `需要 Lv.${s.level}`
                  : !s.requires.every((id) =>
                        person.career!.unlocked.includes(id),
                      )
                    ? "前置未掌握"
                    : skillPoints(person) < s.points
                      ? "技能点不足"
                      : "战斗中或当前回合不可研习";
              return (
                <div
                  className={`skill-node ${learned ? "learned" : ""}`}
                  key={s.id}
                >
                  <div>
                    <strong>{s.name}</strong>
                    <span>
                      Lv.{s.level} · {s.energy} 气力 · 冷却 {s.cooldown} 轮
                    </span>
                  </div>
                  <p>
                    {s.description}{" "}
                    {s.kind === "attack"
                      ? `伤害加成 +${s.power}`
                      : s.kind === "heal"
                        ? `恢复 ${s.power} HP`
                        : s.kind === "guard"
                          ? `护盾 ${s.power}`
                          : `恢复 ${s.power} 气力`}
                  </p>
                  <small>
                    {s.requires.length
                      ? `前置：${s.requires.map((id) => careerSkill(id)!.name).join(" + ")}`
                      : "起始技能"}
                  </small>
                  {learned ? (
                    <span className="skill-state">已掌握</span>
                  ) : onAction ? (
                    <button
                      className="text-button"
                      disabled={busy || !option}
                      onClick={() => option && onAction(option)}
                    >
                      {option ? `掌握 · ${s.points} 技能点` : reason}
                    </button>
                  ) : (
                    <span className="skill-state">未掌握</span>
                  )}
                </div>
              );
            })}
        </div>
      ))}
    </section>
  );
}
