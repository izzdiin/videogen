import { DC_ICON_IDS } from "./dc-icons.js";
import { DG_COMPONENTS, DG_COMPONENT_LABELS } from "./diagram-constants.js";
import { visualStyleOf } from "./visualStyles.js";
import { aiConfig } from "./settings.js";

export async function listModels() {
  return listModelsRaw();
}

export async function listModelsRaw() {
  const { ninerouterBase: BASE, ninerouterKey: KEY } = aiConfig();
  const res = await fetch(`${BASE}/models`, {
    headers: KEY ? { Authorization: `Bearer ${KEY}` } : {},
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`9Router /models: HTTP ${res.status}`);
  const data = await res.json();
  return (data.data || []).map((m) => m.id).filter(Boolean);
}

async function chat(model, system, user) {
  const { ninerouterBase: BASE, ninerouterKey: KEY } = aiConfig();
  const res = await fetch(`${BASE}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(KEY ? { Authorization: `Bearer ${KEY}` } : {}),
    },
    body: JSON.stringify({
      model,
      stream: false,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      temperature: 0.7,
    }),
    signal: AbortSignal.timeout(180000),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`9Router chat: HTTP ${res.status} ${t.slice(0, 200)}`);
  }
  const text = await res.text();
  // Some 9Router legs answer with an SSE stream despite stream:false — fold it back into text.
  if (text.trimStart().startsWith("data:") || text.includes("\ndata:")) {
    let out = "";
    for (const line of text.split("\n")) {
      const t = line.trim();
      if (!t.startsWith("data:")) continue;
      const payload = t.slice(5).trim();
      if (payload === "[DONE]") continue;
      try {
        const j = JSON.parse(payload);
        out += j.choices?.[0]?.delta?.content || j.choices?.[0]?.message?.content || "";
      } catch {}
    }
    if (out) return out;
    throw new Error("Respons streaming dari model tidak terbaca.");
  }
  const data = JSON.parse(text);
  return data.choices?.[0]?.message?.content || "";
}

function parseJSON(text) {
  let t = String(text).trim();
  t = t.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start >= 0 && end > start) t = t.slice(start, end + 1);
  return JSON.parse(t);
}

const STICK_PROP_IDS = ["bulb", "note", "youtube", "camera", "clapper", "calendar", "opensource", "script"];

async function generateDarkcardScript(project, model, ctx) {
  const { en, langName, perScene } = ctx;
  const n = project.sceneCount;
  const system = `You are a director for dark "UI card" explainer shorts (dark navy background, a label chip + uppercase mono title, a growing stack of icon cards, big captions with one highlighted phrase). You output ONLY valid JSON, no markdown fences, no commentary.`;
  const user = `Direct a ${n}-scene Dark Card video.

Theme/idea: ${project.theme}
Target total duration: ${project.targetDuration} seconds.
Narration language: ${langName}. On-screen text language: ${langName}.
Budget: about ${perScene} narration words per scene.

Format rules (a proven listicle system):
- The video teaches by ACCUMULATION: every scene adds exactly ONE new card to a stack that stays on screen. Scene 1 is the hook ("hook"): it frames the topic and introduces card #1. Middle scenes are problems ("problem"): each names ONE concrete problem/mistake, and its card is the fix, habit or layer that answers it. The final scene is the payoff ("result"): it recaps the complete stack as a system and may add one last card.
- On-screen title per scene: at most 3 words, uppercase style, punchy, in ${langName} (e.g. a problem name like "KODE BERANTAKAN" or "DATA HILANG"). It must NOT simply repeat the narration.
- "chip": the small label next to the title. Use "MASALAH" for problem scenes in Indonesian (or "PROBLEM" in English), the final scene uses "HASIL" (or "RESULT"), the hook uses "PEMBUKA" (or "START"). Keep the chip word consistent across problem scenes.
- Card per scene: "icon" one of ${DC_ICON_IDS.join(", ")}; "label" at most 4 words, a concrete fix/layer name in ${langName} (e.g. "API key di luar kode"); "note" at most 3 words, an uppercase-style category tag (e.g. "DATABASE", "RULES FILE", "satu file").
- "highlight": ONE short phrase (1-3 words) that literally appears inside this scene's narration — the key phrase of the scene, shown highlighted in the caption.
- Narration is spoken audio only, plain sentences, conversational, in ${langName}. Each problem scene's narration: name the pain first, then the fix that the new card represents.

Output JSON exactly: {"scenes":[{"title":"...","narration":"...","chip":"MASALAH","kind":"problem","cardIcon":"file","cardLabel":"...","cardNote":"...","highlight":"..."}]}
Use kind "hook" for scene 1, "problem" for middle scenes, "result" for the last scene.`;

  const raw = await chat(model, system, user);
  const parsed = parseJSON(raw);
  if (!parsed.scenes || !Array.isArray(parsed.scenes) || parsed.scenes.length === 0) {
    throw new Error("Model tidak mengembalikan daftar scene yang valid.");
  }
  return parsed.scenes.slice(0, 20).map((s, i, arr) => {
    const kind = ["hook", "problem", "result"].includes(s.kind)
      ? s.kind
      : i === 0 ? "hook" : i === arr.length - 1 ? "result" : "problem";
    const label = String(s.cardLabel || "").trim();
    return {
      title: String(s.title || ""),
      narration: String(s.narration || ""),
      imagePrompt: "",
      overlay: String(s.title || ""),
      dc: {
        kind,
        chip: String(s.chip || ""),
        card: label
          ? {
              icon: DC_ICON_IDS.includes(s.cardIcon) ? s.cardIcon : "file",
              label,
              note: String(s.cardNote || ""),
            }
          : null,
        highlight: String(s.highlight || ""),
      },
    };
  });
}

async function generateBedahScript(project, model, ctx) {
  const { langName, perScene } = ctx;
  const n = project.sceneCount;
  const compList = DG_COMPONENTS.map((c) => `${c} (${DG_COMPONENT_LABELS[c]})`).join(", ");
  const system = `You are a director for "science breakdown" shorts (mode Bedah): every scene is its own cream diagram PAGE — a bold headline on top, up to two big-number data cards, one recurring subject drawn as a flat diagram with animated flow arrows and callout pills, and a caption pill with one yellow keyword. Pages do NOT accumulate: each scene shows only its own diagram. You output ONLY valid JSON, no markdown fences, no commentary.`;
  const user = `Direct a ${n}-scene Bedah (science breakdown) video.

Theme/idea: ${project.theme}
Target total duration: ${project.targetDuration} seconds.
Narration language: ${langName}. On-screen text language: ${langName}.
Budget: about ${perScene} narration words per scene.

Format rules (modelled on a proven "yok bedah"-style science explainer):
- Pick ONE recurring subject component in scene 1 (usually "rumah" for housing topics, otherwise the topic's main object) and bring it back in most scenes — each scene re-adds it in its own "ops", because every page is independent.
- Scene 1 is the hook: a puzzling question as the headline (e.g. "Sudah dibuka, kok masih panas?"), the subject shown plainly, no data cards yet. Middle scenes each isolate ONE mechanism: one diagram state plus at most 2 data cards carrying the hard numbers. The final scene is the one-line takeaway: the subject in its "solved" state, no new numbers.
- "headline": at most 6 words, punchy, in ${langName}, a contrast or mini-verdict ("Luar vs dalam", "Masuk, tak keluar"); it must NOT simply repeat the narration. "accent": the 1-2 word phrase inside the headline shown in the accent colour.
- "keyword": ONE word that literally appears in this scene's narration — the word highlighted yellow in the caption pill. Choose the word carrying the beat's punch.
- "data": 0-2 data cards for scenes with real numbers: {"label":"ATAP LOGAM · SIANG","value":">59 °C","result":"bisa 60 °C lebih","tone":"hot"}. "label" is a small caps source/context tag; "value" is the big number (keep it short, use ± or ≈ for estimates); "result" is the short consequence line (shown on a yellow highlight); "tone" is "hot" for alarming/high values (the number renders red), otherwise "plain". Use widely-known, defensible approximate values only — this is an educational explainer, not a lab report.
- "ops": this page's diagram instructions, in order. Shapes:
  {"op":"add","comp":"rumah","id":"rumah","label":"Atap logam"} — "label" is a callout pill of at most 3 words pointing at the component; leave "" when no callout. Components must be one of: ${compList}. Invent short lowercase ids and reuse them EXACTLY inside this scene's ops. At most 3 components per page.
  {"op":"flow","from":"jendela"... } — a curved animated arrow between two component ids of THIS scene: {"op":"flow","from":"luar","to":"rumah","kind":"panas"} with kind "panas" (heat, orange-red), "aliran" (air/flow, teal) or "netral" (grey).
  {"op":"connect","from":"a","to":"b","color":"blue"} — a plain cable, only when a flow arrow does not fit.
  For air/heat movement prefer the dedicated components "panah-panas" (rising heat arrows) and "aliran" (circular airflow loop) as add-able diagram elements next to the subject.
- Narration is spoken audio only, plain conversational sentences in ${langName}; do not start a scene by reading its headline aloud. When a data card shows a number, the narration says that number in words.

Output JSON exactly: {"scenes":[{"title":"...","narration":"...","headline":"...","accent":"...","keyword":"...","data":[],"ops":[]}]}`;

  const raw = await chat(model, system, user);
  const parsed = parseJSON(raw);
  if (!parsed.scenes || !Array.isArray(parsed.scenes) || parsed.scenes.length === 0) {
    throw new Error("Model tidak mengembalikan daftar scene yang valid.");
  }
  const cableColors = ["blue", "red", "gold", "green", "grey"];
  const flowKinds = ["panas", "aliran", "netral"];
  const slug = (v) => String(v || "").toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 24);
  return parsed.scenes.slice(0, 20).map((s) => {
    const ops = [];
    for (const op of Array.isArray(s.ops) ? s.ops : []) {
      if (!op || typeof op !== "object") continue;
      if (op.op === "add" && slug(op.id)) {
        ops.push({
          op: "add",
          comp: DG_COMPONENTS.includes(op.comp) ? op.comp : "kotak",
          id: slug(op.id),
          label: String(op.label || "").slice(0, 26),
        });
      } else if (op.op === "connect" && slug(op.from) && slug(op.to)) {
        ops.push({ op: "connect", from: slug(op.from), to: slug(op.to), color: cableColors.includes(op.color) ? op.color : "blue" });
      } else if (op.op === "flow" && slug(op.from) && slug(op.to)) {
        ops.push({ op: "flow", from: slug(op.from), to: slug(op.to), kind: flowKinds.includes(op.kind) ? op.kind : "netral" });
      }
    }
    const data = [];
    for (const d of Array.isArray(s.data) ? s.data.slice(0, 2) : []) {
      if (!d || typeof d !== "object" || !String(d.value || "").trim()) continue;
      data.push({
        label: String(d.label || "").slice(0, 30),
        value: String(d.value || "").slice(0, 14),
        result: String(d.result || "").slice(0, 34),
        tone: d.tone === "hot" ? "hot" : "plain",
      });
    }
    const headline = String(s.headline || s.title || "");
    return {
      title: String(s.title || ""),
      narration: String(s.narration || ""),
      imagePrompt: "",
      overlay: headline,
      dg: {
        headline,
        accent: String(s.accent || ""),
        badge: "",
        badgeColor: "grey",
        trackerLabel: "",
        steps: [],
        card: null,
        keyword: String(s.keyword || "").slice(0, 24),
        data,
        ops,
      },
    };
  });
}

async function generateDiagramScript(project, model, ctx) {
  if (project.diagram?.mode === "bedah") return generateBedahScript(project, model, ctx);
  const { langName, perScene } = ctx;
  const n = project.sceneCount;
  const compList = DG_COMPONENTS.map((c) => `${c} (${DG_COMPONENT_LABELS[c]})`).join(", ");
  const system = `You are a director for "diagram explainer" shorts: ONE flat-vector diagram on a warm cream canvas that is built up step by step while a virtual camera pans across it, a bold headline per section with one accent-coloured keyword, a small status pill, and karaoke captions. You output ONLY valid JSON, no markdown fences, no commentary.`;
  const user = `Direct a ${n}-scene Diagram video.

Theme/idea: ${project.theme}
Target total duration: ${project.targetDuration} seconds.
Narration language: ${langName}. On-screen text language: ${langName}.
Budget: about ${perScene} narration words per scene.

Format rules (modelled on a proven technical-explainer reel format):
- The WHOLE video is one diagram that grows. Components appear once and stay; cables connect them; the camera moves to whatever is new. Plan the full diagram first (a left-to-right flow: subject/source on the left, the destination/monitor on the right), then reveal it piece by piece.
- Scene 1 is the hook: a paradox or striking question as the headline; it adds the first 1-2 components (the subject side). Scene 2 names the system/mechanism and adds the next component. Middle scenes are single steps: each adds at most 2 new components and/or at most 2 cables, and focuses the camera on what is new. If the topic has a limitation or exception, give it its own scene. The final scene is the one-line conclusion: it adds nothing new and focuses "all" (the wide closing shot).
- At most 6 components in total. Component ids: invent short lowercase slugs (e.g. "hp", "bts", "server") and reuse them EXACTLY in later "connect"/"focus" ops. Components must be one of: ${compList}. When nothing fits, use "kotak" with a short "label".
- "headline": at most 7 words, punchy, in ${langName}; it must NOT simply repeat the narration. "accent": the 1-2 word phrase inside the headline that carries the punch (it is shown in the accent colour).
- "badge": a status pill of at most 3 words, uppercase style, in ${langName} (e.g. "HP AMAN", "MENYALIN", "TANPA IZIN"). "badgeColor": "green" (safe/ok), "orange" (active/process), "red" (danger/copying/alert), "blue" (info), "grey" (neutral).
- "ops": the diagram instructions for this scene, in order. Shapes:
  {"op":"add","comp":"hp","id":"hp","label":"HP target"} — label optional, at most 3 words, in ${langName}.
  {"op":"connect","from":"hp","to":"bts","color":"blue"} — color: "blue" normal flow, "gold" copied data, "red" danger, "green" safe, "grey" neutral.
  {"op":"focus","target":"bts"} — a component id, or "all". Optional; default is the newest component.
- "trackerLabel": scene 1 ONLY — the subject being tracked through the video, at most 4 words (e.g. a phone number "08xx-xxxx-2211" or "Nomor target"). It stays on screen with a checklist. Later scenes: omit it.
- "steps": checklist updates for that tracker, an array of {"label":"IZIN","state":"ask"}. Plan 2-4 steps for the WHOLE video, named after the stages of the process (1 short uppercase word each, e.g. IZIN, TARGET, SALIN, KIRIM). A scene may introduce a step (usually state "ask" = being decided, or "todo") and/or update an earlier step's state: "ok" (approved/done), "bad" (denied/failed), "ask" (pending), "todo" (not yet). Most scenes update at most 1 step; scenes without tracker news use [].
- "card": an optional black terminal-style data card for the ONE or TWO scenes where concrete example data makes the step tangible: {"title":"SALINAN","lines":["dari: 08xx-2211","ke: server pusat","jam: 21.03","isi: metadata"]}. At most 4 lines, each at most 24 characters, plausible example values in ${langName}. Use null for scenes without a card.
- Narration is spoken audio only, plain conversational sentences in ${langName}; do not start a scene by reading its headline aloud.

Output JSON exactly: {"scenes":[{"title":"...","narration":"...","headline":"...","accent":"...","badge":"...","badgeColor":"grey","trackerLabel":"...","steps":[],"card":null,"ops":[]}]}`;

  const raw = await chat(model, system, user);
  const parsed = parseJSON(raw);
  if (!parsed.scenes || !Array.isArray(parsed.scenes) || parsed.scenes.length === 0) {
    throw new Error("Model tidak mengembalikan daftar scene yang valid.");
  }
  const badgeColors = ["green", "orange", "red", "blue", "grey"];
  const cableColors = ["blue", "red", "gold", "green", "grey"];
  const slug = (v) => String(v || "").toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 24);
  return parsed.scenes.slice(0, 20).map((s) => {
    const ops = [];
    for (const op of Array.isArray(s.ops) ? s.ops : []) {
      if (!op || typeof op !== "object") continue;
      if (op.op === "add" && slug(op.id)) {
        ops.push({
          op: "add",
          comp: DG_COMPONENTS.includes(op.comp) ? op.comp : "kotak",
          id: slug(op.id),
          label: String(op.label || "").slice(0, 26),
        });
      } else if (op.op === "connect" && slug(op.from) && slug(op.to)) {
        ops.push({ op: "connect", from: slug(op.from), to: slug(op.to), color: cableColors.includes(op.color) ? op.color : "blue" });
      } else if (op.op === "focus") {
        ops.push({ op: "focus", target: slug(op.target) || "all" });
      }
    }
    const stepStates = ["todo", "ask", "ok", "bad"];
    const steps = [];
    for (const st of Array.isArray(s.steps) ? s.steps.slice(0, 3) : []) {
      if (!st || typeof st !== "object" || !st.label) continue;
      steps.push({
        label: String(st.label).slice(0, 10),
        state: stepStates.includes(st.state) ? st.state : "todo",
      });
    }
    let card = null;
    if (s.card && Array.isArray(s.card.lines)) {
      const lines = s.card.lines.map((l) => String(l).slice(0, 30)).filter(Boolean).slice(0, 4);
      if (lines.length) card = { title: String(s.card.title || "DATA").slice(0, 16), lines };
    }
    const headline = String(s.headline || s.title || "");
    return {
      title: String(s.title || ""),
      narration: String(s.narration || ""),
      imagePrompt: "",
      overlay: headline,
      dg: {
        headline,
        accent: String(s.accent || ""),
        badge: String(s.badge || ""),
        badgeColor: badgeColors.includes(s.badgeColor) ? s.badgeColor : "grey",
        trackerLabel: String(s.trackerLabel || "").slice(0, 30),
        steps,
        card,
        ops,
      },
    };
  });
}

async function generateStickmanB2Script(project, model, ctx) {
  const { langName, perScene } = ctx;
  const system = `You are a director for colorful hand-drawn explainer videos (style "B2 colorful hand-drawn": warm cream paper, thin irregular ink outlines, muted varied colors, simple round-headed stick figures in real everyday environments, one full-scene illustration per scene). You output ONLY valid JSON, no markdown fences, no commentary.`;
  const user = `Direct a ${project.sceneCount}-scene colorful hand-drawn video.

Theme/idea: ${project.theme}
Target total duration: ${project.targetDuration} seconds.
Narration language: ${langName}. On-screen heading language: ${langName}.
Budget: about ${perScene} narration words per scene.

Direction rules (from the B2 directing system):
- Structure the story as a 5-stage arc across the scenes: (1) Golden Hook — a counter-intuitive question or paradox in scene 1; (2) Disrupting Assumptions; (3) Unveiling Insider Secrets — the hidden mechanics; (4) Ultimate Truth — the underlying logic, maximum payoff; (5) Elevation — a memorable punchline plus a discussion question in the final scene's narration.
- Every scene is ONE full-frame hand-drawn illustration of a SPECIFIC everyday moment: a concrete location, staging and viewpoint chosen from the narration beat (kitchen, desk, bus, shop, park, close-up of objects). Vary the location and viewpoint between scenes; do NOT repeat the same room with a standing presenter. Person-free object or diagram shots are welcome when they explain better.
- Every scene gets a short handwritten heading: 2 lines maximum, each at most 5 words, punchy, in ${langName}, written in sentence case (only the first letter capitalized, like a hand-written note — never ALL CAPS). Line 2 may carry the twist and may be empty. The heading must NOT simply repeat the narration.
- Keep every scene bright and warm on cream paper with soft daylight tones, even for evening topics (a lamp-lit cozy corner, never a dark blue night scene). In every artPrompt, describe the main character explicitly as "a simple round-headed stick figure with dot eyes and a short line mouth".
- Narration is spoken audio only.

Per scene output:
- "title": short label.
- "narration": spoken text in ${langName}, plain sentences.
- "heading1": first on-screen heading line (max 5 words).
- "heading2": second heading line (max 5 words, may be "").
- "artPrompt": a detailed ENGLISH description of the scene's full-frame illustration: the location and layout, where the stick figure stands/sits and what it is doing, the key props, the viewpoint (wide shot, over-the-shoulder, close-up), and the mood. Describe a scene with generous empty warm-paper space in the UPPER part of the frame (the heading is drawn there). Never ask for text, words or letters in the image.
- "sfx": one of "pop", "tap", "paper", "chime", "none" — a small accent sound at the scene start, or "none".

Output JSON exactly: {"scenes":[{"title":"...","narration":"...","heading1":"...","heading2":"...","artPrompt":"...","sfx":"pop"}]}`;

  const raw = await chat(model, system, user);
  const parsed = parseJSON(raw);
  if (!parsed.scenes || !Array.isArray(parsed.scenes) || parsed.scenes.length === 0) {
    throw new Error("Model tidak mengembalikan daftar scene yang valid.");
  }
  return parsed.scenes.slice(0, 20).map((s) => {
    const h1 = String(s.heading1 || s.title || "");
    const h2 = String(s.heading2 || "");
    const sfx = ["pop", "tap", "paper", "chime"].includes(s.sfx) ? s.sfx : null;
    return {
      title: String(s.title || ""),
      narration: String(s.narration || ""),
      imagePrompt: String(s.artPrompt || ""),
      overlay: h1,
      stick: { lines: [h1, h2], sfx },
    };
  });
}

async function generateStickmanB3Script(project, model, ctx) {
  const { langName, perScene } = ctx;
  const system = `You are a director for retro-television explainer videos (style "B3 retro TV": near-black dark field, refined flat white and light-gray silhouettes, blank round heads, generous negative space, compact uppercase typography, one full-frame silhouette illustration per scene, restrained analog broadcast finish). You output ONLY valid JSON, no markdown fences, no commentary.`;
  const user = `Direct a ${project.sceneCount}-scene retro TV silhouette video.

Theme/idea: ${project.theme}
Target total duration: ${project.targetDuration} seconds.
Narration language: ${langName}. On-screen heading language: ${langName}.
Budget: about ${perScene} narration words per scene.

Direction rules (from the B3 directing system):
- Structure the story as a 5-stage arc across the scenes: (1) Golden Hook — a counter-intuitive question or paradox in scene 1; (2) Disrupting Assumptions; (3) Unveiling Insider Secrets — the hidden mechanics; (4) Ultimate Truth — the underlying logic, maximum payoff; (5) Elevation — a memorable punchline plus a discussion question in the final scene's narration.
- Every scene is ONE full-frame illustration on a near-black field: flat white and light-gray silhouettes only (at most one small muted red accent), a concrete staging chosen from the narration beat (a figure at a desk, a diagram with connectors, an object close-up, a surveillance-style framed view). Vary composition and focal scale between scenes; do NOT repeat the same standing presenter. Keep the upper part of the frame mostly empty dark space (the heading is drawn there).
- Human figures: blank circular heads with NO facial features, rounded joints, simple gray/white bodies. Animals keep simple readable silhouettes.
- Every scene gets a SPARSE heading: 2 lines maximum, each at most 4 words, punchy, in ${langName}. Write them in normal case; they are displayed uppercase. Line 2 may be empty. The heading must NOT simply repeat the narration.
- Narration is spoken audio only.

Per scene output:
- "title": short label.
- "narration": spoken text in ${langName}, plain sentences.
- "heading1": first on-screen heading line (max 4 words).
- "heading2": second heading line (max 4 words, may be "").
- "artPrompt": a detailed ENGLISH description of the scene's full-frame silhouette illustration: the staging and layout, the figures/objects as flat white or light-gray silhouettes on a near-black background, the viewpoint (wide shot, close-up, framed insert), and the focal action. Never ask for text, words or letters in the image, and never ask for colors other than white, grays, black and one muted red accent.
- "sfx": one of "pop", "tap", "paper", "chime", "none" — a small accent sound at the scene start, or "none".

Output JSON exactly: {"scenes":[{"title":"...","narration":"...","heading1":"...","heading2":"...","artPrompt":"...","sfx":"pop"}]}`;

  const raw = await chat(model, system, user);
  const parsed = parseJSON(raw);
  if (!parsed.scenes || !Array.isArray(parsed.scenes) || parsed.scenes.length === 0) {
    throw new Error("Model tidak mengembalikan daftar scene yang valid.");
  }
  return parsed.scenes.slice(0, 20).map((s) => {
    const h1 = String(s.heading1 || s.title || "").toUpperCase();
    const h2 = String(s.heading2 || "").toUpperCase();
    const sfx = ["pop", "tap", "paper", "chime"].includes(s.sfx) ? s.sfx : null;
    return {
      title: String(s.title || ""),
      narration: String(s.narration || ""),
      imagePrompt: String(s.artPrompt || ""),
      overlay: h1,
      stick: { lines: [h1, h2], sfx },
    };
  });
}

async function generateStickmanScript(project, model, ctx) {
  const { en, langName, perScene } = ctx;
  if (project.stickStyle === "B2") return generateStickmanB2Script(project, model, ctx);
  if (project.stickStyle === "B3") return generateStickmanB3Script(project, model, ctx);
  const system = `You are a director for hand-drawn stickman explainer videos (style "B1 minimal hand-drawn": near-white paper, black stick figure, crayon props, large handwritten on-screen text). You output ONLY valid JSON, no markdown fences, no commentary.`;
  const user = `Direct a ${project.sceneCount}-scene stickman video.

Theme/idea: ${project.theme}
Target total duration: ${project.targetDuration} seconds.
Narration language: ${langName}. On-screen heading language: ${langName}.
Budget: about ${perScene} narration words per scene.

Direction rules (from the stickman directing system):
- Structure the story as a 5-stage arc across the scenes: (1) Golden Hook — a counter-intuitive question or paradox in scene 1; (2) Disrupting Assumptions — what everyone believes, shattered; (3) Unveiling Insider Secrets — the hidden mechanics; (4) Ultimate Truth — the underlying logic, maximum payoff; (5) Elevation — a memorable punchline plus a discussion question in the final scene's narration.
- Every scene gets a big on-screen heading: 2 short lines maximum, each at most 5 words, punchy, in ${langName}. Line 2 may carry the twist or a key number and may be empty.
- The stick figure must always be doing something meaningful that matches the narration beat; never idle decoration.
- Narration is spoken audio only; the heading must NOT simply repeat the narration.

Per scene output:
- "title": short label.
- "narration": spoken text in ${langName}, plain sentences.
- "heading1": first on-screen heading line (max 5 words).
- "heading2": second heading line (max 5 words, may be "").
- "poseMood": one of "think" (leaning in, puzzled/thinking), "present" (standing, explaining/pointing), "act" (dynamic action/celebration).
- "props": up to 2 ids from this bundled crayon prop set: ${STICK_PROP_IDS.join(", ")}. Use [] when no prop fits.
- "customProp": if NO bundled prop fits a key object in the scene, ONE short English image prompt for that single object (e.g. "a piggy bank"), else "".
- "sfx": one of "pop", "tap", "paper", "chime", "none" — a small accent sound at the scene start, chosen by the action, or "none".

Output JSON exactly: {"scenes":[{"title":"...","narration":"...","heading1":"...","heading2":"...","poseMood":"present","props":["bulb"],"customProp":"","sfx":"pop"}]}`;

  const raw = await chat(model, system, user);
  const parsed = parseJSON(raw);
  if (!parsed.scenes || !Array.isArray(parsed.scenes) || parsed.scenes.length === 0) {
    throw new Error("Model tidak mengembalikan daftar scene yang valid.");
  }
  const poseMap = { think: 0, present: 1, act: 2 };
  return parsed.scenes.slice(0, 20).map((s, i) => {
    const h1 = String(s.heading1 || s.title || "");
    const h2 = String(s.heading2 || "");
    const props = Array.isArray(s.props) ? s.props.filter((p) => STICK_PROP_IDS.includes(p)).slice(0, 2) : [];
    const sfx = ["pop", "tap", "paper", "chime"].includes(s.sfx) ? s.sfx : null;
    return {
      title: String(s.title || ""),
      narration: String(s.narration || ""),
      imagePrompt: "",
      overlay: h1,
      stick: {
        lines: [h1, h2],
        pose: poseMap[s.poseMood] !== undefined ? poseMap[s.poseMood] : i % 3,
        props,
        customPrompt: String(s.customProp || ""),
        customFile: null,
        sfx,
      },
    };
  });
}

async function generateEditorialScript(project, model, ctx) {
  const { langName, perScene } = ctx;
  const n = project.sceneCount;
  const system = `You are a director for editorial motion-graphics shorts: warm cream paper, ONE hero object image per scene, a huge condensed uppercase headline, one italic serif accent word, a small label pill, fast hard cuts and NO captions — the typography is the hook, the narration carries all the information. You output ONLY valid JSON, no markdown fences, no commentary.`;
  const user = `Direct a ${n}-scene Editorial video.

Theme/idea: ${project.theme}
Target total duration: ${project.targetDuration} seconds.
Narration language: ${langName}. On-screen text language: ${langName}.
Budget: about ${perScene} narration words per scene.

Format rules (modelled on a proven AI motion-graphics showreel format):
- ONE idea per scene, one hero object per scene. The video advances by hard cuts every few seconds; each scene is a single striking object (a retro television, a magnifying glass, a camera lens, a chess knight, an hourglass, a cracked disc) that METAPHORISES the narration beat. Choose concrete, sculptural, photographable objects — never abstract scenes with people talking.
- Narration is spoken audio only, plain conversational sentences in ${langName}; it carries ALL the facts. It must NOT read the headline aloud.
- "headline": 1-3 words, UPPERCASE, punchy, in ${langName} (e.g. "COPYING WORKS", "MESIN WAKTU", "TANPA SISA"). It is a typographic hook, not a summary of the narration.
- "accentWord": ONE word in ${langName}, a contrast or emotion word that plays against the headline (e.g. headline "COPYING WORKS" with accent "secret", or "MESIN WAKTU" with "hilang"). Lowercase is fine; it is shown in italic serif.
- "label": an optional short category tag in caps, at most 3 words (e.g. "SEJARAH", "BAGIAN 2", "FAKTA ANEH"). Use it on scene 1 and sparingly after; "" when none.
- Structure: scene 1 is the hook (the strangest object + the boldest headline), middle scenes each land one point with a new object, the final scene is the finale: the most iconic object and a closing headline that invites a reaction or question.
- "imagePrompt": ALWAYS in English, a detailed image-generation prompt for the ONE hero object of the scene: name the object, its material and era (brass, cracked dark metal, warm stone, retro plastic), the viewpoint (straight-on, slight angle, close-up), and the mood. The object sits alone and centered; never ask for text, words, letters or people in the image (hands are allowed only as collage elements pointing at the object).

Output JSON exactly: {"scenes":[{"title":"...","narration":"...","headline":"...","accentWord":"...","label":"...","imagePrompt":"..."}]}`;

  const raw = await chat(model, system, user);
  const parsed = parseJSON(raw);
  if (!parsed.scenes || !Array.isArray(parsed.scenes) || parsed.scenes.length === 0) {
    throw new Error("Model tidak mengembalikan daftar scene yang valid.");
  }
  return parsed.scenes.slice(0, 20).map((s) => {
    const headline = String(s.headline || s.title || "");
    return {
      title: String(s.title || ""),
      narration: String(s.narration || ""),
      imagePrompt: String(s.imagePrompt || ""),
      overlay: headline,
      ed: {
        headline,
        accentWord: String(s.accentWord || ""),
        label: String(s.label || ""),
      },
    };
  });
}

export async function generateScript(project, model) {
  const en = project.audience === "en";
  const langName = en ? "English" : "Bahasa Indonesia";
  const wps = en ? 2.4 : 2.2; // words per second of narration
  const totalWords = Math.round(project.targetDuration * wps);
  const perScene = Math.max(12, Math.round(totalWords / project.sceneCount));

  if (project.engine === "stickman") {
    return generateStickmanScript(project, model, { en, langName, perScene });
  }
  if (project.engine === "darkcard") {
    return generateDarkcardScript(project, model, { en, langName, perScene });
  }
  if (project.engine === "diagram") {
    return generateDiagramScript(project, model, { en, langName, perScene });
  }
  if (project.engine === "editorial") {
    return generateEditorialScript(project, model, { en, langName, perScene });
  }

  const andai = project.scriptTemplate === "andai";
  const templateBlock = andai
    ? `
WHAT-IF STORY TEMPLATE (script template "Andai-Andai") — follow this structure strictly:
- Scene 1 poses the counterfactual out loud: "Gimana kalau ..." / "What if ..." — the one change to history or reality this video explores.
- Each following scene advances the timeline ONE step (the first days, then the first year, then a decade later...): one vivid concrete tableau per scene, strict cause -> effect, each step plausible given the change. Prefer everyday-life consequences (prices, streets, schools, jobs) over grand abstractions.
- Keep the tone warm and curious, not dystopian; even downsides are shown concretely and calmly.
- The final scene lands the reflective takeaway: what this alternate path teaches about the real one.
`
    : "";
  const system = `You are a scriptwriter for short vertical motion-graphics explainer videos (1080x1920). You output ONLY valid JSON, no markdown fences, no commentary.`;
  const user = `Write a ${project.sceneCount}-scene narration script.

Theme/idea: ${project.theme}
Target total duration: ${project.targetDuration} seconds.
Narration language: ${langName}. Overlay text language: ${langName}.
Budget: about ${perScene} narration words per scene (total ~${totalWords} words).
Visual style notes: ${visualStyleOf(project.visualStyle).direction || project.style || "cinematic, dark background, one strong accent color, clean composition, generous empty space at top and bottom for text overlays"}${visualStyleOf(project.visualStyle).direction && project.style ? ` Additional notes: ${project.style}` : ""}
${templateBlock}
Rules:
- Scene 1 is a hook: a striking opening line and overlay.
- Each scene: "title" (short label), "narration" (spoken text in ${langName}, plain sentences, numbers written as spoken words where natural), "imagePrompt" (ALWAYS in English, a detailed image-generation prompt for a vertical 9:16 background still, no text in the image), "overlay" (short punchy on-screen headline in ${langName}, max 8 words, may include a key number).
- Keep a clear narrative arc: hook, context, data/points, implication, closing.
- Also write "poll": a closing poll for the end card — "question" (at most 8 words in ${langName}, the one debate this video leaves open, e.g. "MANA YANG PALING FATAL?") and "options": exactly 3 short answers (at most 3 words each, punchy, in ${langName}).

Output JSON exactly: {"scenes":[{"title":"...","narration":"...","imagePrompt":"...","overlay":"..."}],"poll":{"question":"...","options":["...","...","..."]}}`;

  const raw = await chat(model, system, user);
  const parsed = parseJSON(raw);
  if (!parsed.scenes || !Array.isArray(parsed.scenes) || parsed.scenes.length === 0) {
    throw new Error("Model tidak mengembalikan daftar scene yang valid.");
  }
  const scenes = parsed.scenes.slice(0, 20).map((s) => ({
    title: String(s.title || ""),
    narration: String(s.narration || ""),
    imagePrompt: String(s.imagePrompt || ""),
    overlay: String(s.overlay || ""),
  }));
  // Closing-poll suggestion (Fase C): applied to the project when the poll
  // is still empty, or always for the Andai-Andai template (its poll is
  // part of the format). The render only adds the poll card when the
  // project poll has a question and >= 2 options.
  const asPoll = (raw) => {
    if (!raw || typeof raw !== "object" || !String(raw.question || "").trim()) return null;
    const options = (Array.isArray(raw.options) ? raw.options : [])
      .map((o) => String(o || "").slice(0, 24)).filter(Boolean).slice(0, 3);
    if (options.length < 2) return null;
    return { question: String(raw.question || "").slice(0, 90), options };
  };
  const curEmpty = !project.poll || !String(project.poll.question || "").trim();
  const pollWanted = curEmpty || project.scriptTemplate === "andai";
  let suggestion = asPoll(parsed.poll);
  if (!suggestion && pollWanted) {
    // Fallback: small script models sometimes drop the "poll" field from
    // the big script JSON (seen live with gemini-3.5-flash-lite on the
    // first Andai test). Ask once more, for the poll only — a much smaller
    // task. A failed fallback never fails the script; the poll simply
    // stays empty and editable by hand in the wizard.
    try {
      const rawPoll = await chat(
        model,
        `You write closing polls for short vertical videos. You output ONLY valid JSON, no markdown fences, no commentary.`,
        `Theme: ${project.theme}
Video beats: ${scenes.map((s) => s.title).filter(Boolean).join(" -> ") || "(untitled scenes)"}
Write ONE closing poll in ${langName}: "question" (at most 8 words, the one debate this video leaves open) and "options": exactly 3 short answers (at most 3 words each, punchy).
Output JSON exactly: {"question":"...","options":["...","...","..."]}`
      );
      suggestion = asPoll(parseJSON(rawPoll));
    } catch { /* poll stays empty on purpose */ }
  }
  if (suggestion && pollWanted) project.poll = suggestion;
  return scenes;
}

const SDXL_SIZES = { "9:16": "1024x1792", "1:1": "1024x1024", "16:9": "1792x1024" };
const POLL_SIZES = { "9:16": [1080, 1920], "1:1": [1080, 1080], "16:9": [1920, 1080] };

export async function generateImageVia9Router(prompt, destFile, aspect) {
  const fs = await import("fs");
  const model = process.env.IMAGE_MODEL_9ROUTER || "cf/@cf/stabilityai/stable-diffusion-xl-base-1.0";
  const { ninerouterBase: BASE, ninerouterKey: KEY } = aiConfig();
  // The Cloudflare SDXL leg behind 9Router is intermittently flaky (observed
  // 5 Nov: identical calls failing once, succeeding on retry). Retry up to 3
  // attempts with backoff so one bad upstream response does not kill a stage.
  let lastErr = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(`${BASE}/images/generations`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(KEY ? { Authorization: `Bearer ${KEY}` } : {}),
        },
        body: JSON.stringify({ model, prompt, size: SDXL_SIZES[aspect] || SDXL_SIZES["9:16"] }),
        signal: AbortSignal.timeout(150000),
      });
      const data = await res.json().catch(() => ({}));
      const b64 = data?.data?.[0]?.b64_json || "";
      if (!res.ok || !b64) {
        const msg = data?.error?.message || `HTTP ${res.status}`;
        throw new Error(`Gambar via 9Router (${model}) gagal: ${String(msg).slice(0, 220)}`);
      }
      const buf = Buffer.from(b64, "base64");
      if (buf.length < 10000) throw new Error("Hasil gambar via 9Router terlalu kecil, dianggap gagal.");
      fs.writeFileSync(destFile, buf);
      return { bytes: buf.length };
    } catch (e) {
      lastErr = e;
      if (attempt < 3) await new Promise((r) => setTimeout(r, attempt * 5000));
    }
  }
  throw lastErr;
}

// Image generation by Muse itself, relayed through muse-bridge on stbjkt2
// (added 6 Nov 2026): the bridge queues the request, a Muse agent cycle
// generates the image and returns it as b64_json in OpenAI shape. Slow by API
// standards (agent wake + generation, minutes per image), so a single attempt
// with a long timeout; the pipeline can simply be re-run for missing scenes.
export async function generateImageViaBridge(prompt, destFile, aspect) {
  const fs = await import("fs");
  const http = await import("http");
  const { bridgeBase: base, bridgeKey: key } = aiConfig();
  if (!key) {
    throw new Error(
      "Kunci muse-bridge belum dipasang di server (MUSE_BRIDGE_KEY kosong). " +
      "Pasang dulu, atau pakai penyedia gambar lain."
    );
  }
  // node:http, NOT fetch: undici's default headersTimeout (300s) aborts the
  // request while the bridge is still waiting for the agent's answer
  // (observed 6 Nov: "fetch failed" after ~5 min despite AbortSignal 930s).
  const payload = JSON.stringify({ model: "muse-image", prompt, size: SDXL_SIZES[aspect] || SDXL_SIZES["9:16"] });
  const data = await new Promise((resolve, reject) => {
    const u = new URL(`${base}/images/generations`);
    const req = http.request(
      { hostname: u.hostname, port: u.port, path: u.pathname, method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}`,
                   "Content-Length": Buffer.byteLength(payload) },
        timeout: 930000 },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const parsed = (() => { try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { return {}; } })();
          parsed.__status = res.statusCode;
          resolve(parsed);
        });
      }
    );
    req.on("timeout", () => req.destroy(new Error("Bridge tidak menjawab dalam 930 detik.")));
    req.on("error", reject);
    req.write(payload);
    req.end();
  });
  const b64 = data?.data?.[0]?.b64_json || "";
  if (data.__status !== 200 || !b64) {
    const msg = data?.error?.message || `HTTP ${data.__status}`;
    throw new Error(`Gambar via Muse (bridge) gagal: ${String(msg).slice(0, 220)}`);
  }
  const buf = Buffer.from(b64, "base64");
  if (buf.length < 10000) throw new Error("Hasil gambar via Muse (bridge) terlalu kecil, dianggap gagal.");
  fs.writeFileSync(destFile, buf);
  return { bytes: buf.length };
}

