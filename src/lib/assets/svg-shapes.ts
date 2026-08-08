function svgDataUrl(inner: string, size = 200) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">${inner}</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function svgDataUrlWH(inner: string, width: number, height: number) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">${inner}</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

// ---------- Stickers ----------
export function starSticker(color = "#fbbf24") {
  const points = starPoints(100, 100, 90, 38, 5);
  return svgDataUrl(
    `<polygon points="${points}" fill="${color}" stroke="#d97706" stroke-width="4" stroke-linejoin="round"/>`,
  );
}

export function heartSticker(color = "#f472b6") {
  return svgDataUrl(
    `<path d="M100 175 C 20 120, 10 60, 50 35 C 75 20, 100 40, 100 60 C 100 40, 125 20, 150 35 C 190 60, 180 120, 100 175 Z" fill="${color}" stroke="#db2777" stroke-width="4" stroke-linejoin="round"/>`,
  );
}

export function speechBubbleSticker(color = "#60a5fa", text = "Hi!") {
  return svgDataUrl(
    `<rect x="15" y="25" width="170" height="110" rx="24" fill="${color}" stroke="#2563eb" stroke-width="4"/>
     <path d="M50 130 L40 165 L80 132 Z" fill="${color}" stroke="#2563eb" stroke-width="4"/>
     <text x="100" y="92" font-family="sans-serif" font-size="34" font-weight="700" fill="white" text-anchor="middle">${text}</text>`,
  );
}

export function badgeSticker(color = "#34d399", text = "★") {
  return svgDataUrl(
    `<circle cx="100" cy="100" r="80" fill="${color}" stroke="#059669" stroke-width="6"/>
     <circle cx="100" cy="100" r="62" fill="none" stroke="white" stroke-width="3" stroke-dasharray="6 6"/>
     <text x="100" y="118" font-family="sans-serif" font-size="52" fill="white" text-anchor="middle">${text}</text>`,
  );
}

export function arrowSticker(color = "#f97316") {
  return svgDataUrl(
    `<path d="M20 90 h110 v-30 l60 45 -60 45 v-30 h-110 Z" fill="${color}" stroke="#c2410c" stroke-width="4" stroke-linejoin="round" transform="translate(0 -5)"/>`,
  );
}

export function thumbsUpSticker(color = "#fde047") {
  return svgDataUrl(
    `<path d="M60 90 v70 h-30 v-70 z" fill="${color}" stroke="#ca8a04" stroke-width="4"/>
     <path d="M60 90 l25 -55 c5 -10 20 -8 20 5 v35 h35 c10 0 18 8 15 18 l-15 55 c-3 8 -10 12 -18 12 h-62 z" fill="${color}" stroke="#ca8a04" stroke-width="4" stroke-linejoin="round"/>`,
  );
}

// ---------- Frames ----------
export function thinFrame(color = "#ffffff") {
  return svgDataUrl(
    `<rect x="8" y="8" width="184" height="184" fill="none" stroke="${color}" stroke-width="8"/>`,
  );
}

export function thickFrame(color = "#ffffff") {
  return svgDataUrl(
    `<rect x="4" y="4" width="192" height="192" fill="none" stroke="${color}" stroke-width="22"/>`,
  );
}

export function roundedFrame(color = "#ffffff") {
  return svgDataUrl(
    `<rect x="10" y="10" width="180" height="180" rx="28" fill="none" stroke="${color}" stroke-width="12"/>`,
  );
}

export function dottedFrame(color = "#ffffff") {
  return svgDataUrl(
    `<rect x="10" y="10" width="180" height="180" fill="none" stroke="${color}" stroke-width="8" stroke-dasharray="4 10" stroke-linecap="round"/>`,
  );
}

// ---------- Washi tape ----------
export function washiTape(color = "#f9a8d4") {
  return svgDataUrlWH(
    `<rect width="220" height="60" fill="${color}" opacity="0.85"/>
     <g stroke="white" stroke-width="3" opacity="0.5">
       ${Array.from({ length: 12 }, (_, i) => `<line x1="${i * 22 - 10}" y1="0" x2="${i * 22 + 20}" y2="60"/>`).join("")}
     </g>`,
    220,
    60,
  );
}

export function washiTapeDots(color = "#93c5fd") {
  return svgDataUrlWH(
    `<rect width="220" height="60" fill="${color}" opacity="0.85"/>
     <g fill="white" opacity="0.6">
       ${Array.from({ length: 10 }, (_, i) =>
         Array.from({ length: 3 }, (_, j) => `<circle cx="${i * 22 + 11}" cy="${j * 20 + 10}" r="4"/>`).join(""),
       ).join("")}
     </g>`,
    220,
    60,
  );
}

// ---------- Paper textures ----------
export function paperTexture(color = "#fefce8") {
  return svgDataUrl(
    `<filter id="n"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" result="noise"/><feColorMatrix in="noise" type="saturate" values="0"/></filter>
     <rect width="200" height="200" fill="${color}"/>
     <rect width="200" height="200" filter="url(#n)" opacity="0.05"/>`,
  );
}

export function cardboardTexture() {
  return svgDataUrl(
    `<rect width="200" height="200" fill="#c8a27a"/>
     <g stroke="#a9835a" stroke-width="2" opacity="0.5">
       ${Array.from({ length: 20 }, (_, i) => `<path d="M0 ${i * 10} Q 50 ${i * 10 + 8} 100 ${i * 10} T 200 ${i * 10}"/>`).join("")}
     </g>`,
  );
}

