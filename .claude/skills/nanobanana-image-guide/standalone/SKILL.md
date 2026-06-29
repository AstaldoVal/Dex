---
name: nanobanana-image-guide
description: Step-by-step guiding for Nano Banana image generation and editing. Asks questions to gather context and structures prompts for maximum effectiveness. Always invoke when user wants to create or edit images.
---

# Nano Banana Image Guide

Guides image creation and editing with Nano Banana (Gemini Create Image) via step-by-step questions. Collects context in the right structure so prompts produce the best results.

**Always invoke this skill** when the user wants to create an image, generate a picture, edit a photo, or use Nano Banana. Ask questions one step at a time; do not skip to generation before context is gathered.

## When to Use

- User says: create image, generate picture, draw, нарисовать, сгенерировать картинку, картинка по промпту
- User mentions Nano Banana, Gemini image, image generation
- User wants to edit an existing image
- User needs product mockup, poster, marketing visual, storyboard
- Any request that involves image generation or editing

## Process

Follow the workflow in **Image_Guide_Playbook.md** (same folder). Key steps:

1. **Determine task type** — Generate from scratch, with references, edit, real-time data, text rendering, or creative direction
2. **Ask questions by type** — One question per turn, collect subject, action, context, composition, style
3. **Apply best practices** — Specific, positive framing, strong verb first, camera terms
4. **Build the prompt** — Flowing prose, no bullet lists
5. **Generate or output** — Call image generation tool if available, else output the final prompt

## Integration

- **Nano Banana + Gemini:** Use Gemini for prompt drafting and creative direction
- **Nano Banana + Veo:** Generate keyframes, then animate with Veo
- **Nano Banana + Veo + Lyria:** Add custom AI soundtrack to generated visuals

## Notes

- Ask **one question at a time** unless the user prefers multiple
- Do not generate until the user has answered the needed questions
- Source: [The ultimate Nano Banana prompting guide](https://cloud.google.com/blog/products/ai-machine-learning/ultimate-prompting-guide-for-nano-banana) (Google Cloud)
