// The colours of the regions of Differentiate / Integrate (reg1, reg2 …): Okabe–Ito, distinct for colour-blind eyes.
export const REGION_COLORS = ['#E69F00', '#56B4E9', '#009E73', '#CC79A7', '#0072B2', '#D55E00', '#8C6D31'];
export const regionColor = (k: number) => REGION_COLORS[((k % REGION_COLORS.length) + REGION_COLORS.length) % REGION_COLORS.length];
