/** Free Google Fonts (all OFL / Apache) offered in the font picker, plus system stacks that need no download. */
export interface FontDef { id: string; family: string; category: "sans" | "serif" | "display" | "mono" | "system"; weights: number[] }

export const FONTS: FontDef[] = [
  { id: "system", family: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif", category: "system", weights: [] },
  { id: "system-serif", family: "Georgia, 'Times New Roman', serif", category: "system", weights: [] },
  { id: "Inter", family: "Inter", category: "sans", weights: [400, 500, 600, 700] },
  { id: "Assistant", family: "Assistant", category: "sans", weights: [400, 600, 700] },
  { id: "DM Sans", family: "DM Sans", category: "sans", weights: [400, 500, 700] },
  { id: "Figtree", family: "Figtree", category: "sans", weights: [400, 500, 700] },
  { id: "Manrope", family: "Manrope", category: "sans", weights: [400, 600, 700] },
  { id: "Outfit", family: "Outfit", category: "sans", weights: [400, 500, 700] },
  { id: "Plus Jakarta Sans", family: "Plus Jakarta Sans", category: "sans", weights: [400, 600, 700] },
  { id: "Poppins", family: "Poppins", category: "sans", weights: [400, 500, 600, 700] },
  { id: "Montserrat", family: "Montserrat", category: "sans", weights: [400, 600, 700] },
  { id: "Work Sans", family: "Work Sans", category: "sans", weights: [400, 500, 700] },
  { id: "Space Grotesk", family: "Space Grotesk", category: "sans", weights: [400, 500, 700] },
  { id: "Archivo", family: "Archivo", category: "sans", weights: [400, 600, 800] },
  { id: "Nunito Sans", family: "Nunito Sans", category: "sans", weights: [400, 600, 700] },
  { id: "Lato", family: "Lato", category: "sans", weights: [400, 700] },
  { id: "Open Sans", family: "Open Sans", category: "sans", weights: [400, 600, 700] },
  { id: "Playfair Display", family: "Playfair Display", category: "serif", weights: [400, 600, 700] },
  { id: "Cormorant Garamond", family: "Cormorant Garamond", category: "serif", weights: [400, 500, 600] },
  { id: "EB Garamond", family: "EB Garamond", category: "serif", weights: [400, 500, 600] },
  { id: "Libre Baskerville", family: "Libre Baskerville", category: "serif", weights: [400, 700] },
  { id: "Lora", family: "Lora", category: "serif", weights: [400, 600, 700] },
  { id: "Fraunces", family: "Fraunces", category: "serif", weights: [400, 600, 700] },
  { id: "DM Serif Display", family: "DM Serif Display", category: "serif", weights: [400] },
  { id: "Instrument Serif", family: "Instrument Serif", category: "serif", weights: [400] },
  { id: "Bebas Neue", family: "Bebas Neue", category: "display", weights: [400] },
  { id: "Oswald", family: "Oswald", category: "display", weights: [400, 600] },
  { id: "Syne", family: "Syne", category: "display", weights: [400, 600, 800] },
  { id: "Unbounded", family: "Unbounded", category: "display", weights: [400, 600] },
  { id: "Righteous", family: "Righteous", category: "display", weights: [400] },
  { id: "Caveat", family: "Caveat", category: "display", weights: [400, 700] },
  { id: "JetBrains Mono", family: "JetBrains Mono", category: "mono", weights: [400, 600] },
  { id: "IBM Plex Mono", family: "IBM Plex Mono", category: "mono", weights: [400, 600] },
];

const fallback: Record<FontDef["category"], string> = { sans: "sans-serif", serif: "serif", display: "sans-serif", mono: "monospace", system: "" };

export function fontStack(id: unknown) {
  const f = FONTS.find(x => x.id === id) ?? FONTS[0];
  return f.category === "system" ? f.family : `'${f.family}', ${fallback[f.category]}`;
}

/** One Google Fonts stylesheet URL for the fonts a theme uses. */
export function googleFontsUrl(ids: unknown[]) {
  const used = [...new Set(ids)].map(id => FONTS.find(f => f.id === id)).filter((f): f is FontDef => !!f && f.category !== "system");
  if (!used.length) return "";
  const fam = used.map(f => `family=${encodeURIComponent(f.family).replace(/%20/g, "+")}:wght@${f.weights.join(";")}`).join("&");
  return `https://fonts.googleapis.com/css2?${fam}&display=swap`;
}
