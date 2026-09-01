---
name: inspiration-concept-architecture
description: Turn inspiration images, abstract symbols, natural forms, cultural motifs, objects, textures, or emotional imagery into defensible concept architecture through explicit architectural translation. Use whenever the user wants to derive a building, facade, entrance, pavilion, exhibition, landscape structure, gate, stage, or spatial concept from an image or idea, asks for inspiration-to-architecture prompts, or needs several concept directions without literal shape copying. Do not use for faithful renovation visualization, construction documentation, or simple style transfer where the design is already fixed.
---

# Inspiration Concept Architecture

Convert inspiration into architectural rules, not a giant copy of the referenced object. Preserve the source's relationships, rhythms, behavior, material qualities, or atmosphere while giving every important formal move a spatial, functional, structural, or environmental reason.

## Gather The Minimum Brief

Identify these inputs from the request and attached images:

- design object and intended use;
- site, climate, culture, and users;
- approximate scale and key program;
- desired deliverable, such as concept directions, image prompts, massing logic, facade logic, or critique;
- fixed constraints and elements that must be avoided.

If a missing fact would materially change the concept, ask one focused question. Otherwise make a conservative assumption, label it, and continue.

## Separate Observation From Interpretation

Describe what is visibly present before assigning meaning. Do not claim cultural symbolism, material properties, structural behavior, or user intent that the source does not support.

Extract an inspiration dictionary across five dimensions:

1. **Geometry**: silhouette, curvature, branching, repetition, proportion, voids.
2. **Organization**: layering, clustering, weaving, radiation, gradient, hierarchy.
3. **Movement**: growth, flow, rotation, compression, suspension, direction.
4. **Material quality**: transparent, porous, rough, reflective, soft, massive.
5. **Atmosphere**: light, color, season, emotion, cultural association.

Choose one primary gene and at most two secondary genes. The primary gene should control massing, space, or structure. Secondary genes may control facade, material, light, or landscape. This hierarchy prevents feature accumulation.

## Translate Into Architectural Operators

Write explicit mappings in this form:

`observed feature -> architectural operator -> affected system -> intended experience`

Examples:

- layered petals -> overlapping canopies -> roof and public-space sequence -> gradual arrival;
- bamboo nodes -> vertically segmented modules -> tower massing and sky bridges -> rhythmic ascent;
- flowing water -> continuous directional curve -> circulation and drainage -> guided movement;
- woven fibers -> variable-density lattice -> structure and shading -> filtered light;
- valley enclosure -> paired solid masses -> section and shared atrium -> protected gathering.

Avoid mappings that merely rename the source, such as “lotus-inspired lotus building.” Do not let the same metaphor control every system unless the relationship is demonstrated.

## Produce Three Distinct Directions

Keep function and site constraints stable while varying the translation strategy:

1. **Formal abstraction**: retain silhouette, proportion, and rhythm while removing literal detail.
2. **Structural translation**: derive modules, spans, branching, weaving, or growth rules from the source.
3. **Atmospheric translation**: preserve light, texture, sequence, and emotional effect with low visual similarity.

For each direction, state the concept sentence, primary gene, three mapping rules, spatial organization, structural premise, material and light strategy, strongest advantage, and main risk.

Recommend one direction only after comparing them against the same criteria. Do not collapse the three directions into stylistic variations.

## Constrain The Concept As Architecture

Check that the result has:

- a legible entrance and arrival sequence;
- plausible human scale and program distribution;
- continuous public, private, service, and emergency circulation at the requested level of detail;
- a basic load path or support logic;
- a facade and roof that can be segmented, drained, shaded, and maintained;
- a credible relationship to site, climate, topography, and adjacent public space.

Concept work does not require construction-level proof, but it should not hide incoherent space behind sculptural imagery. Mark unresolved engineering claims as development risks.

## Write Generation Prompts

Read [references/prompt-templates.md](references/prompt-templates.md) when the user needs prompts for image generation or image-to-image work.

Build prompts in this order:

1. task, site, building type, scale, users, and program;
2. inspiration features and explicit non-literal instruction;
3. feature-to-architecture mappings;
4. massing, space, circulation, structure, facade, materials, and landscape;
5. camera, composition, time, weather, and aspect ratio;
6. negative constraints.

Prefer architectural nouns and verbs over mood adjective lists. “A porous terracotta screen that becomes denser toward the west” is more useful than “beautiful, poetic, futuristic facade.”

## Report Structure

Use this structure unless the user requests another format:

```markdown
# [Concept title]

## Brief And Assumptions
## Inspiration Dictionary
## Translation Rules
## Direction A: Formal Abstraction
## Direction B: Structural Translation
## Direction C: Atmospheric Translation
## Comparison And Recommendation
## Ready-To-Use Prompt
## Negative Prompt
## Development Risks
```

Keep observations, design decisions, and unresolved risks visibly separate. When the user asks for only a prompt, do the analysis internally and return a concise prompt plus negative constraints.

## Quality Gate

Before finishing, verify:

- the source is recognizable through rules or experience, not literal copying;
- every dominant formal move has an architectural reason;
- the directions differ by translation strategy;
- the prompt names the design object, program, site, viewpoint, and aspect ratio;
- the result avoids giant-object architecture, arbitrary curves, unreadable entrances, impossible scale, unsupported cantilevers, text, and watermarks;
- claims do not exceed the evidence available from the source image and brief.

