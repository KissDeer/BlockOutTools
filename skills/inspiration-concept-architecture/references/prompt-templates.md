# Prompt Templates

Use the shortest template that preserves the design logic. Replace brackets with project-specific content and delete unused clauses.

## Full Concept Image Prompt

```text
Design task: Create a [building type and approximate scale] for [users and core program] on [site, climate, and context].

Inspiration: Use the uploaded image as a semantic and organizational reference, not as an object to copy. Extract its [primary geometry], [organizational rule], [movement], and [material or light quality]. Avoid making the building look like a giant version of the source object.

Architectural translation:
- translate [feature A] into [massing, section, or spatial sequence];
- translate [feature B] into [structural grid, module, roof, or circulation];
- translate [feature C] into [facade depth, openings, shading, material, light, or landscape].

Program and circulation: Include [key spaces]. Place the main entrance at [location] and organize a sequence from [public/exterior condition] to [private/interior condition]. Keep [public, service, or emergency circulation relationship] legible.

Construction logic: Use [structural premise] with [primary materials]. Show believable supports, spans, joints, facade depth, roof drainage, and buildable segmentation at an appropriate concept-design level.

Image direction: [camera/viewpoint], [composition], [time and weather], [aspect ratio]. Show the complete building, entrance, site relationship, and accurate human scale. Architectural concept visualization, coherent massing, clear spatial hierarchy, realistic materials, high detail.

Avoid: literal object copying, logo-like symbolism, giant sculpture, arbitrary free-form surfaces, floating unsupported masses, hidden entrance, confused scale, ornamental noise, excessive futurism, text, labels, and watermarks.
```

## Compact Image-To-Image Prompt

```text
Use the uploaded image only as an inspiration reference. Extract [primary geometry], [organizational rhythm], and [material/light behavior], then translate them respectively into [massing and space], [structure or facade system], and [atmosphere]. Design a [building type] for [program and users] at [site]. Keep the entrance legible, circulation plausible, human scale accurate, supports credible, and the envelope buildable in segments. [viewpoint], [time/weather], [aspect ratio], complete building and site visible. Avoid literal shape copying, giant-object architecture, arbitrary curves, unsupported cantilevers, text, and watermarks.
```

## Massing Study Prompt

```text
Architectural massing study for a [building type] on [site]. Derive three clearly different massing options from the uploaded inspiration: formal abstraction, structural translation, and atmospheric translation. Use simple white study models with one accent material, consistent site and program, orthographic axonometric view, clear entrances, courtyards, circulation cores, and human scale. Present three separate options with no text or labels. Do not copy the source object's literal outline.
```

## Facade Study Prompt

```text
Facade concept for [building type and orientation], derived from the inspiration's [pattern, density gradient, layering, or material behavior]. Translate it into a repeatable [panel, lattice, fin, opening, or shading] system with realistic module size, depth, joints, structure, drainage, and maintenance access. Show how density changes in response to [sun, view, privacy, or program]. [frontal perspective or detail axonometric], accurate scale, material realism. Avoid surface-applied patterns without environmental or construction logic.
```

## Negative Prompt

Use only constraints relevant to the chosen generator:

```text
literal object-shaped building, giant sculpture, logo architecture, arbitrary blob, random curves, functionless form, hidden entrance, impossible cantilever, missing supports, inconsistent floor heights, distorted doors and people, unusable stairs, confused circulation, flat decorative texture, excessive ornament, generic sci-fi city, oversaturated lighting, cropped building, fisheye distortion, text, caption, logo, watermark
```

## Prompt Review

Before returning a prompt, confirm that it states:

- what is being designed and for whom;
- which observed source features matter;
- how each feature changes an architectural system;
- the main functional and site constraints;
- a plausible structural and envelope premise;
- the view, scene, and aspect ratio;
- what literal or implausible outcomes to avoid.

