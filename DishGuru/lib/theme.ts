const palettes = {
  classic: {
    background: '#FFF6EE',
    card: '#FFFAF4',
    cardAlt: '#FFF3E8',
    border: '#E9D8C7',
    text: '#4B2A1B',
    textMuted: '#8B6B5A',
    accent: '#8B3D22',
    accentSoft: '#FBE3D0',
    danger: '#B24B2D',
    white: '#FFFFFF',
    ink: '#2F1A12',
  },
  lightBlue: {
    background: '#FFFFFF',
    card: '#FFFFFF',
    cardAlt: '#FFFFFF',
    border: '#E5E5E5',
    text: '#3B2B1E',
    textMuted: '#7A5E3F',
    accent: '#73A5CA',
    accentSoft: '#CFE2F1',
    danger: '#C4502A',
    white: '#FFFFFF',
    ink: '#2E2117',
  },
  citrusHeat: {
    background: '#FFFFFF',
    card: '#FFFFFF',
    cardAlt: '#FFFFFF',
    border: '#E5E5E5',
    text: '#7A2D10',
    textMuted: '#9A3B12',
    accent: '#C84F18',
    accentSoft: '#FFF0A3',
    danger: '#F72808',
    white: '#FFFFFF',
    ink: '#7A2D10',
  },
};

type Palette = typeof palettes.classic;

let activePaletteName: keyof typeof palettes = 'citrusHeat';

export const theme = {
  colors: palettes[activePaletteName] as Palette,
};

const listeners = new Set<() => void>();

export const themePalettes = palettes;

export const getThemePaletteName = () => activePaletteName;

export const setThemePalette = (name: keyof typeof palettes) => {
  activePaletteName = name;
  theme.colors = palettes[name] as Palette;
  listeners.forEach((cb) => cb());
};

export const setThemeColors = (colors: Palette) => {
  theme.colors = colors;
  listeners.forEach((cb) => cb());
};

export const subscribeTheme = (cb: () => void) => {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
};
