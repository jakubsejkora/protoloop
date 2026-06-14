/**
 * Filesystem layout for Protoloop persistence. All paths hang off Electron's
 * per-user `userData` directory so projects survive app restarts.
 *
 *   <userData>/projects/<id>/meta.json
 *   <userData>/projects/<id>/chat.jsonl
 *   <userData>/projects/<id>/workspace/      (model.* + params.json)
 *   <userData>/venvs/cad/                     (managed CADQuery/build123d venv)
 */
import { app } from 'electron'
import path from 'node:path'

/** Absolute path to Electron's per-user data directory. */
export function userDataDir(): string {
  return app.getPath('userData')
}

/** `<userData>/projects` — the root that holds every project directory. */
export function projectsRoot(): string {
  return path.join(userDataDir(), 'projects')
}

/** `<userData>/projects/<id>` — a single project's root directory. */
export function projectDir(id: string): string {
  return path.join(projectsRoot(), id)
}

/** `<projectDir>/workspace` — the agent working dir (model.* + params.json). */
export function workspaceDir(id: string): string {
  return path.join(projectDir(id), 'workspace')
}

/** `<userData>/venvs/cad` — the managed Python venv for CADQuery/build123d. */
export function venvDir(): string {
  return path.join(userDataDir(), 'venvs', 'cad')
}
