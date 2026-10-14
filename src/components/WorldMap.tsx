import { LOCATIONS } from "../engine/content";
import type { LocationId, World } from "../engine/types";
import { BookOpen, Castle, Flame, Orbit, MapPin } from "lucide-react";
const icons = {
  courtyard: Flame,
  archive: BookOpen,
  throne: Castle,
  rift: Orbit,
};
export default function WorldMap({
  world,
  onMove,
  busy,
}: {
  world: World;
  onMove: (id: LocationId) => void;
  busy: boolean;
}) {
  const spirit = world.scenario === "spirit";
  return (
    <div className={`world-map ${spirit ? "spirit" : ""}`}>
      <svg
        viewBox="0 0 900 480"
        className="map-art"
        aria-hidden="true"
        preserveAspectRatio="xMidYMid slice"
      >
        <defs>
          <pattern
            id="grid"
            width="32"
            height="32"
            patternUnits="userSpaceOnUse"
          >
            <path
              d="M32 0H0V32"
              fill="none"
              stroke="#93a082"
              strokeWidth=".4"
              opacity=".12"
            />
          </pattern>
          <radialGradient id="mist">
            <stop stopColor="#6f7b55" stopOpacity=".24" />
            <stop offset="1" stopColor="#1c241c" stopOpacity="0" />
          </radialGradient>
          <pattern
            id="trees"
            width="47"
            height="49"
            patternUnits="userSpaceOnUse"
          >
            <path
              d="M12 32L21 15 30 32H25L32 42H10L17 32Z"
              fill="#334033"
              stroke="#748268"
              strokeWidth=".6"
              opacity=".55"
            />
            <path d="M21 42V47" stroke="#64735d" opacity=".4" />
          </pattern>
          <filter id="blur">
            <feGaussianBlur stdDeviation="12" />
          </filter>
        </defs>
        <rect width="900" height="480" fill="#20291f" />
        <rect width="900" height="480" fill="url(#grid)" />
        <ellipse cx="460" cy="250" rx="440" ry="260" fill="url(#mist)" />
        {[0, 1, 2, 3, 4, 5, 6].map((i) => (
          <path
            key={i}
            d={`M${-100 + i * 30} 480Q${100 + i * 19} ${330 - i * 18} ${60 + i * 28} 160T${360 + i * 26} ${-90 + i * 12}M${620 + i * 29} -20Q${470 + i * 50} ${120 + i * 12} ${710 + i * 18} ${245 + i * 14}T${740 + i * 40} 520`}
            fill="none"
            stroke="#748261"
            strokeWidth="1"
            opacity=".13"
          />
        ))}
        <path
          d="M-20 390Q100 345 134 204T258-10L-20-10Z M690-10Q810 91 798 170T910 280V-10Z M450 480Q510 363 637 392T910 330V480Z"
          fill="url(#trees)"
        />
        <path
          d="M330-20Q360 79 407 114T460 235Q443 321 491 373T535 510"
          stroke="#587068"
          strokeWidth="27"
          fill="none"
          opacity=".23"
        />
        <path
          d="M330-20Q360 79 407 114T460 235Q443 321 491 373T535 510"
          stroke="#8bafa3"
          strokeWidth="1"
          fill="none"
          opacity=".18"
        />
        <path
          d="M269 329Q278 219 224 133M269 329Q466 335 608 158M608 158Q687 226 686 374M224 133Q392 57 608 158"
          fill="none"
          stroke="#b5a780"
          strokeWidth="2"
          strokeDasharray="5 7"
          opacity=".36"
        />
        <g fill="#30392a" stroke="#9aa483" strokeWidth="1" opacity=".5">
          <path d="M512 211V104L538 83 565 104V147H642V104L668 83 693 104V211Z" />
          <path d="M553 211V137H654V211M574 137V112H631V137M583 112V77H621V112M603 77V53L620 60 603 66" />
          <path d="M590 211V177Q603 162 616 177V211" />
          <path d="M188 163V99L223 82 258 99V163M177 163H270M193 112H252M202 119V154M222 119V154M242 119V154" />
        </g>
        <g opacity=".18" stroke="#b6b28f" fill="none">
          <ellipse cx="272" cy="333" rx="64" ry="24" />
          <ellipse cx="272" cy="333" rx="79" ry="34" />
          <ellipse cx="682" cy="375" rx="50" ry="25" />
          <path d="M651 375V331Q681 295 710 331V375" strokeWidth="8" />
        </g>
        <text
          x="435"
          y="425"
          fill="#a9b598"
          opacity=".2"
          fontSize="12"
          letterSpacing="7"
        >
          THE KINGDOM OF ASH
        </text>
        <path
          d="M834 44V91M813 66H855M834 44L828 58 834 54 840 58Z"
          stroke="#c6c4a3"
          strokeWidth="1"
          fill="#c6c4a3"
          opacity=".6"
        />
        <text x="830" y="35" fontSize="9" fill="#c6c4a3" opacity=".6">
          N
        </text>
      </svg>
      <div className="map-caption">
        <span className="live-dot" />{" "}
        {spirit ? "异域 · 灵境回廊" : "王城及周边"} <span>可探索区域</span>
      </div>
      {(
        Object.entries(LOCATIONS) as [
          LocationId,
          (typeof LOCATIONS)[LocationId],
        ][]
      )
        .filter(([id]) => !spirit || id === "rift")
        .map(([id, place]) => {
          const Icon = icons[id];
          const current = world.location === id;
          return (
            <button
              key={id}
              disabled={busy || current}
              className={`map-location ${current ? "current" : ""}`}
              style={{
                left: `${spirit ? 50 : place.x}%`,
                top: `${spirit ? 48 : place.y}%`,
              }}
              onClick={() => onMove(id)}
              aria-label={`前往${place.name}`}
            >
              {current && (
                <span className="you-label">
                  <MapPin size={10} /> 小队所在
                </span>
              )}
              <span className="location-pin">
                <Icon size={20} strokeWidth={1.5} />
              </span>
              <span className="location-name">
                {spirit ? "灵境回廊" : place.name}
              </span>
              {!current && <span className="travel-time">30 分钟</span>}
            </button>
          );
        })}
      <div className="map-bottom">
        <span>◇ 所有地点共享世界时间</span>
        <span>01 — 04</span>
      </div>
    </div>
  );
}
