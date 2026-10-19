import SkillTree from "./SkillTree";
import { professionById } from "../engine/careers";
import type { ActionOption } from "../engine/actions";
import { affinityOf, discovered } from "../engine/worldContent";
import { REGIONAL_SKILLS } from "../engine/succession";
import { Fragment, useEffect, useRef } from "react";
import { heldWeapon, LOCATIONS, SCENARIOS, skillName } from "../engine/content";
import type { HeroId, NpcId, World } from "../engine/types";

export default function CharacterDetails({
  world,
  id,
  options,
  busy,
  onAction,
}: {
  world: World;
  id: HeroId | NpcId;
  options?: ActionOption[];
  busy?: boolean;
  onAction?: (option: ActionOption) => void;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  const hero = world.heroes.find((person) => person.id === id);
  const npc = world.npcs.find((person) => person.id === id);
  const person = hero ?? npc;
  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
    heading.current?.scrollIntoView({ block: "nearest" });
  }, [id]);
  if (!person) return <p className="hint">暂无人物信息。</p>;
  const lastWords = world.journal.findLast(
    (entry) =>
      entry.tone === "dialogue" &&
      entry.title === person.name &&
      (!npc || entry.location === npc.location),
  );
  const location =
    world.scenario === "spirit"
      ? "灵境回廊"
      : LOCATIONS[npc?.location ?? world.location].name;
  return (
    <article className="character-details" aria-label={`${person.name}的详情`}>
      <span className="section-label">
        {hero ? location : `在场人物 / ${location}`}
      </span>
      <h2 ref={heading} tabIndex={-1}>
        {person.name}
      </h2>
      <p className="character-subtitle">
        {hero
          ? `${hero.title} · Lv.${hero.level}`
          : npc?.relation === "hostile"
            ? "敌对"
            : npc?.relation === "ally"
              ? "友善 / 同阵营"
              : "中立"}
        {person.hp <= 0 ? " · 已倒下" : hero?.retired ? " · 已退隐" : ""}
      </p>
      {npc?.career && (
        <p className="hint">
          {professionById(npc.career.profession)?.name} · 护盾{" "}
          {npc.career.barrier} · 战术：
          {
            { balanced: "平衡", aggressive: "压制", cautious: "蓄势" }[
              npc.career.tactic
            ]
          }
        </p>
      )}
      {person.background && <p className="origin-story">{person.background}</p>}
      <dl className="character-stats">
        {npc && (
          <>
            <div>
              <dt>等级</dt>
              <dd>Lv.{npc.level}</dd>
            </div>
            <div>
              <dt>好感度</dt>
              <dd>
                {affinityOf(npc)} <span>/ 100</span>
              </dd>
            </div>
            <div>
              <dt>气力</dt>
              <dd>
                {npc.energy} <span>/ {npc.maxEnergy}</span>
              </dd>
            </div>
          </>
        )}
        <div>
          <dt>生命</dt>
          <dd>
            {person.hp} <span>/ {person.maxHp}</span>
          </dd>
        </div>
        {hero && (
          <div>
            <dt>{SCENARIOS[world.scenario].energy}</dt>
            <dd>
              {hero.energy} <span>/ {hero.maxEnergy}</span>
            </dd>
          </div>
        )}
        <div>
          <dt>攻击</dt>
          <dd>{person.attack}</dd>
        </div>
        <div>
          <dt>防御</dt>
          <dd>{person.defense}</dd>
        </div>
        <div>
          <dt>腐蚀</dt>
          <dd>{person.corruption}</dd>
        </div>
        {hero && (
          <div>
            <dt>经验</dt>
            <dd>
              {hero.xp} <span>/ {hero.level * 30}</span>
            </dd>
          </div>
        )}
      </dl>
      {hero && (
        <>
          {hero.gold !== undefined && (
            <p className="hint">
              铜钱 {hero.gold} · 已探索 {world.exploration?.visited.length ?? 0}{" "}
              处地点
            </p>
          )}
          <section className="character-section">
            <h3>装备与技能</h3>
            <dl className="character-facts">
              <dt>手持武器</dt>
              <dd>{heldWeapon(hero)}</dd>
              {!hero.career && (
                <>
                  <dt>战斗技能</dt>
                  <dd>
                    {skillName(world, hero.id)} · 等级 {hero.skillRank}
                  </dd>
                </>
              )}
              {hero.skills?.map((id) => {
                const skill = REGIONAL_SKILLS.find((s) => s.id === id);
                return skill ? (
                  <Fragment key={id}>
                    <dt>{skill.name}</dt>
                    <dd>
                      {skill.description} · {skill.energy} 气力
                    </dd>
                  </Fragment>
                ) : null;
              })}
              {!hero.career && (
                <>
                  <dt>治疗术</dt>
                  <dd>为选中的对象恢复 5 HP</dd>
                </>
              )}
            </dl>
          </section>
          <section className="character-section">
            <h3>
              随身物品 <span>{hero.inventory.length} 件</span>
            </h3>
            <p>
              {hero.inventory.length
                ? hero.inventory.join("、")
                : "暂无随身物品"}
            </p>
          </section>
        </>
      )}
      <SkillTree
        person={person}
        options={options}
        busy={busy}
        onAction={hero ? onAction : undefined}
      />
      {npc?.relationships?.length ? (
        <section className="character-section">
          <h3>社会关系 · {npc.faction}</h3>
          <ul className="social-links">
            {npc.relationships.map((r, i) => {
              const target = world.npcs.find((n) => n.id === r.target);
              return (
                <li key={`${r.target}-${i}`}>
                  <span>
                    {target && discovered(world, target.location)
                      ? target.name
                      : "尚未结识的人"}
                  </span>
                  <span>{r.bond}</span>
                </li>
              );
            })}
          </ul>
          <p className="hint">
            友善不代表不能攻击。攻击会降低好感，关系恶化后可能引发反击。
          </p>
        </section>
      ) : null}
      {npc && (
        <section className="character-section">
          <h3>最近对话</h3>
          {lastWords ? (
            <blockquote>{lastWords.text}</blockquote>
          ) : (
            <p className="hint">你们还没有交谈。返回场景后，可以向对方开口。</p>
          )}
        </section>
      )}
    </article>
  );
}
