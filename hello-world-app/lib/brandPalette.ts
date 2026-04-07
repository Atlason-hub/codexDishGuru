import { setThemeColors, themePalettes } from './theme';

const clamp = (value: number) => Math.max(0, Math.min(255, value));

const mix = (base: string, tint: string, amount: number) => {
  const parse = (hex: string) => {
    const clean = hex.replace('#', '');
    const bigint = parseInt(clean, 16);
    return {
      r: (bigint >> 16) & 255,
      g: (bigint >> 8) & 255,
      b: bigint & 255,
    };
  };
  const a = parse(base);
  const b = parse(tint);
  const r = clamp(Math.round(a.r + (b.r - a.r) * amount));
  const g = clamp(Math.round(a.g + (b.g - a.g) * amount));
  const bl = clamp(Math.round(a.b + (b.b - a.b) * amount));
  const toHex = (n: number) => n.toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(bl)}`;
};

const hslToHex = (h: number, s: number, l: number) => {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0;
  let g = 0;
  let b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const toHex = (v: number) => Math.round((v + m) * 255).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
};

const hashString = (value: string) => {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
};

const accentFromLogo = (logoUrl: string) => {
  const hash = hashString(logoUrl);
  const hue = hash % 360;
  return hslToHex(hue, 0.45, 0.5);
};

export const applyPaletteFromLogo = async (logoUrl: string | null | undefined) => {
  if (!logoUrl) {
    setThemeColors(themePalettes.lightBlue);
    return;
  }
  try {
    const accent = accentFromLogo(logoUrl);
    const base = themePalettes.lightBlue;
    setThemeColors({
      ...base,
      accent,
      accentSoft: mix(base.background, accent, 0.35),
    });
  } catch (err) {
    setThemeColors(themePalettes.lightBlue);
  }
};
