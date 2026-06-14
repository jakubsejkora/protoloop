# Protoloop

An agentic CAD / 3D-model studio for macOS (Apple Silicon). Describe a part in plain
language — Claude plans it, writes **parametric** CAD source, renders a live 3D model you can
rotate, **measure**, tune with **sliders**, and export. Built for engineers (CNC / CAD / hardware),
the way an agentic coding tool is built for software engineers.

## What it does

- **Four-column workspace** — Creations library · Chat · large 3D preview · Parametric sliders.
- **Chat → model** — Claude authors parametric CAD source + a parameter schema; the app renders it.
  On the first message it asks a few clarifying questions (planning), then builds.
- **Four open-source engines**, all LLM-friendly and agent-controllable:
  - **OpenSCAD** (installed binary) — fast, scripted solids.
  - **JSCAD** (`@jscad/modeling`) — pure JS, runs in-process, zero external deps.
  - **CADQuery** & **build123d** — Python B-rep on OpenCASCADE, export **STEP** for manufacturing.
- **Parametric sliders** re-render with **no LLM call** (the fast-path) — drag a dimension, the mesh
  updates sub-second.
- **Measure tool** — click two points on the surface, get the distance in mm.
- **Rotate around the object's center**, auto-frame, materialize animation, live build progress.
- **Concurrent chats** — every creation keeps generating in the background while you work on others.
- **Two model backends** — the installed **Claude Code CLI** (default; uses your Max login, no API
  key) or the **Anthropic API** (your key, stored in the macOS Keychain). Model picker: Opus 4.8 /
  Sonnet 4.6 / Haiku 4.5 with effort levels.

## Prerequisites

- macOS on Apple Silicon, **Node ≥ 20**.
- **Claude Code CLI** logged in (`claude` on PATH) — default backend, no API key needed.
- **OpenSCAD** — `brew install --cask openscad`.
- For CADQuery / build123d: a **Python 3.10–3.13** interpreter (e.g. `brew install python@3.12`).
  The app's *Settings → Install CADQuery + build123d* button builds an isolated venv for you.

  > ⚠️ **Python 3.14 note:** CADQuery 2.7.0 pins `cadquery-ocp < 7.9`, but the only OCP wheel built
  > for 3.14 is 7.9.3 — so the managed venv must use 3.10–3.13. The app auto-selects a compatible
  > interpreter (`src/main/cad/venvManager.ts` → `findCompatiblePython`). OpenSCAD + JSCAD need no
  > Python at all.

## Develop

```bash
npm install
npm run dev          # launch with HMR
npm run typecheck    # tsc for main + renderer
npm run test:engines # render a box with each available engine
```

## Package

```bash
npm run pack         # unsigned .app in release/ (open via right-click → Open)
npm run dist         # signed + notarized dmg/zip (needs the env vars below)
```

### Signing & notarization

`npm run dist` produces a signed, notarized `Protoloop-<version>-arm64.dmg`. It needs an Apple
Developer ID. Provide, in the environment:

- a **Developer ID Application** certificate in your login keychain (or `CSC_LINK` + `CSC_KEY_PASSWORD`)
- `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`

Notarization is wired in `build/notarize.cjs` (afterSign) and **skips automatically** when those vars
are absent, so `npm run pack` always yields a runnable local build.

## Architecture

```
src/
  shared/            types, params schema (zod), IPC channel + API contract
  main/
    ipc/router.ts    assembles the AppContext, registers every slice's IPC
    cad/             4-engine render layer + cancel/coalesce render queue
    agent/           CLI + API backends, stream parser, session manager
    persistence/     project store (userData/projects/<id>)
    settings/        settings, Keychain secret, tool detection
  preload/           contextBridge — the only renderer↔main surface
  renderer/
    store/           Zustand store: events → UI state
    features/        sidebar · chat · viewer (R3F) · params · settings · header
```

The agent authors `model.<scad|js|py>` + `params.json`; the app renders `model.stl` (+ `model.step`
for B-rep) and feeds any render error back to the agent for a fix. Slider changes re-render directly
from the source with new parameter values — no model call.
