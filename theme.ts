// The mobium brand palette.
//
// These are the definitions, copied from the gradient stops in
// mobium/assets/branding/mobium-icon.svg — not a color picker's reading of
// the raster. Contrast ratios are computed in that directory's README.

/** The mark's four gradients, each horizontal, left to right across the glyph. */
export const mark = {
  wingL: ['#4C59FC', '#3552FD'],
  wingR: ['#0F70FC', '#00BAFC'],
  footL: ['#763CFB', '#5832FA'],
  footR: ['#02BCC1', '#01CBDD'],
} as const;

export const ground = {
  dark: '#141826',
  light: '#FFFFFF',
} as const;

// UI roles. The palette is complementary rather than universal: on white only
// the violets and blues clear WCAG AA, and the cyans clear it only on the dark
// ground. Nothing here clears 4.5:1 on both.
//
// `#0F70FC` is deliberately absent. It reads as the obvious primary blue and
// measures 4.43:1 on white — under AA by 0.07, which no eye catches.
export const ui = {
  accent: mark.wingL[1], // #3552FD — 5.56:1 on white
  ink: ground.dark,      // #141826 — 17.67:1 on white
  onDark: mark.footR[1], // #01CBDD — 8.91:1 on #141826
} as const;
