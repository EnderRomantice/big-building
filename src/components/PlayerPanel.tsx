import { careerSkill, cooldownLeft } from "../engine/careers";
import { REGIONAL_SKILLS } from "../engine/succession";
import { ENERGY_COST, heldWeapon, skillName, WEAPONS } from "../engine/content";
import type { ActionAim, Command, Hero, World } from "../engine/types";
import type { ActionOption } from "../engine/actions";
import type { Advice } from "../engine/advice";
import AgentPanel from "./AgentPanel";
export default function PlayerPanel({
  world,
  hero,
  aiming,
  onChooseAction,
  onCancelAim,
  options,
  busy,
  disabled,
  onAction,
  onSend,
  onPropose,
  onExecute,
  onCancel,
  onInspect,
}: {
  world: World;
  hero: Hero;
  aiming: ActionAim | null;
  onChooseAction: (skill: ActionAim, trigger: HTMLButtonElement) => void;
  onCancelAim: () => void;
  options: ActionOption[];
  busy: boolean;
  disabled: boolean;
  onAction: (option: ActionOption) => void;
  onSend: (text: string) => Promise<boolean>;
  onPropose: (text: string) => Promise<Advice | null>;
  onExecute: (command: Command) => Promise<boolean>;
  onCancel: () => void;
  onInspect: () => void;
}) {
  const attack = options.find(
    (o) =>
      (o.command.type === "strike" || o.command.type === "assault") &&
      !o.command.skill,
  );
  const skill = options.find(
    (o) =>
      (o.command.type === "strike" || o.command.type === "assault") &&
      o.command.skill,
  );
  const heal = options.find((o) => o.command.type === "mend");
  const available = !hero.retired && hero.hp > 0;
  return (
    <>
      <section className="player-profile" aria-label="自己的角色">
        <h2>
          <button
            className="profile-link"
            onClick={onInspect}
            aria-label={`查看${hero.name}的角色详情`}
          >
            {hero.name}
            <span aria-hidden="true">↗</span>
          </button>
          <small>
            {hero.title} · Lv.{hero.level}
          </small>
        </h2>
        <div className="resources">
          <span>
            生命 {hero.hp}/{hero.maxHp}
          </span>
          <span>
            {world.campaign
              ? "气力"
              : world.scenario === "spirit"
                ? "灵力"
                : "魔力"}{" "}
            {hero.energy}/{hero.maxEnergy}
          </span>
          {!!hero.career?.barrier && <span>护盾 {hero.career.barrier}</span>}
        </div>
      </section>
      <div className="player-actions">
        <button
          disabled={busy || disabled || !attack}
          aria-pressed={aiming === "attack"}
          onClick={(event) => onChooseAction("attack", event.currentTarget)}
        >
          <span>用{heldWeapon(hero)}攻击</span>
          <small>普通攻击</small>
        </button>
        {!hero.career && (
          <>
            <button
              disabled={busy || disabled || !skill}
              aria-pressed={aiming === "skill"}
              onClick={(event) => onChooseAction("skill", event.currentTarget)}
            >
              <span>释放{skillName(world, hero.id)}</span>
              <small>{ENERGY_COST.skill} 能量</small>
            </button>
            <button
              disabled={busy || disabled || !heal}
              aria-pressed={aiming === "heal"}
              onClick={(event) => onChooseAction("heal", event.currentTarget)}
            >
              <span>释放治疗术</span>
              <small>恢复 5 HP · {ENERGY_COST.heal} 能量</small>
            </button>
          </>
        )}
        {hero.career?.unlocked.map((id) => {
          const skill = careerSkill(id)!;
          const option = options.find(
            (o) => o.command.type === "invoke" && o.command.skill === id,
          );
          const remaining = cooldownLeft(world, hero, id);
          return (
            <button
              key={id}
              disabled={busy || disabled || !option}
              aria-pressed={aiming === id}
              onClick={(event) => {
                if (
                  (skill.kind === "guard" || skill.kind === "recover") &&
                  option
                )
                  onAction(option);
                else onChooseAction(id as ActionAim, event.currentTarget);
              }}
            >
              <span>{skill.name}</span>
              <small>
                {remaining
                  ? `冷却 ${remaining} 轮`
                  : hero.energy < skill.energy
                    ? `气力不足 · 需要 ${skill.energy}`
                    : `${skill.energy} 气力 · ${skill.kind === "attack" ? `威力 +${skill.power}` : skill.kind === "heal" ? `恢复 ${skill.power} HP` : skill.kind === "guard" ? `${skill.power} 护盾` : `恢复 ${skill.power} 气力`}`}
              </small>
            </button>
          );
        })}
        {hero.career && (
          <button className="text-button" onClick={onInspect}>
            职业与技能树 ↗
          </button>
        )}
        {REGIONAL_SKILLS.filter((skill) => hero.skills?.includes(skill.id)).map(
          (skill) => (
            <button
              key={skill.id}
              disabled={
                busy ||
                disabled ||
                !options.some(
                  (o) =>
                    o.command.type === "cast" && o.command.skill === skill.id,
                )
              }
              aria-pressed={aiming === skill.id}
              onClick={(event) =>
                onChooseAction(skill.id as ActionAim, event.currentTarget)
              }
            >
              <span>释放{skill.name}</span>
              <small>
                {skill.energy} 气力 ·{" "}
                {skill.kind === "heal"
                  ? `恢复 ${skill.bonus} HP`
                  : `威力 +${skill.bonus}`}
              </small>
            </button>
          ),
        )}
        <div className="action-hint" role="status">
          <p className="hint">
            {!available
              ? "你的旅程已经结束。可以导出记录，或重新开始。"
              : aiming !== null
                ? `选择${aiming.startsWith("job-") ? careerSkill(aiming)?.name : aiming.startsWith("art-") ? REGIONAL_SKILLS.find((s) => s.id === aiming)?.name : aiming === "heal" ? "治疗术" : aiming === "skill" ? skillName(world, hero.id) : "攻击"}的对象`
                : !attack && !heal
                  ? "当前没有可攻击或治疗的对象。"
                  : "先选动作，再选择场景中的对象。"}
          </p>
          {aiming !== null && (
            <button className="quiet" onClick={onCancelAim}>
              取消 · Esc
            </button>
          )}
        </div>
      </div>
      <AgentPanel
        revision={world.revision}
        onPropose={onPropose}
        onExecute={onExecute}
        busy={busy}
        disabled={!available || disabled}
        onSend={onSend}
        onCancel={onCancel}
      />
      <details className="disclosure inventory">
        <summary tabIndex={0}>
          随身物品 <span className="muted">{hero.inventory.length} 件</span>
        </summary>
        <div className="inventory-list">
          <button
            disabled={busy || disabled || hero.weapon == null || !available}
            onClick={() => {
              const option = options.find(
                (o) => o.command.type === "equip" && o.command.weapon === null,
              );
              if (option) onAction(option);
            }}
          >
            拳头 <small>{hero.weapon == null ? "当前使用" : "卸下武器"}</small>
          </button>
          {hero.inventory.map((item, index) => {
            const equip = options.find(
              (o) => o.command.type === "equip" && o.command.weapon === item,
            );
            const use = options.find(
              (o) => o.command.type === "use" && o.command.item === item,
            );
            return (
              <button
                key={`${item}:${index}`}
                disabled={busy || (!equip && !use)}
                onClick={() => {
                  const option = equip ?? use;
                  if (option) onAction(option);
                }}
              >
                {item}
                <small>
                  {hero.weapon === item
                    ? "手持中"
                    : Object.hasOwn(WEAPONS, item)
                      ? "装备"
                      : item === "药草"
                        ? "使用 · 恢复生命"
                        : "纪念物"}
                </small>
              </button>
            );
          })}
        </div>
      </details>
    </>
  );
}
