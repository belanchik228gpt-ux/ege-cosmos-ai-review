export function OrbitArt({ compact = false }: { compact?: boolean }) {
  return (
    <svg
      className={`orbit-art ${compact ? 'compact' : ''}`}
      viewBox="0 0 640 460"
      role="img"
      aria-label="Светящаяся планета среди учебных орбит"
    >
      <defs>
        <radialGradient id="planet">
          <stop stopColor="#d7c6ff" />
          <stop offset=".36" stopColor="#8963dc" />
          <stop offset=".77" stopColor="#352663" />
          <stop offset="1" stopColor="#131226" />
        </radialGradient>
        <radialGradient id="halo">
          <stop stopColor="#9368ff" stopOpacity=".25" />
          <stop offset="1" stopColor="#9368ff" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="orbit" x2="1" y2="1">
          <stop stopColor="#d3b1ff" stopOpacity=".05" />
          <stop offset=".48" stopColor="#ccb5fc" />
          <stop offset="1" stopColor="#69d9ec" stopOpacity=".16" />
        </linearGradient>
        <linearGradient id="sphere" x2="1" y2="1">
          <stop stopColor="#ad8fff" />
          <stop offset="1" stopColor="#44357b" />
        </linearGradient>
      </defs>
      <circle cx="330" cy="230" r="220" fill="url(#halo)" />
      {Array.from({ length: 35 }, (_, i) => (
        <circle
          key={i}
          cx={45 + ((i * 113) % 565)}
          cy={25 + ((i * 67) % 405)}
          r={i % 6 === 0 ? 1.8 : 0.8}
          fill={i % 3 ? '#dad3ff' : '#efcd8c'}
          opacity={0.25 + (i % 4) * 0.13}
        />
      ))}
      <g transform="translate(330 235) rotate(-24)">
        <ellipse rx="242" ry="80" fill="none" stroke="url(#orbit)" strokeWidth="1" />
        <ellipse
          rx="195"
          ry="66"
          fill="none"
          stroke="#807299"
          strokeOpacity=".24"
          strokeDasharray="2 9"
        />
        <ellipse rx="278" ry="100" fill="none" stroke="#797097" strokeOpacity=".12" />
      </g>
      <g className="planet-float">
        <circle cx="330" cy="224" r="104" fill="#ae84ff" opacity=".04" />
        <circle cx="330" cy="224" r="87" fill="url(#planet)" />
        <path
          d="M266 197 Q325 135 385 205 Q397 225 401 240 Q344 203 267 264"
          fill="#b79cf4"
          opacity=".12"
        />
        <path
          d="M268 192 Q305 140 353 153"
          fill="none"
          stroke="#ccb5ff"
          strokeWidth="2"
          opacity=".7"
        />
        <ellipse
          cx="330"
          cy="224"
          rx="89"
          ry="88"
          fill="none"
          stroke="#aa8be3"
          strokeOpacity=".3"
        />
      </g>
      <path d="M101 322 Q293 342 533 154" fill="none" stroke="url(#orbit)" strokeWidth="2" />
      <g className="satellite-float">
        <circle cx="126" cy="310" r="10" fill="url(#sphere)" />
        <circle cx="126" cy="310" r="15" fill="none" stroke="#8c77bc" strokeOpacity=".3" />
      </g>
      <circle cx="509" cy="164" r="5" fill="#f1d19a" />
      <g transform="translate(445 79)">
        <rect width="115" height="47" rx="14" fill="#201c35" stroke="#605078" strokeOpacity=".7" />
        <text x="17" y="29" fill="#d5c9ef" fontSize="17" fontFamily="Georgia, serif">
          a² + b² = c²
        </text>
      </g>
      <g transform="translate(111 103)">
        <rect width="49" height="49" rx="14" fill="#1d2339" stroke="#446977" strokeOpacity=".65" />
        <path
          d="M123 112 L147 141 L118 141Z"
          transform="translate(-108 -99)"
          fill="none"
          stroke="#93d3df"
          strokeWidth="1.5"
        />
      </g>
      <g transform="translate(387 335)">
        <rect width="101" height="39" rx="12" fill="#282238" stroke="#615071" strokeOpacity=".6" />
        <text x="17" y="25" fill="#c9bce1" fontSize="13">
          знание → навык
        </text>
      </g>
    </svg>
  );
}
