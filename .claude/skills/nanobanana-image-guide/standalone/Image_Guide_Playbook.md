# Nano Banana Image Guide (universal)

Use this playbook with any AI assistant to create and edit images using Nano Banana (Gemini Create Image) or similar image-generation tools. Step-by-step questions structure prompts for maximum effectiveness.

**Always apply this skill** when the user wants to create an image, generate a picture, edit a photo, or use image generation. Ask questions one step at a time; do not skip to generation before context is gathered.

---

## When to use

- User says: create image, generate picture, draw, нарисовать, сгенерировать картинку
- User mentions Nano Banana, Gemini image, image generation
- User wants to edit an existing image
- User needs product mockup, poster, marketing visual, storyboard
- Any request involving image generation or editing

---

## Step 1: Determine task type

Ask the user what they need:

1. **Generate from scratch** — new image from text (no reference images)
2. **Generate with references** — combine reference images (sketches, textures, products) into a new scene
3. **Edit existing image** — change or remove parts, style transfer, add elements
4. **Image with real-time data** — weather, dates, live info visualized (e.g. city-in-a-cup with current weather)
5. **Text rendering** — poster, product shot, mockup with specific text/fonts/multilingual copy
6. **Creative direction** — fine control over lighting, camera, color grading, materials

User picks one. If unclear, assume (1) and adjust later.

---

## Step 2: Ask questions by task type

For each type, ask only the relevant questions. One question per turn unless the user prefers bulk.

### Type 1: Generate from scratch (text-to-image)

**Formula:** [Subject] + [Action] + [Location/context] + [Composition] + [Style]

Ask in order:

1. **Subject** — What or who is in the image? (e.g. "fashion model in brown dress", "minimalist ceramic mug")
2. **Action / pose** — What is the subject doing? (e.g. "posing confidently", "resting on table")
3. **Location / context** — Where? Background? (e.g. "seamless deep cherry studio backdrop", "sun-drenched living room")
4. **Composition** — Shot type, framing (e.g. "medium-full shot, center-framed", "close-up, shallow depth of field")
5. **Style** — Mood, film stock, lighting (e.g. "fashion editorial, medium-format analog film, pronounced grain, high saturation")

### Type 2: Generate with references

**Formula:** [Reference images] + [Relationship instruction] + [New scenario]

Ask:

1. **References** — What reference images will they provide? (sketch, fabric sample, product photo, character design)
2. **Relationship** — How should they be combined? (e.g. "use sketch as structure, fabric as texture")
3. **New scenario** — Where or how should the result appear? (e.g. "sun-drenched minimalist living room")

### Type 3: Edit existing image

- **Conversational edit (semantic masking):** Ask: "What should be removed or changed? What must stay exactly the same?"
- **Add elements:** Ask: "What new object or element? Do you have a reference image?"
- **Style transfer:** Ask: "What artistic style? (e.g. Van Gogh, watercolor, film noir)"

### Type 4: Real-time data visualization

**Formula:** [Source/Search request] + [Analytical task] + [Visual translation]

Ask:

1. **Source** — What data? (e.g. "current weather and date in San Francisco")
2. **Analytical task** — How should the data affect the scene? (e.g. "if raining, make it grey and rainy")
3. **Visual concept** — How to show it? (e.g. "miniature city-in-a-cup inside a smartphone UI")

### Type 5: Text rendering & localization

Ask:

1. **Exact text** — What words, in quotes? (e.g. "GLOW", "10% OFF")
2. **Font/style per line** — (e.g. "Brush Script for top line, Impact for middle")
3. **Languages** — Need translation? (e.g. "translate into Korean and Arabic")
4. **Context** — Product shot, poster, mockup? Describe the rest of the image.

**Text-first hack:** If text is complex, first generate text concepts in conversation, then ask for the image with that text.

### Type 6: Creative direction

Ask one category at a time:

1. **Lighting** — Studio (three-point softbox), dramatic (chiaroscuro), golden hour, backlighting?
2. **Camera / lens** — GoPro, Fujifilm, disposable, low-angle, shallow DOF (f/1.8), wide-angle, macro?
3. **Color / film stock** — "1980s color film, slightly grainy", "cinematic color grading with muted teal"?
4. **Materiality** — Specific materials? (e.g. "navy blue tweed", "ornate elven plate armor with silver leaf")

---

## Step 3: Apply best practices

Before building the prompt:

- **Specific** — Concrete details on subject, lighting, composition
- **Positive framing** — Describe what you want, not what you don't (e.g. "empty street" not "no cars")
- **Strong verb first** — Start the prompt with the primary operation (Generate, Transform, Remove, Render...)
- **Camera terms** — Use "low angle", "aerial view", "medium shot" when relevant

---

## Step 4: Build the prompt

Assemble answers into a single narrative prompt. Do not use bullet lists in the prompt; write flowing prose. Start with a strong verb.

**Example (Type 1):**

> A striking fashion model wearing a tailored brown dress, sleek boots, and holding a structured handbag. Posing with a confident, statuesque stance, slightly turned. A seamless, deep cherry red studio backdrop. Medium-full shot, center-framed. Fashion magazine style editorial, shot on medium-format analog film, pronounced grain, high saturation, cinematic lighting effect.

---

## Step 5: Generate or output prompt

- If the platform has image generation (Nano Banana MCP, Google AI Studio, Gemini Create Image): call the tool with the built prompt.
- Suggest aspect ratio: 1:1, 16:9, 9:16, 4:3, 3:4.
- If no generation tool: output the final prompt so the user can paste it into Google AI Studio (Nano Banana / Gemini Create Image).

---

## Tech specs (reference)

- **Aspect ratios:** 1:1, 3:2, 2:3, 3:4, 4:3, 4:5, 5:4, 9:16, 16:9, 21:9 (Nano Banana 2: also 1:4, 4:1, 1:8, 8:1)
- **Resolutions:** 0.5K, 1K, 2K, 4K
- **Reference images:** up to 14, supported: png, jpeg, webp, heic, heif

---

## Notes

- Ask **one question at a time** unless the user prefers multiple
- Do not generate until the user has answered the needed questions
- Iterate: user can refine with follow-up prompts
- Source: [The ultimate Nano Banana prompting guide](https://cloud.google.com/blog/products/ai-machine-learning/ultimate-prompting-guide-for-nano-banana) (Google Cloud)
