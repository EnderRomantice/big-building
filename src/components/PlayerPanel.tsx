import { ENERGY_COST, heldWeapon, SKILLS, WEAPONS } from "../engine/content";
import type { Hero, Npc, World } from "../engine/types";
import type { ActionOption } from "../engine/actions";
import AgentPanel from "./AgentPanel";
export default function PlayerPanel({
  world,
  hero,
  target,
  options,
  busy,
  disabled,
  onAction,
  onSend,
  onCancel,
}: {
  world: World;
  hero: Hero;
  target?: Npc;
  options: ActionOption[];
  busy: boolean;
  disabled: boolean;
  onAction: (option: ActionOption) => void;
  onSend: (text: string) => Promise<boolean>;
  onCancel: () => void;
}) {
  const attack = options.find(
    (o) =>
      o.command.type === "strike" &&
      o.command.target === target?.id &&
      !o.command.skill,
  );
  const skill = options.find(
    (o) =>
      o.command.type === "strike" &&
      o.command.target === target?.id &&
      o.command.skill,
  );
  const available = !hero.retired && hero.hp > 0;
  return (
    <>
      <section className="player-profile" aria-label="自己的角色">
        <span className="section-label">你的角色</span>
        <h2>
          {hero.name}
          <small>
            {hero.title} · Lv.{hero.level}
          </small>
        </h2>
        <div className="resources">
          <span>
            生命 {hero.hp}/{hero.maxHp}
          </span>
          <span>
            {world.scenario === "spirit" ? "灵力" : "魔力"} {hero.energy}/
            {hero.maxEnergy}
          </span>
        </div>
      </section>
      <div className="player-actions">
        <button
          disabled={busy || !attack}
          onClick={() => attack && onAction(attack)}
        >
          <span>用{heldWeapon(hero)}攻击</span>
          <small>普通攻击</small>
        </button>
        <button
          disabled={busy || !skill}
          onClick={() => skill && onAction(skill)}
        >
          <span>释放{SKILLS[hero.id]}</span>
          <small>{ENERGY_COST.skill} 能量</small>
        </button>
        <p className="hint">
          {!available
            ? "你的旅程已经结束。可以导出记录，或重新开始。"
            : target
              ? `当前目标：${target.name}${hero.energy < ENERGY_COST.skill ? " · 技能能量不足" : ""}`
              : "选择右侧人物后攻击，或在下面开口交谈。"}
        </p>
      </div>
      <AgentPanel
        target={target ? `对${target.name}说` : "对场景说"}
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