export async function generateImageWorkersAI(prompt, destFile) {
  const fs = await import("fs");
  const { cfToken: token, cfAccountId: account } = aiConfig();
  const model = process.env.CF_AI_MODEL || "@cf/black-forest-labs/flux-1-schnell";
  if (!token) {
    throw new Error(
      "Token Cloudflare Workers AI belum dipasang di server (CF_AI_TOKEN kosong). " +
      "Pasang token dulu, atau pakai Pollinations / unggah manual."
    );
  }
  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${account}/ai/run/${model}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ prompt }),
      signal: AbortSignal.timeout(180000),
    }
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.result?.image) {
    const msg = data?.errors?.[0]?.message || `HTTP ${res.status}`;
    throw new Error(`Cloudflare Workers AI gagal: ${msg}`);
  }
  const buf = Buffer.from(data.result.image, "base64");
  if (buf.length < 10000) throw new Error("Hasil gambar Workers AI terlalu kecil, dianggap gagal.");
  fs.writeFileSync(destFile, buf);
  return { bytes: buf.length };
}

export async function generateImage(prompt, destFile, seed, onRetry, aspect) {
  const fs = await import("fs");
  const [iw, ih] = POLL_SIZES[aspect] || POLL_SIZES["9:16"];
  const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=${iw}&height=${ih}&seed=${seed}&nologo=true&model=flux`;
  // Free anonymous tier allows roughly one image per time window; 402/429 means
  // "wait", so retry with growing backoff instead of failing the whole job.
  const waits = [0, 30000, 60000, 120000];
  let lastErr;
  for (let attempt = 0; attempt < waits.length; attempt++) {
    if (waits[attempt] > 0) {
      onRetry?.(Math.round(waits[attempt] / 1000), attempt + 1);
      await new Promise((r) => setTimeout(r, waits[attempt]));
    }
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": "videogen/1.0" },
        signal: AbortSignal.timeout(180000),
      });
      if (res.status === 402 || res.status === 429) {
        lastErr = new Error(`Pollinations HTTP ${res.status}`);
        continue;
      }
      if (!res.ok) throw new Error(`Pollinations HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length < 10000) throw new Error("Hasil gambar terlalu kecil, dianggap gagal.");
      fs.writeFileSync(destFile, buf);
      return { bytes: buf.length };
    } catch (e) {
      if (e.message?.startsWith("Pollinations HTTP 402") || e.message?.startsWith("Pollinations HTTP 429")) {
        lastErr = e;
        continue;
      }
      lastErr = e;
    }
  }
  throw new Error(
    `${lastErr?.message || "Generate gambar gagal"} — batas tier gratis Pollinations tercapai meski sudah dicoba ulang. Tunggu beberapa menit lalu jalankan lagi, atau unggah gambar manual.`
  );
}
