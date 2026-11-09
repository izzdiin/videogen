// Katalog gaya visual untuk mesin Slides, diadaptasi dari katalog
// "Directing Stickman Videos" Style 1-5 (Mode A). Di Videogen katalog ini
// menjadi preset arah gambar: teks arah (suffix) ditempel ke prompt gambar
// tiap scene saat generate, dan ringkasannya diberikan ke model naskah
// supaya prompt gambar yang ditulisnya selaras dengan gaya terpilih.
// Karakter antar-scene tetap bergantung pada model gambar (SDXL /
// Pollinations), preset ini mengarahkan gaya, bukan mengunci identitas.

export const VISUAL_STYLES = [
  { id: "bebas", label: "Bebas (tanpa preset)", suffix: "", direction: "" },
  {
    id: "style1-light",
    label: "Style 1 · Classic Minimalist — Light",
    suffix:
      "classic minimalist stick figure illustration, flat pure white background, thin black line art only, hollow circle head stick figure with simple line limbs, no shading, no gradients, no textures, no shadows, flat 2D, vivid accent colors on props only (vivid red, electric blue, warm gold), generous empty space",
    direction:
      "Classic Minimalist Light: flat pure-white canvas, black line art stick figures (hollow circle head, no clothing), at most three saturated accent colors on props only, no textures or shadows",
  },
  {
    id: "style1-dark",
    label: "Style 1 · Classic Minimalist — Dark",
    suffix:
      "classic minimalist stick figure illustration, flat pitch black background, thin white line art only, hollow circle head stick figure with simple line limbs, no shading, no gradients, no textures, flat 2D, vivid accent colors on props only (vivid red, electric blue, warm gold), generous empty space",
    direction:
      "Classic Minimalist Dark: flat pitch-black canvas, white line art stick figures (hollow circle head, no clothing), at most three saturated accent colors on props only, no textures",
  },
  {
    id: "style2a",
    label: "Style 2A · Modern Beanie — Studio Tech",
    suffix:
      "modern minimalist 2D animation still, stick figure wearing a bright red beanie with no pom-pom and a yellow t-shirt, black stick limbs, bright white high-key studio space, subtle light-gray perspective grid floor, glowing cyan and electric blue glass holographic UI panels, clean white negative space, flat vector look, no circuit board textures, no sci-fi corridors, no photorealistic skin, no speech bubbles",
    direction:
      "Modern Studio Tech: the same stick figure in a red beanie (no pom-pom) and yellow t-shirt inside a bright white studio with a light-gray floor grid and glowing cyan-blue glass UI elements; strictly minimalist, no circuitry or sci-fi clutter",
  },
  {
    id: "style2b",
    label: "Style 2B · Modern Beanie — Cinematic Story",
    suffix:
      "cinematic 2D animation still, stick figure wearing a bright red beanie with no pom-pom and a yellow t-shirt, black stick limbs, inside a rich full-color cinematic environment, warm volumetric lighting, soft depth of field, atmospheric narrative mood, smooth flat vector character over a painterly background, no photorealistic faces, no 3D CGI look, no speech bubbles",
    direction:
      "Cinematic Story: the same stick figure in a red beanie (no pom-pom) and yellow t-shirt staged in rich full-color cinematic environments (warm lamplight, dusk skies, dramatic landscapes) with volumetric lighting and depth",
  },
  {
    id: "style3",
    label: "Style 3 · Prehistoric Hand-Drawn / Dark Comedy",
    suffix:
      "prehistoric hand-drawn cartoon, earthy prehistoric landscape with rocks, caves and a campfire, warm firelight accents, subtle paper texture, white filled round heads with expressive cartoon faces, black stick limbs, rough ink outlines, muted earthy palette, playful dark comedy mood",
    direction:
      "Prehistoric Hand-Drawn / Dark Comedy: earthy prehistoric settings, warm fire accents, subtle paper texture, white filled heads with expressive cartoon faces and black stick limbs; satirical, ironic tone",
  },
  {
    id: "style4",
    label: "Style 4 · Cozy Storytelling",
    suffix:
      "cozy storytelling 2D cartoon, full-color everyday location, gentle warm atmospheric light, expressive character with a white filled round head, slim torso and dark stick limbs, simple friendly face, soft rounded shapes, warm comforting palette, cinematic framing",
    direction:
      "Cozy Storytelling: full-color 2D cartoon locations (office, cafe, park, metro), gentle atmospheric light, characters with white filled round heads and slim torsos, expressive simple faces; each scene a different story location",
  },
  {
    id: "style5",
    label: "Style 5 · Historical Cartoon",
    suffix:
      "historical cartoon illustration, painterly full-color historical setting, era-accurate architecture, clothing and props, clean cel shading, expressive characters with white filled round heads, solid black oval eyes, thin black limbs, storybook illustration look",
    direction:
      "Historical Cartoon: full-color painterly historical settings with era-specific wardrobe and props, clean cel shading, characters with white filled round heads, black oval eyes and thin black limbs; freeze the drawing grammar, change only the era pack",
  },
  {
    id: "kartun-datar",
    label: "Kartun Datar — 2D explainer (ala kartun bencana)",
    suffix:
      "flat 2D vector cartoon illustration, bold clean black outlines, simple flat colors, minimal shading, one lime green accent color, friendly educational explainer animation still, simple readable shapes and characters, no photorealism, no gradients, no text",
    direction:
      "Flat 2D Cartoon: bold-outlined flat vector cartoon stills, simple shapes, minimal shading, one lime-green accent; a friendly explainer look (disaster/science story channels). Pair with caption style 'Satu Kata' for the full effect.",
  },
];

export const VISUAL_STYLE_IDS = VISUAL_STYLES.map((s) => s.id);

export function visualStyleOf(id) {
  return VISUAL_STYLES.find((s) => s.id === id) || VISUAL_STYLES[0];
}

/** Prompt gambar final untuk mesin Slides: prompt scene + arah gaya preset. */
export function slidesImagePrompt(project, scene) {
  const st = visualStyleOf(project?.visualStyle);
  const base = scene.imagePrompt || "";
  return st.suffix ? `${base}, ${st.suffix}` : base;
}

// Prompt siap salin untuk Google Flow (mode sumber visual "flow"):
// deskripsi visual scene yang sama dengan prompt gambar, dibingkai ulang
// sebagai arahan video — gerakan kamera halus tanpa potongan, durasi
// mengikuti petunjuk durasi scene, format mengikuti rasio proyek, dan
// tanpa teks di dalam frame (overlay & caption ditambahkan Videogen
// saat perakitan).
export function flowVideoPrompt(project, scene) {
  const aspect = project?.aspect || "9:16";
  const aspectText = aspect === "16:9" ? "landscape 16:9" : aspect === "1:1" ? "square 1:1" : "vertical 9:16";
  const secs = Math.max(3, Math.round(scene?.durationHint || 6));
  return [
    slidesImagePrompt(project, scene),
    "Cinematic video shot, smooth slow camera movement, natural realistic motion, one continuous take, no cuts, no scene changes.",
    `Duration about ${secs} seconds, ${aspectText} format. No text, no captions, no watermark, no logos in the frame.`,
  ].join("\n");
}