export function notebookPaper() {
  return svgDataUrl(
    `<rect width="200" height="200" fill="#ffffff"/>
     <line x1="30" y1="0" x2="30" y2="200" stroke="#f87171" stroke-width="2"/>
     <g stroke="#93c5fd" stroke-width="1.5">
       ${Array.from({ length: 9 }, (_, i) => `<line x1="0" y1="${i * 22 + 20}" x2="200" y2="${i * 22 + 20}"/>`).join("")}
     </g>
     <g fill="#e5e7eb">
       ${Array.from({ length: 5 }, (_, i) => `<circle cx="15" cy="${i * 40 + 20}" r="6"/>`).join("")}
     </g>`,
  );
}

// ---------- Torn paper ----------
export function tornPaper(color = "#fffbeb") {
  const jag = Array.from({ length: 14 }, (_, i) => {
    const x = (i / 13) * 200;
    const y = i % 2 === 0 ? 12 : 0;
    return `${x},${y}`;
  }).join(" ");
  return svgDataUrl(
    `<polygon points="0,200 200,200 200,20 ${jag} 0,12" fill="${color}" stroke="#d6d3d1" stroke-width="2"/>`,
  );
}

// ---------- Polaroid ----------
export function polaroidFrame(rotation = 0) {
  return svgDataUrl(
    `<g transform="rotate(${rotation} 100 100)">
       <rect x="10" y="10" width="180" height="180" fill="white" stroke="#e5e7eb" stroke-width="2"/>
       <rect x="22" y="22" width="156" height="120" fill="#d4d4d8"/>
     </g>`,
  );
}

// ---------- Decorative shapes ----------
export function circleShape(color = "#a78bfa") {
  return svgDataUrl(`<circle cx="100" cy="100" r="85" fill="${color}"/>`);
}

export function blobShape(color = "#5eead4") {
  return svgDataUrl(
    `<path d="M100 20 C 150 20 180 60 175 100 C 170 145 140 180 95 178 C 55 176 20 150 22 105 C 24 55 55 20 100 20 Z" fill="${color}"/>`,
  );
}

export function hexagonShape(color = "#fca5a5") {
  const points = polygonPoints(100, 100, 85, 6, -30);
  return svgDataUrl(`<polygon points="${points}" fill="${color}"/>`);
}

export function dashedCircleShape(color = "#fbbf24") {
  return svgDataUrl(
    `<circle cx="100" cy="100" r="80" fill="none" stroke="${color}" stroke-width="6" stroke-dasharray="10 8"/>`,
  );
}

// ---------- Floral ----------
export function flowerAsset(color = "#f9a8d4", center = "#fde047") {
  const petals = Array.from({ length: 6 }, (_, i) => {
    const angle = (i * 60 * Math.PI) / 180;
    const cx = 100 + Math.cos(angle) * 40;
    const cy = 100 + Math.sin(angle) * 40;
    return `<ellipse cx="${cx}" cy="${cy}" rx="30" ry="20" fill="${color}" transform="rotate(${i * 60} ${cx} ${cy})"/>`;
  }).join("");
  return svgDataUrl(`${petals}<circle cx="100" cy="100" r="24" fill="${center}"/>`);
}

export function leafAsset(color = "#4ade80") {
  return svgDataUrl(
    `<path d="M100 20 C 150 50 160 130 100 180 C 40 130 50 50 100 20 Z" fill="${color}"/>
     <line x1="100" y1="30" x2="100" y2="170" stroke="#16a34a" stroke-width="3"/>`,
  );
}

export function branchAsset(color = "#4ade80") {
  return svgDataUrlWH(
    `<line x1="10" y1="100" x2="190" y2="100" stroke="#16a34a" stroke-width="4"/>
     <ellipse cx="50" cy="80" rx="20" ry="12" fill="${color}" transform="rotate(-20 50 80)"/>
     <ellipse cx="90" cy="120" rx="20" ry="12" fill="${color}" transform="rotate(20 90 120)"/>
     <ellipse cx="140" cy="80" rx="20" ry="12" fill="${color}" transform="rotate(-20 140 80)"/>
     <ellipse cx="170" cy="120" rx="20" ry="12" fill="${color}" transform="rotate(20 170 120)"/>`,
    200,
    200,
  );
}

// ---------- Emoji ----------
export function emojiAsset(emoji: string) {
  return svgDataUrl(
    `<text x="100" y="150" font-size="140" text-anchor="middle">${emoji}</text>`,
  );
}

// ---------- helpers ----------
function starPoints(cx: number, cy: number, rOuter: number, rInner: number, spikes: number) {
  const points: string[] = [];
  const step = Math.PI / spikes;
  let rot = -Math.PI / 2;
  for (let i = 0; i < spikes; i++) {
    points.push(`${cx + Math.cos(rot) * rOuter},${cy + Math.sin(rot) * rOuter}`);
    rot += step;
    points.push(`${cx + Math.cos(rot) * rInner},${cy + Math.sin(rot) * rInner}`);
    rot += step;
  }
  return points.join(" ");
}

function polygonPoints(cx: number, cy: number, r: number, sides: number, offsetDeg = 0) {
  const points: string[] = [];
  for (let i = 0; i < sides; i++) {
    const angle = ((360 / sides) * i + offsetDeg) * (Math.PI / 180);
    points.push(`${cx + Math.cos(angle) * r},${cy + Math.sin(angle) * r}`);
  }
  return points.join(" ");
}
