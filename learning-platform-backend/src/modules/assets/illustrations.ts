/**
 * @file modules/assets/illustrations.ts
 * @description Generator ilustrasi kartu kosakata berbasis SVG vektor murni (tanpa ketergantungan font/emoji OS)
 * untuk disajikan melalui `GET /api/assets/illustration/:slug` pada kartu Flashcard dan Kuis gim edukasi.
 */

interface IllustrationSpec {
  bgFrom: string;
  bgTo: string;
  ring: string;
  art: string;
}

const ILLUSTRATIONS: Record<string, IllustrationSpec> = {
  apple: {
    bgFrom: '#4c0519',
    bgTo: '#9f1239',
    ring: '#fda4af',
    art: `
      <ellipse cx="80" cy="132" rx="34" ry="8" fill="#000" opacity="0.25"/>
      <path d="M80 46 C62 38, 36 52, 38 82 C40 112, 60 128, 80 124 C100 128, 120 112, 122 82 C124 52, 98 38, 80 46 Z" fill="#ef4444" stroke="#7f1d1d" stroke-width="3.5"/>
      <path d="M54 62 C48 74, 49 92, 57 104" stroke="#fecaca" stroke-width="6" stroke-linecap="round" fill="none" opacity="0.75"/>
      <path d="M80 48 C79 36, 83 28, 88 24" stroke="#78350f" stroke-width="5" stroke-linecap="round" fill="none"/>
      <path d="M84 34 C96 24, 114 28, 110 40 C104 46, 91 44, 84 34 Z" fill="#22c55e" stroke="#14532d" stroke-width="2.5"/>
    `,
  },
  banana: {
    bgFrom: '#422006',
    bgTo: '#854d0e',
    ring: '#fde047',
    art: `
      <ellipse cx="82" cy="132" rx="38" ry="8" fill="#000" opacity="0.25"/>
      <path d="M40 98 C54 124, 102 122, 124 76 C129 65, 126 48, 118 40 C114 54, 104 78, 82 90 C62 100, 48 98, 40 98 Z" fill="#facc15" stroke="#854d0e" stroke-width="3.5" stroke-linejoin="round"/>
      <path d="M48 102 C68 112, 98 104, 115 74" stroke="#fef9c3" stroke-width="5" stroke-linecap="round" fill="none" opacity="0.8"/>
      <path d="M116 39 L123 33" stroke="#713f12" stroke-width="5.5" stroke-linecap="round"/>
      <circle cx="39" cy="98" r="3.5" fill="#713f12"/>
    `,
  },
  cat: {
    bgFrom: '#311042',
    bgTo: '#6b21a8',
    ring: '#f9a8d4',
    art: `
      <ellipse cx="80" cy="132" rx="34" ry="8" fill="#000" opacity="0.25"/>
      <polygon points="44,68 38,32 68,50" fill="#fb923c" stroke="#7c2d12" stroke-width="3.5" stroke-linejoin="round"/>
      <polygon points="116,68 122,32 92,50" fill="#fb923c" stroke="#7c2d12" stroke-width="3.5" stroke-linejoin="round"/>
      <polygon points="47,62 43,40 62,52" fill="#fda4af"/>
      <polygon points="113,62 117,40 98,52" fill="#fda4af"/>
      <ellipse cx="80" cy="86" rx="42" ry="36" fill="#fb923c" stroke="#7c2d12" stroke-width="3.5"/>
      <path d="M72 52 L72 62 M80 50 L80 62 M88 52 L88 62" stroke="#c2410c" stroke-width="3.5" stroke-linecap="round"/>
      <circle cx="64" cy="82" r="6.5" fill="#1e1b4b"/><circle cx="62" cy="80" r="2.3" fill="#fff"/>
      <circle cx="96" cy="82" r="6.5" fill="#1e1b4b"/><circle cx="94" cy="80" r="2.3" fill="#fff"/>
      <polygon points="76,92 84,92 80,97" fill="#f43f5e"/>
      <path d="M72 101 Q80 107 88 101" stroke="#7c2d12" stroke-width="3" fill="none" stroke-linecap="round"/>
      <path d="M32 86 L50 90 M30 96 L50 96 M128 86 L110 90 M130 96 L110 96" stroke="#fff7ed" stroke-width="2.5" stroke-linecap="round"/>
    `,
  },
  dog: {
    bgFrom: '#1e293b',
    bgTo: '#0369a1',
    ring: '#7dd3fc',
    art: `
      <ellipse cx="80" cy="132" rx="34" ry="8" fill="#000" opacity="0.25"/>
      <ellipse cx="40" cy="82" rx="14" ry="26" transform="rotate(14 40 82)" fill="#92400e" stroke="#451a03" stroke-width="3.5"/>
      <ellipse cx="120" cy="82" rx="14" ry="26" transform="rotate(-14 120 82)" fill="#92400e" stroke="#451a03" stroke-width="3.5"/>
      <ellipse cx="80" cy="82" rx="38" ry="36" fill="#fcd34d" stroke="#78350f" stroke-width="3.5"/>
      <ellipse cx="80" cy="95" rx="22" ry="16" fill="#fffbeb"/>
      <circle cx="65" cy="75" r="6" fill="#1e293b"/><circle cx="63" cy="73" r="2.2" fill="#fff"/>
      <circle cx="95" cy="75" r="6" fill="#1e293b"/><circle cx="93" cy="73" r="2.2" fill="#fff"/>
      <ellipse cx="80" cy="89" rx="7" ry="5" fill="#451a03"/>
      <path d="M75 101 Q80 112 85 101 Z" fill="#fb7185" stroke="#be123c" stroke-width="2"/>
    `,
  },
  book: {
    bgFrom: '#1e1b4b',
    bgTo: '#4338ca',
    ring: '#a5b4fc',
    art: `
      <ellipse cx="80" cy="132" rx="40" ry="8" fill="#000" opacity="0.25"/>
      <path d="M28 52 Q54 44 80 54 Q106 44 132 52 L132 114 Q106 106 80 116 Q54 106 28 114 Z" fill="#38bdf8" stroke="#1e3a8a" stroke-width="3.5" stroke-linejoin="round"/>
      <path d="M34 48 Q57 40 80 50 Q103 40 126 48 L126 108 Q103 100 80 110 Q57 100 34 108 Z" fill="#fffbeb" stroke="#cbd5e1" stroke-width="2.5"/>
      <line x1="80" y1="50" x2="80" y2="110" stroke="#94a3b8" stroke-width="2.5"/>
      <path d="M44 64 H70 M44 75 H70 M44 86 H64 M90 64 H116 M90 75 H116 M90 86 H110" stroke="#64748b" stroke-width="3" stroke-linecap="round"/>
      <polygon points="96,46 106,46 106,76 101,70 96,76" fill="#f43f5e"/>
    `,
  },
  sun: {
    bgFrom: '#7c2d12',
    bgTo: '#d97706',
    ring: '#fde047',
    art: `
      <g stroke="#fde047" stroke-width="5" stroke-linecap="round">
        <line x1="80" y1="22" x2="80" y2="34"/><line x1="80" y1="126" x2="80" y2="138"/>
        <line x1="22" y1="80" x2="34" y2="80"/><line x1="126" y1="80" x2="138" y2="80"/>
        <line x1="39" y1="39" x2="48" y2="48"/><line x1="112" y1="112" x2="121" y2="121"/>
        <line x1="121" y1="39" x2="112" y2="48"/><line x1="48" y1="112" x2="39" y2="121"/>
      </g>
      <circle cx="80" cy="80" r="34" fill="#facc15" stroke="#b45309" stroke-width="3.5"/>
      <circle cx="68" cy="76" r="4.5" fill="#78350f"/>
      <circle cx="92" cy="76" r="4.5" fill="#78350f"/>
      <path d="M70 89 Q80 98 90 89" stroke="#78350f" stroke-width="3.5" fill="none" stroke-linecap="round"/>
    `,
  },
  moon: {
    bgFrom: '#0f172a',
    bgTo: '#312e81',
    ring: '#fef08a',
    art: `
      <path d="M96 34 A44 44 0 1 0 124 102 A34 34 0 1 1 96 34 Z" fill="#fde047" stroke="#ca8a04" stroke-width="3.5" stroke-linejoin="round"/>
      <circle cx="114" cy="48" r="4" fill="#fef9c3"/>
      <circle cx="128" cy="68" r="2.8" fill="#bae6fd"/>
      <circle cx="44" cy="44" r="3" fill="#fef9c3"/>
    `,
  },
  water: {
    bgFrom: '#082f49',
    bgTo: '#0284c7',
    ring: '#7dd3fc',
    art: `
      <ellipse cx="80" cy="132" rx="34" ry="8" fill="#000" opacity="0.25"/>
      <path d="M80 28 C80 28, 42 74, 42 98 A38 38 0 0 0 118 98 C118 74, 80 28, 80 28 Z" fill="#38bdf8" stroke="#0369a1" stroke-width="3.5"/>
      <path d="M60 88 C58 100, 64 112, 74 116" stroke="#e0f2fe" stroke-width="6" stroke-linecap="round" fill="none" opacity="0.85"/>
    `,
  },
  plant: {
    bgFrom: '#052e16',
    bgTo: '#15803d',
    ring: '#86efac',
    art: `
      <ellipse cx="80" cy="124" rx="40" ry="12" fill="#78350f" stroke="#451a03" stroke-width="3"/>
      <path d="M80 120 Q80 82 80 56" stroke="#22c55e" stroke-width="6" stroke-linecap="round" fill="none"/>
      <path d="M80 82 C54 80, 40 60, 50 46 C66 46, 80 62, 80 82 Z" fill="#4ade80" stroke="#14532d" stroke-width="3"/>
      <path d="M80 72 C106 70, 120 50, 110 36 C94 36, 80 52, 80 72 Z" fill="#22c55e" stroke="#14532d" stroke-width="3"/>
    `,
  },
  rain: {
    bgFrom: '#0f172a',
    bgTo: '#1e40af',
    ring: '#93c5fd',
    art: `
      <path d="M46 86 H114 A18 18 0 0 0 116 52 A24 24 0 0 0 72 42 A20 20 0 0 0 42 58 A16 16 0 0 0 46 86 Z" fill="#e2e8f0" stroke="#475569" stroke-width="3.5"/>
      <g stroke="#38bdf8" stroke-width="5" stroke-linecap="round">
        <line x1="56" y1="98" x2="50" y2="118"/>
        <line x1="80" y1="98" x2="74" y2="118"/>
        <line x1="104" y1="98" x2="98" y2="118"/>
      </g>
    `,
  },
  flour: {
    bgFrom: '#451a03',
    bgTo: '#92400e',
    ring: '#fde68a',
    art: `
      <rect x="44" y="42" width="72" height="84" rx="16" fill="#fef3c7" stroke="#92400e" stroke-width="3.5"/>
      <path d="M44 56 H116" stroke="#d97706" stroke-width="3"/>
      <circle cx="80" cy="88" r="18" fill="#fde68a" stroke="#b45309" stroke-width="2.5"/>
      <path d="M80 74 V102 M72 82 L80 88 L88 82 M72 92 L80 98 L88 92" stroke="#b45309" stroke-width="2.8" stroke-linecap="round" fill="none"/>
    `,
  },
  sugar: {
    bgFrom: '#500724',
    bgTo: '#be185d',
    ring: '#fbcfe8',
    art: `
      <rect x="46" y="48" width="68" height="78" rx="14" fill="#fff1f2" stroke="#9d174d" stroke-width="3.5"/>
      <rect x="52" y="36" width="56" height="14" rx="6" fill="#f472b6" stroke="#9d174d" stroke-width="3"/>
      <rect x="62" y="72" width="16" height="16" rx="3" fill="#fff" stroke="#cbd5e1" stroke-width="2.5"/>
      <rect x="82" y="76" width="16" height="16" rx="3" fill="#fff" stroke="#cbd5e1" stroke-width="2.5"/>
      <rect x="70" y="92" width="16" height="16" rx="3" fill="#fff" stroke="#cbd5e1" stroke-width="2.5"/>
    `,
  },
  butter: {
    bgFrom: '#422006',
    bgTo: '#a16207',
    ring: '#fef08a',
    art: `
      <ellipse cx="80" cy="106" rx="52" ry="16" fill="#e2e8f0" stroke="#64748b" stroke-width="3"/>
      <rect x="44" y="64" width="56" height="36" rx="6" fill="#fde047" stroke="#ca8a04" stroke-width="3.5"/>
      <rect x="104" y="72" width="14" height="28" rx="4" fill="#fef08a" stroke="#ca8a04" stroke-width="3"/>
    `,
  },
  eggs: {
    bgFrom: '#431407',
    bgTo: '#c2410c',
    ring: '#fed7aa',
    art: `
      <path d="M62 40 C44 40, 36 68, 38 92 C40 112, 52 122, 66 122 C80 122, 90 110, 90 92 C90 68, 80 40, 62 40 Z" fill="#ffedd5" stroke="#9a3412" stroke-width="3.5"/>
      <ellipse cx="102" cy="102" rx="28" ry="20" fill="#fff" stroke="#cbd5e1" stroke-width="3"/>
      <circle cx="102" cy="100" r="10" fill="#f59e0b"/>
    `,
  },
  milk: {
    bgFrom: '#0c4a6e',
    bgTo: '#0284c7',
    ring: '#bae6fd',
    art: `
      <polygon points="50,56 80,34 110,56" fill="#38bdf8" stroke="#075985" stroke-width="3.5" stroke-linejoin="round"/>
      <rect x="50" y="56" width="60" height="70" rx="8" fill="#f8fafc" stroke="#075985" stroke-width="3.5"/>
      <rect x="50" y="78" width="60" height="24" fill="#38bdf8"/>
    `,
  },
  vanilla: {
    bgFrom: '#3b0764',
    bgTo: '#7e22ce',
    ring: '#e9d5ff',
    art: `
      <rect x="66" y="34" width="28" height="16" rx="4" fill="#d97706" stroke="#451a03" stroke-width="3"/>
      <rect x="52" y="50" width="56" height="76" rx="14" fill="#78350f" stroke="#451a03" stroke-width="3.5"/>
      <circle cx="80" cy="88" r="16" fill="#fef3c7"/>
      <circle cx="80" cy="88" r="5" fill="#f59e0b"/>
    `,
  },
  chocolate: {
    bgFrom: '#27120b',
    bgTo: '#7c2d12',
    ring: '#fdba74',
    art: `
      <rect x="44" y="36" width="72" height="88" rx="10" fill="#78350f" stroke="#451a03" stroke-width="3.5"/>
      <rect x="52" y="44" width="24" height="22" rx="3" fill="#92400e"/>
      <rect x="84" y="44" width="24" height="22" rx="3" fill="#92400e"/>
      <rect x="52" y="72" width="24" height="22" rx="3" fill="#92400e"/>
      <rect x="84" y="72" width="24" height="22" rx="3" fill="#92400e"/>
      <path d="M42 92 L118 84 L118 126 L42 126 Z" fill="#ef4444" stroke="#991b1b" stroke-width="3"/>
    `,
  },
  cinnamon: {
    bgFrom: '#451a03',
    bgTo: '#b45309',
    ring: '#fcd34d',
    art: `
      <g transform="rotate(-18 80 80)">
        <rect x="46" y="44" width="18" height="74" rx="8" fill="#b45309" stroke="#451a03" stroke-width="3"/>
        <rect x="70" y="40" width="18" height="78" rx="8" fill="#d97706" stroke="#451a03" stroke-width="3"/>
        <rect x="94" y="46" width="18" height="72" rx="8" fill="#92400e" stroke="#451a03" stroke-width="3"/>
        <rect x="42" y="74" width="74" height="10" rx="4" fill="#fef08a" stroke="#78350f" stroke-width="2.5"/>
      </g>
    `,
  },
  strawberry: {
    bgFrom: '#4c0519',
    bgTo: '#e11d48',
    ring: '#fda4af',
    art: `
      <path d="M80 126 C52 118, 38 82, 48 58 C56 44, 104 44, 112 58 C122 82, 108 118, 80 126 Z" fill="#f43f5e" stroke="#881337" stroke-width="3.5"/>
      <path d="M54 52 L68 62 L80 46 L92 62 L106 52 L88 42 L80 30 L72 42 Z" fill="#22c55e" stroke="#14532d" stroke-width="2.5" stroke-linejoin="round"/>
      <g fill="#fef08a">
        <circle cx="66" cy="74" r="2.5"/><circle cx="94" cy="74" r="2.5"/><circle cx="80" cy="84" r="2.5"/>
        <circle cx="68" cy="96" r="2.5"/><circle cx="92" cy="96" r="2.5"/><circle cx="80" cy="108" r="2.5"/>
      </g>
    `,
  },
  honey: {
    bgFrom: '#451a03',
    bgTo: '#d97706',
    ring: '#fde047',
    art: `
      <ellipse cx="80" cy="90" rx="36" ry="34" fill="#f59e0b" stroke="#78350f" stroke-width="3.5"/>
      <rect x="54" y="44" width="52" height="16" rx="7" fill="#fde047" stroke="#78350f" stroke-width="3"/>
      <path d="M56 60 Q68 78 76 64 Q86 82 96 62 Q104 72 106 60" fill="#fef08a"/>
    `,
  },
  cheese: {
    bgFrom: '#422006',
    bgTo: '#ca8a04',
    ring: '#fef08a',
    art: `
      <polygon points="34,98 124,62 124,114 34,114" fill="#facc15" stroke="#854d0e" stroke-width="3.5" stroke-linejoin="round"/>
      <polygon points="34,98 84,46 124,62" fill="#fef08a" stroke="#854d0e" stroke-width="3.5" stroke-linejoin="round"/>
      <circle cx="68" cy="98" r="7" fill="#eab308" stroke="#a16207" stroke-width="2"/>
      <circle cx="98" cy="88" r="9" fill="#eab308" stroke="#a16207" stroke-width="2"/>
      <circle cx="108" cy="104" r="5" fill="#eab308" stroke="#a16207" stroke-width="2"/>
    `,
  },
  salt: {
    bgFrom: '#0f172a',
    bgTo: '#475569',
    ring: '#e2e8f0',
    art: `
      <rect x="58" y="36" width="44" height="16" rx="6" fill="#94a3b8" stroke="#334155" stroke-width="3"/>
      <path d="M54 52 H106 L112 122 H48 Z" fill="#e2e8f0" stroke="#475569" stroke-width="3.5" stroke-linejoin="round"/>
      <path d="M52 86 Q80 78 108 88 L110 120 H50 Z" fill="#ffffff"/>
    `,
  },
};

export function renderVocabularyIllustrationSvg(rawSlug: string): string {
  const key = rawSlug
    .toLowerCase()
    .replace(/\.svg$/i, '')
    .replace(/[^a-z0-9_-]/g, '');

  const spec: IllustrationSpec = ILLUSTRATIONS[key] ?? {
    bgFrom: '#1e1b4b',
    bgTo: '#4338ca',
    ring: '#38bdf8',
    art: `
      <polygon points="80,34 93,62 124,66 101,88 107,118 80,103 53,118 59,88 36,66 67,62" fill="#facc15" stroke="#ca8a04" stroke-width="3.5" stroke-linejoin="round"/>
    `,
  };

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160" width="160" height="160" role="img" aria-label="${key || 'card'}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${spec.bgFrom}"/>
      <stop offset="100%" stop-color="${spec.bgTo}"/>
    </linearGradient>
  </defs>
  <rect x="6" y="6" width="148" height="148" rx="32" fill="url(#bg)" stroke="${spec.ring}" stroke-width="4"/>
  <circle cx="42" cy="34" r="6" fill="#ffffff" opacity="0.16"/>
  ${spec.art}
</svg>`;
}
