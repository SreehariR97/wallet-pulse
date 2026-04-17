/**
 * Baked HSL literals for chart fills/strokes. Mirrors globals.css --chart-N
 * and semantic tokens. Using literals (not hsl(var(--*))) keeps chart SVG
 * output stable across SSR hydration — CSS variables can flash unresolved
 * during hydration on chart-heavy pages.
 *
 * Palette is tuned to read on both the light (pure white) and dark
 * (Mysteria-purple) surfaces — mid-saturation, mid-lightness.
 */

export const CHART_PALETTE = [
  "hsl(258 80% 72%)",   // Lavender Glow (accent)
  "hsl(261 45% 58%)",   // Amethyst
  "hsl(38 55% 62%)",    // Cream-gold
  "hsl(145 30% 55%)",   // Sage
  "hsl(15 55% 62%)",    // Terracotta
  "hsl(210 30% 55%)",   // Slate
  "hsl(335 35% 62%)",   // Dusty rose
] as const;

// Semantic colors — baked copies of --success / --destructive / --warning.
// Differ slightly between themes; we pick values that read on both.
export const CHART_SUCCESS = "hsl(150 35% 48%)";
export const CHART_DESTRUCTIVE = "hsl(0 55% 55%)";
export const CHART_WARNING = "hsl(35 65% 52%)";
export const CHART_ACCENT = "hsl(258 80% 72%)";
export const CHART_ACCENT_DEEP = "hsl(261 45% 58%)";

// Neutral/structural colors for axes, gridlines, tooltips — these stay
// CSS-var driven since they're on low-risk surfaces (text, 1px lines) and
// need to flip with theme.
export const AXIS_TICK = "hsl(var(--muted-foreground))";
export const AXIS_LABEL = "hsl(var(--foreground))";
export const GRID_STROKE = "hsl(var(--border))";
export const TOOLTIP_BG = "hsl(var(--popover))";
export const TOOLTIP_BORDER = "hsl(var(--border))";
export const CURSOR_FILL = "hsl(var(--muted))";
