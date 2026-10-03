// Single source of visual constants. Dark, cinematic palette: near-black stage, warm gold accent (coins),
// cool violet for interactive surfaces.
export const colors = {
  bg: "#0B0B12",
  surface: "#15152030",
  card: "#171724",
  cardRaised: "#1F1F30",
  border: "#2A2A3D",
  text: "#F4F2FF",
  textMuted: "#9A98B3",
  accent: "#8B7CFF",
  accentSoft: "#2A2552",
  gold: "#F5C451",
  goldSoft: "#3A2F12",
  success: "#3DDC97",
  successSoft: "#12382A",
  danger: "#FF5C7A",
  dangerSoft: "#3B1521",
  overlay: "rgba(11,11,18,0.7)",
} as const;

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const radius = { sm: 8, md: 12, lg: 16, xl: 24, pill: 999 } as const;

export const fonts = {
  display: { fontSize: 32, fontWeight: "800" as const, letterSpacing: -0.5 },
  title: { fontSize: 22, fontWeight: "700" as const },
  heading: { fontSize: 18, fontWeight: "700" as const },
  body: { fontSize: 16, fontWeight: "400" as const },
  bodyStrong: { fontSize: 16, fontWeight: "600" as const },
  caption: { fontSize: 13, fontWeight: "500" as const },
} as const;

/** Difficulty 1-3 → label color. */
export function difficultyColor(d: 1 | 2 | 3): string {
  return d === 1 ? colors.success : d === 2 ? colors.gold : colors.danger;
}
