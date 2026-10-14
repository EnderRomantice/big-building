import type { HeroId } from "../engine/types";
export default function Portrait({
  id,
  small = false,
}: {
  id: HeroId;
  small?: boolean;
}) {
  const colors = {
    ranger: ["#708772", "#bac3a6"],
    mage: ["#77848e", "#b4c5ce"],
    warden: ["#9a8063", "#d6c2a0"],
  };
  const [base, light] = colors[id];
  return (
    <svg
      className={`portrait ${small ? "small" : ""}`}
      viewBox="0 0 80 88"
      role="img"
      aria-label={
        { ranger: "游侠艾琳", mage: "秘法师索恩", warden: "守誓者洛克" }[id]
      }
    >
      <rect width="80" height="88" fill={base} opacity=".19" />
      <circle cx="40" cy="35" r="25" fill={base} opacity=".15" />
      <path d="M5 88Q8 59 30 55H51Q73 61 77 88" fill={base} />
      <path d="M30 49H50L48 65 40 72 32 63Z" fill="#baa993" />
      <path d="M27 27Q40 14 54 29L52 45Q40 63 29 45Z" fill={light} />
      {id === "ranger" ? (
        <>
          <path
            d="M15 57L22 26Q37 3 55 24L66 59 51 48 51 27 29 28 29 48Z"
            fill="#384a3c"
          />
          <path d="M12 78L30 53 40 69 53 53 70 79" fill="#455b48" />
          <path
            d="M58 6Q77 41 62 79"
            fill="none"
            stroke="#c4a978"
            strokeWidth="3"
          />
          <path d="M58 6L62 79" stroke="#c4a978" opacity=".5" />
        </>
      ) : id === "mage" ? (
        <>
          <path
            d="M23 34L25 20 47 13 60 27 56 42 49 24 39 31 30 28Z"
            fill="#d0d0c4"
          />
          <path d="M20 62L31 53 40 73 51 53 65 69 61 88H18Z" fill="#455361" />
          <path d="M66 24V88" stroke="#a39577" strokeWidth="3" />
          <path d="M66 10L73 23 66 35 59 23Z" fill="#98c6c1" />
          <circle cx="66" cy="23" r="12" fill="#98c6c1" opacity=".13" />
        </>
      ) : (
        <>
          <path
            d="M23 37V24Q37 9 56 25V40L51 34 50 27 29 27 29 39Z"
            fill="#45413a"
          />
          <path d="M29 43L40 49 52 42 48 54 39 58 31 51Z" fill="#5f5547" />
          <path d="M7 68L27 56 39 72 53 55 73 69 64 88H17Z" fill="#8a816e" />
          <path
            d="M14 71L30 63 43 71 40 88H17Z"
            fill="#494e46"
            stroke="#b4a783"
          />
          <path d="M24 69V85M19 75H30" stroke="#b4a783" />
        </>
      )}
      <path d="M32 36H36M44 36H48" stroke="#3f443d" strokeWidth="2" />
    </svg>
  );
}
