import { useId } from "react";

export type DinkState = "idle" | "wave" | "cheer" | "think" | "sleep";

/**
 * Dink, the Serve mascot: a lime pickleball with an orange sweatband,
 * court-blue sneakers and a honeycomb paddle. Animated with CSS only
 * (styles in globals.css under `.dink`); motion stops for visitors who
 * prefer reduced motion.
 */
export function Dink({
  state = "idle",
  className = "",
  label,
}: {
  state?: DinkState;
  className?: string;
  /** Accessible name; omit when Dink is decorative. */
  label?: string;
}) {
  const clip = `dink-clip-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  return (
    <svg
      viewBox="0 0 210 225"
      className={`dink dink--${state} overflow-visible ${className}`}
      {...(label ? { role: "img", "aria-label": label } : { "aria-hidden": true })}
    >
      <defs>
        <clipPath id={clip}>
          <circle cx="100" cy="105" r="58" />
        </clipPath>
      </defs>
      <ellipse className="dink-shadow" cx="100" cy="208" rx="46" ry="6" fill="#2b2f36" opacity=".25" />

      <g className="dink-confetti">
        <rect x="20" y="20" width="7" height="4" fill="#d98a4e" />
        <rect x="45" y="6" width="7" height="4" fill="#1f5fbf" style={{ animationDelay: ".3s" }} />
        <rect x="160" y="14" width="7" height="4" fill="#9fbb26" style={{ animationDelay: ".6s" }} />
        <rect x="186" y="30" width="7" height="4" fill="#d98a4e" style={{ animationDelay: ".15s" }} />
        <rect x="100" y="0" width="7" height="4" fill="#1f5fbf" style={{ animationDelay: ".9s" }} />
        <rect x="135" y="4" width="7" height="4" fill="#d98a4e" style={{ animationDelay: ".45s" }} />
        <rect x="70" y="2" width="7" height="4" fill="#9fbb26" style={{ animationDelay: "1.1s" }} />
      </g>
      <g className="dink-zz" fontFamily="Arial, sans-serif" fontWeight="700" fill="#1f5fbf">
        <text x="150" y="56" fontSize="20">Z</text>
        <text x="166" y="44" fontSize="15">z</text>
        <text x="178" y="34" fontSize="11">z</text>
      </g>
      <g className="dink-bubble">
        <path
          d="M150 24 h46 a10 10 0 0 1 10 10 v14 a10 10 0 0 1 -10 10 h-30 l-8 8 v-8 h-8 a10 10 0 0 1 -10 -10 v-14 a10 10 0 0 1 10 -10z"
          fill="#fff"
          stroke="#2b2f36"
          strokeWidth="2"
        />
        <circle className="dink-dot" cx="160" cy="41" r="3.5" fill="#2b2f36" />
        <circle className="dink-dot" cx="173" cy="41" r="3.5" fill="#2b2f36" />
        <circle className="dink-dot" cx="186" cy="41" r="3.5" fill="#2b2f36" />
      </g>

      <g className="dink-whole">
        {/* legs and sneakers */}
        <path d="M84 158 L80 190 M116 158 L120 190" stroke="#2b2f36" strokeWidth="7" strokeLinecap="round" />
        <ellipse cx="74" cy="195" rx="15" ry="8" fill="#1f5fbf" />
        <path d="M60 198 H88" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" />
        <ellipse cx="126" cy="195" rx="15" ry="8" fill="#1f5fbf" />
        <path d="M112 198 H140" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" />

        {/* arms; the right hand holds the paddle */}
        <g className="dink-arm-l">
          <path d="M46 112 L32 142" stroke="#2b2f36" strokeWidth="7" strokeLinecap="round" />
          <circle cx="31" cy="145" r="7" fill="#c8e63c" stroke="#9fbb26" strokeWidth="2" />
        </g>
        <g className="dink-arm-r">
          <path d="M154 112 L168 142" stroke="#2b2f36" strokeWidth="7" strokeLinecap="round" />
          <g transform="translate(170,148) rotate(20)">
            <rect x="-11" y="4" width="22" height="28" rx="9" fill="#2b2f36" />
            <g fill="#5b6270">
              <circle cx="-4" cy="12" r="1.6" /><circle cx="3" cy="12" r="1.6" /><circle cx="-1" cy="18" r="1.6" />
              <circle cx="6" cy="18" r="1.6" /><circle cx="-4" cy="24" r="1.6" /><circle cx="3" cy="24" r="1.6" />
            </g>
            <rect x="-3" y="-8" width="6" height="13" rx="2" fill="#1d2330" />
          </g>
          <circle cx="169" cy="145" r="7" fill="#c8e63c" stroke="#9fbb26" strokeWidth="2" />
        </g>

        {/* the ball */}
        <circle cx="100" cy="105" r="58" fill="#c8e63c" stroke="#9fbb26" strokeWidth="3" />
        <g fill="#9fbb26">
          <circle cx="60" cy="95" r="5" /><circle cx="66" cy="132" r="5" /><circle cx="140" cy="92" r="5" />
          <circle cx="134" cy="130" r="5" /><circle cx="100" cy="152" r="5" /><circle cx="78" cy="76" r="5" />
          <circle cx="122" cy="76" r="5" />
        </g>
        <rect x="38" y="54" width="124" height="13" fill="#d98a4e" clipPath={`url(#${clip})`} />
        <path d="M154 60 l14 -6 l-3 10 z" fill="#d98a4e" />
        <ellipse cx="70" cy="118" rx="7" ry="4.5" fill="#d98a4e" opacity=".45" />
        <ellipse cx="130" cy="118" rx="7" ry="4.5" fill="#d98a4e" opacity=".45" />

        {/* face */}
        <g className="dink-eyes">
          <g className="dink-eyes-open">
            <ellipse cx="84" cy="100" rx="10" ry="12" fill="#fff" />
            <ellipse cx="116" cy="100" rx="10" ry="12" fill="#fff" />
            <g className="dink-pupils">
              <circle cx="86" cy="102" r="5" fill="#2b2f36" />
              <circle cx="118" cy="102" r="5" fill="#2b2f36" />
              <circle cx="88" cy="100" r="1.8" fill="#fff" />
              <circle cx="120" cy="100" r="1.8" fill="#fff" />
            </g>
          </g>
          <g className="dink-eyes-happy" stroke="#2b2f36" strokeWidth="4" fill="none" strokeLinecap="round">
            <path d="M75 102 Q84 90 93 102" />
            <path d="M107 102 Q116 90 125 102" />
          </g>
          <g className="dink-eyes-shut" stroke="#2b2f36" strokeWidth="4" fill="none" strokeLinecap="round">
            <path d="M75 102 Q84 110 93 102" />
            <path d="M107 102 Q116 110 125 102" />
          </g>
        </g>
        <g className="dink-m-smile">
          <path d="M86 122 Q100 140 114 122 Z" fill="#2b2f36" />
          <ellipse cx="100" cy="131" rx="6" ry="3" fill="#e86b6b" />
        </g>
        <g className="dink-m-open">
          <path d="M82 118 Q100 148 118 118 Z" fill="#2b2f36" />
          <ellipse cx="100" cy="133" rx="8" ry="4" fill="#e86b6b" />
        </g>
        <ellipse className="dink-m-o" cx="100" cy="127" rx="5" ry="6" fill="#2b2f36" />
        <path className="dink-m-sleep" d="M93 126 Q100 131 107 126" stroke="#2b2f36" strokeWidth="3.5" fill="none" strokeLinecap="round" />
      </g>
    </svg>
  );
}
