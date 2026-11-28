import { useEffect, useSyncExternalStore } from 'react';

// Desk theme customization (#90) powered by CSS custom properties.
// The default Forest green & Walnut theme is untouched at index 0, followed by
// the heritage study desk themes:
// 1. Oxford Burgundy & Mahogany (Classic Vintage Library)
// 2. Midnight Navy & Teak (Late-Night Study Desk)
// 3. Espresso Roast & Maple (Warm Café Study Table)
// 4. Charcoal Slate & Birch (Modern Architect's Desk)
// 5. Royal Amethyst & Ebony (Dark Mode)
// 6. Burnt Umber & Cedar (Dark Mode)
// 7. Deep Obsidian & Walnut (Dark Mode)
// 8. Sunlit Linen & Oak (Daylight Mode)

export type ColorThemeId =
  | 'forest'
  | 'burgundy'
  | 'navy'
  | 'espresso'
  | 'slate'
  | 'amethyst'
  | 'umber'
  | 'obsidian'
  | 'linen';

export interface ColorThemePalette {
  id: ColorThemeId;
  label: string;
  // Leather/linen desk background (--bg-surface / --desk)
  bgSurface: string;
  // Card stock surface (--card-surface / --paper)
  cardSurface: string;
  // Main page sheet surface (--sheet-surface / --sheet)
  sheetSurface: string;
  // Primary body and heading text on cards/sheets (--text-primary / --ink)
  textPrimary: string;
  // Secondary/muted text on cards/sheets (--text-muted / --muted)
  textMuted: string;
  // Brass accent fill for buttons and plates (--accent-color / --brass)
  accentColor: string;
  // Hover state for primary accent (--accent-hover-color / --brass-hover)
  accentHover: string;
  // High-contrast accent text on card surfaces (--accent-ink / --brass-ink)
  accentInk: string;
  // High-contrast text directly on the desk surface (--on-desk-text / --on-desk)
  onDeskText: string;
  // Wooden card box front surface (--box-surface)
  boxSurface: string;
  // Text/icon color for unpressed ring controls on the card box front (--box-ring-text)
  boxRingText: string;
  // Sticky note paper tint (--sticky-bg)
  stickySurface: string;
  // Subtle border line on paper/sheets (--border-color / --border)
  borderColor: string;
  // Dark text placed on filled brass buttons (--button-text)
  buttonText: string;
}

