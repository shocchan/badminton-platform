// Fog表示パレット（FogLevel→塗り）。review_neededはランタン色をわずかに混ぜ「再会待ち」を示す。
// pixelAssets.tsx から分離（react-refresh: component fileは component のみexport）。
export const FOG_FILL: Record<string, { fill: string; opacity: number }> = {
  clear: { fill: '#ffffff', opacity: 0 },
  light_fog: { fill: '#e3ebf2', opacity: 0.45 },
  foggy: { fill: '#dde6ee', opacity: 0.92 },
  review_needed: { fill: '#e6dfeb', opacity: 0.6 },
};