export const COLOR_THEMES: readonly ColorThemePalette[] = [
  {
    // Default theme — untouched original FlashForge Forest Green & Walnut desk
    id: 'forest',
    label: 'Forest green',
    bgSurface: '#1f3b2d',
    cardSurface: '#f6efdf',
    sheetSurface: '#fbf7ee',
    textPrimary: '#2a2620',
    textMuted: '#5c5346',
    accentColor: '#c9a45c',
    accentHover: '#d8b56e',
    accentInk: '#7a5c22',
    onDeskText: '#ede6d6',
    boxSurface: '#5b3e2a',
    boxRingText: '#e2c887',
    stickySurface: '#e9d48c',
    borderColor: '#dcd2bd',
    buttonText: '#2a2112',
  },
  {
    // Theme 1: Oxford Burgundy & Mahogany (Classic Vintage Library)
    id: 'burgundy',
    label: 'Oxford Burgundy & Mahogany',
    bgSurface: '#42181a',
    cardSurface: '#f5ecdc',
    sheetSurface: '#fbf6ec',
    textPrimary: '#2a231e',
    textMuted: '#5e5248',
    accentColor: '#c9a256',
    accentHover: '#d8b368',
    accentInk: '#78571c',
    onDeskText: '#f2e8d9',
    boxSurface: '#82532d',
    boxRingText: '#f5dfb0',
    stickySurface: '#e3c37b',
    borderColor: '#dccfbe',
    buttonText: '#281e10',
  },
  {
    // Theme 2: Midnight Navy & Teak (Late-Night Study Desk)
    id: 'navy',
    label: 'Midnight Navy & Teak',
    bgSurface: '#152438',
    cardSurface: '#f5efe2',
    sheetSurface: '#faf6ed',
    textPrimary: '#21262e',
    textMuted: '#525863',
    accentColor: '#cca65a',
    accentHover: '#dbb76c',
    accentInk: '#78581c',
    onDeskText: '#ece7dc',
    boxSurface: '#78472a',
    boxRingText: '#f2d99b',
    stickySurface: '#ece07d',
    borderColor: '#d9d0be',
    buttonText: '#261e10',
  },
  {
    // Theme 3: Espresso Roast & Maple (Warm Café Study Table)
    id: 'espresso',
    label: 'Espresso Roast & Maple',
    bgSurface: '#211a16',
    cardSurface: '#f4ebd9',
    sheetSurface: '#faf4e8',
    textPrimary: '#28211c',
    textMuted: '#5c5046',
    accentColor: '#c89f52',
    accentHover: '#d7b064',
    accentInk: '#785518',
    onDeskText: '#efe6d5',
    boxSurface: '#7d4e29',
    boxRingText: '#f3dca6',
    stickySurface: '#bce3cf',
    borderColor: '#dbcbb6',
    buttonText: '#261d0f',
  },
  {
    // Theme 4: Charcoal Slate & Birch (Modern Architect's Desk)
    id: 'slate',
    label: 'Charcoal Slate & Birch',
    bgSurface: '#2b3036',
    cardSurface: '#f5f3ee',
    sheetSurface: '#faf9f5',
    textPrimary: '#22262a',
    textMuted: '#52585e',
    accentColor: '#cca358',
    accentHover: '#dab46a',
    accentInk: '#78561a',
    onDeskText: '#eef0f2',
    boxSurface: '#d8b485',
    boxRingText: '#2e2010',
    stickySurface: '#eba386',
    borderColor: '#d8d5cc',
    buttonText: '#261d10',
  },
  {
    // Theme 5: Royal Amethyst & Ebony (Dark Mode)
    id: 'amethyst',
    label: 'Royal Amethyst & Ebony',
    bgSurface: '#23152e',
    cardSurface: '#efe8f5',
    sheetSurface: '#f7f3fa',
    textPrimary: '#241b2e',
    textMuted: '#564a63',
    accentColor: '#c9a45c',
    accentHover: '#d8b56e',
    accentInk: '#73541c',
    onDeskText: '#efe8f5',
    boxSurface: '#6e482b',
    boxRingText: '#f2daa0',
    stickySurface: '#ece07d',
    borderColor: '#d5cbe0',
    buttonText: '#2a2112',
  },
  {
    // Theme 6: Burnt Umber & Cedar (Dark Mode)
    id: 'umber',
    label: 'Burnt Umber & Cedar',
    bgSurface: '#2e1c12',
    cardSurface: '#f5ede0',
    sheetSurface: '#faf5ec',
    textPrimary: '#2a201a',
    textMuted: '#5e4f45',
    accentColor: '#cca356',
    accentHover: '#dbb468',
    accentInk: '#78561a',
    onDeskText: '#f0e6d8',
    boxSurface: '#8f5b30',
    boxRingText: '#f7e2b2',
    stickySurface: '#eba386',
    borderColor: '#dccfbd',
    buttonText: '#261d10',
  },
  {
    // Theme 7: Deep Obsidian & Walnut (Dark Mode)
    id: 'obsidian',
    label: 'Deep Obsidian & Walnut',
    bgSurface: '#141716',
    cardSurface: '#f2eadb',
    sheetSurface: '#f8f3e8',
    textPrimary: '#24221e',
    textMuted: '#575248',
    accentColor: '#c8a258',
    accentHover: '#d7b36a',
    accentInk: '#755519',
    onDeskText: '#ece5d5',
    boxSurface: '#6b4629',
    boxRingText: '#f0d79c',
    stickySurface: '#bce3cf',
    borderColor: '#d9ceb9',
    buttonText: '#261e10',
  },
  {
    // Theme 8: Sunlit Linen & Oak (Daylight Mode)
    id: 'linen',
    label: 'Sunlit Linen & Oak',
    bgSurface: '#5e513f',
    cardSurface: '#faf6ed',
    sheetSurface: '#fdfbf6',
    textPrimary: '#2a241c',
    textMuted: '#5c5245',
    accentColor: '#c99e4e',
    accentHover: '#d8af60',
    accentInk: '#785516',
    onDeskText: '#fbf7ee',
    boxSurface: '#8c5a32',
    boxRingText: '#26180b',
    stickySurface: '#ece07d',
    borderColor: '#ded4c1',
    buttonText: '#261c0e',
  },
] as const;

export const DEFAULT_THEME_ID: ColorThemeId = 'forest';
export const THEME_STORAGE_KEY = 'flashforge_color_theme';
const THEME_CHANGE_EVENT = 'flashforge-color-theme-change';

let memoryThemeId: ColorThemeId = DEFAULT_THEME_ID;

export function isColorThemeId(value: unknown): value is ColorThemeId {
  return typeof value === 'string' && COLOR_THEMES.some((t) => t.id === value);
}

export function getColorTheme(id: ColorThemeId): ColorThemePalette {
  return COLOR_THEMES.find((t) => t.id === id) ?? COLOR_THEMES[0];
}

// Parses a #RRGGBB or #RGB hex string into [r, g, b] in 0..255.
export function parseHexColor(hex: string): [number, number, number] {
  const clean = hex.trim().replace(/^#/, '');
  if (clean.length === 3) {
    return [
      parseInt(clean[0] + clean[0], 16),
      parseInt(clean[1] + clean[1], 16),
      parseInt(clean[2] + clean[2], 16),
    ];
  }
  return [
    parseInt(clean.slice(0, 2), 16),
    parseInt(clean.slice(2, 4), 16),
    parseInt(clean.slice(4, 6), 16),
  ];
}

// WCAG 2.2 relative luminance L in [0, 1].
export function relativeLuminance(hex: string): number {
  const [r, g, b] = parseHexColor(hex).map((c) => {
    const sRGB = c / 255;
    return sRGB <= 0.04045 ? sRGB / 12.92 : Math.pow((sRGB + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

// WCAG 2.2 contrast ratio (L1 + 0.05) / (L2 + 0.05) in [1, 21].
export function contrastRatio(foregroundHex: string, backgroundHex: string): number {
  const l1 = relativeLuminance(foregroundHex);
  const l2 = relativeLuminance(backgroundHex);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return Number(((lighter + 0.05) / (darker + 0.05)).toFixed(2));
}

// True when the foreground/background pair meets WCAG 2.2 AA (4.5:1 normal, 3.0:1 large/UI).
export function meetsWcagAA(foregroundHex: string, backgroundHex: string, largeText = false): boolean {
  return contrastRatio(foregroundHex, backgroundHex) >= (largeText ? 3.0 : 4.5);
}

// Audits all essential text/surface pairings in a palette against WCAG 2.2 AA (4.5:1).
export function validatePaletteContrast(palette: ColorThemePalette): {
  valid: boolean;
  ratios: Record<string, number>;
} {
  const ratios = {
    textOnCard: contrastRatio(palette.textPrimary, palette.cardSurface),
    textOnSheet: contrastRatio(palette.textPrimary, palette.sheetSurface),
    mutedOnCard: contrastRatio(palette.textMuted, palette.cardSurface),
    mutedOnSheet: contrastRatio(palette.textMuted, palette.sheetSurface),
    accentInkOnCard: contrastRatio(palette.accentInk, palette.cardSurface),
    onDeskTextOnBg: contrastRatio(palette.onDeskText, palette.bgSurface),
    buttonTextOnAccent: contrastRatio(palette.buttonText, palette.accentColor),
  };
  const valid = Object.values(ratios).every((r) => r >= 4.5);
  return { valid, ratios };
}

export function themeCssVariables(palette: ColorThemePalette): Record<string, string> {
  return {
    '--bg-surface': palette.bgSurface,
    '--card-surface': palette.cardSurface,
    '--sheet-surface': palette.sheetSurface,
    '--text-primary': palette.textPrimary,
    '--text-muted': palette.textMuted,
    '--accent-color': palette.accentColor,
    '--accent-hover-color': palette.accentHover,
    '--accent-ink': palette.accentInk,
    '--on-desk-text': palette.onDeskText,
    '--box-surface': palette.boxSurface,
    '--box-ring-text': palette.boxRingText,
    '--sticky-bg': palette.stickySurface,
    '--border-color': palette.borderColor,
    '--button-text': palette.buttonText,
    '--desk': palette.bgSurface,
    '--paper': palette.cardSurface,
    '--sheet': palette.sheetSurface,
    '--ink': palette.textPrimary,
    '--muted': palette.textMuted,
    '--brass': palette.accentColor,
    '--brass-hover': palette.accentHover,
    '--brass-ink': palette.accentInk,
    '--on-desk': palette.onDeskText,
    '--border': palette.borderColor,
    '--background': palette.sheetSurface,
    '--foreground': palette.textPrimary,
    '--accent': palette.accentColor,
    '--accent-hover': palette.accentHover,
    '--link': palette.accentInk,
  };
}

export function applyThemeToDocument(themeId: ColorThemeId): void {
  if (typeof document === 'undefined') return;
  const palette = getColorTheme(themeId);
  const root = document.documentElement;
  root.dataset.theme = palette.id;
  const vars = themeCssVariables(palette);
  for (const [prop, val] of Object.entries(vars)) {
    root.style.setProperty(prop, val);
  }
}

export function readStoredThemeId(): ColorThemeId {
  if (typeof window === 'undefined') return DEFAULT_THEME_ID;
  try {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    if (saved === null) return memoryThemeId;
    return isColorThemeId(saved) ? saved : DEFAULT_THEME_ID;
  } catch {
    return memoryThemeId;
  }
}

export function setStoredThemeId(next: ColorThemeId): void {
  if (!isColorThemeId(next)) return;
  memoryThemeId = next;
  try {
    localStorage.setItem(THEME_STORAGE_KEY, next);
  } catch {
    // Storage blocked: in-memory fallback is already updated.
  }
  applyThemeToDocument(next);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
  }
}

export function resetThemeMemoryForTests(): void {
  memoryThemeId = DEFAULT_THEME_ID;
  if (typeof document !== 'undefined') {
    delete document.documentElement.dataset.theme;
    document.documentElement.removeAttribute('style');
  }
}

function subscribeTheme(onChange: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener('storage', onChange);
  window.addEventListener(THEME_CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener('storage', onChange);
    window.removeEventListener(THEME_CHANGE_EVENT, onChange);
  };
}

export function useColorTheme(): [ColorThemeId, (next: ColorThemeId) => void, ColorThemePalette] {
  const themeId = useSyncExternalStore(subscribeTheme, readStoredThemeId, () => DEFAULT_THEME_ID);
  const palette = getColorTheme(themeId);

  useEffect(() => {
    applyThemeToDocument(themeId);
  }, [themeId]);

  return [themeId, setStoredThemeId, palette];
}
