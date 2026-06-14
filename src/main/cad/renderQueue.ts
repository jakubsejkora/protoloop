/**
 * Per-workspace serialized render queue.
 *
 * Invariants:
 *  - At most ONE render in flight per workspace, plus ONE pending slot.
 *  - A new request REPLACES whatever is pending (older pending is coalesced/dropped)
 *    AND kills the in-flight child (its output is now stale).
 *  - Output is always written to `<target>.tmp` then atomically `fs.rename`d to the
 *    final path, so a killed/failed render never leaves a half-written file.
 *
 * A render task is described by `RenderJob`: it gets the temp output path to write to
 * and returns a `RunHandle { kill, done }`. In-process engines (jscad) supply a no-op
 * `kill`; child-process engines (openscad/python) wire `kill` to SIGKILL the child.
 */
import { rename, rm } from 'node:fs/promises'
import type { EngineId, RenderOutcome } from '@shared/types'

/** A handle over one running render: how to kill it, and when it finishes. */
export interface RunHandle {
  /** force-terminate the underlying work (SIGKILL the child, or no-op in-process) */
  kill: () => void
  /** resolves with the outcome; must never reject */
  done: Promise<RenderOutcome>
}

/**
 * A render job. `tmpStlPath` is where the engine must write its STL; on success the
 * queue renames it to `finalStlPath`. `start` launches the work and returns a handle.
 */
export interface RenderJob {
  engine: EngineId
  finalStlPath: string
  tmpStlPath: string
  /** optional sibling STEP paths to atomically promote on success */
  finalStepPath?: string
  tmpStepPath?: string
  start: (tmpStlPath: string) => RunHandle | Promise<RunHandle>
}

interface Pending {
  job: RenderJob
  resolve: (o: RenderOutcome) => void
}

interface InFlight {
  /** kill the running work; safe to call before an async `start` resolves */
  kill: () => void
  /** set when this in-flight has been superseded; its result is discarded */
  stale: boolean
}

export class RenderQueue {
  private inFlight = new Map<string, InFlight>()
  private pending = new Map<string, Pending>()

  /**
   * Enqueue a render for `workspaceKey`. If something is already in flight it is
   * killed and this becomes the next job; any previously-pending job is coalesced
   * away (resolved with a superseded error) so only the latest request survives.
   */
  enqueue(workspaceKey: string, job: RenderJob): Promise<RenderOutcome> {
    return new Promise<RenderOutcome>((resolve) => {
      // Coalesce: drop any older pending job for this workspace.
      const prevPending = this.pending.get(workspaceKey)
      if (prevPending) {
        prevPending.resolve({
          ok: false,
          code: 'UNKNOWN',
          engine: prevPending.job.engine,
          message: 'Superseded by a newer render request'
        })
      }
      this.pending.set(workspaceKey, { job, resolve })

      const current = this.inFlight.get(workspaceKey)
      if (current) {
        // Stale: its STL is no longer wanted. Kill it; its completion will drive the
        // pump to pick up our newly-pending job.
        current.stale = true
        current.kill()
      } else {
        this.pump(workspaceKey)
      }
    })
  }

  /**
   * Launch the pending job for a workspace if nothing is in flight. The in-flight
   * record is registered SYNCHRONOUSLY (before awaiting the work) so concurrent
   * synchronous enqueue() calls correctly see a render in progress and coalesce.
   */
  private pump(workspaceKey: string): void {
    if (this.inFlight.has(workspaceKey)) return
    const next = this.pending.get(workspaceKey)
    if (!next) return
    this.pending.delete(workspaceKey)

    const { job, resolve } = next

    // Deferred-kill wrapper: if start() returns a Promise, a kill() arriving before
    // the handle resolves is buffered and applied once the handle is available.
    let killed = false
    let liveHandle: RunHandle | null = null
    const record: InFlight = {
      stale: false,
      kill: () => {
        killed = true
        liveHandle?.kill()
      }
    }
    this.inFlight.set(workspaceKey, record)

    const finish = (outcome: RenderOutcome): void => {
      this.inFlight.delete(workspaceKey)
      void this.finalize(workspaceKey, job, record, outcome, resolve)
    }

    let started: RunHandle | Promise<RunHandle>
    try {
      started = job.start(job.tmpStlPath)
    } catch (err) {
      finish({
        ok: false,
        code: 'UNKNOWN',
        engine: job.engine,
        message: `Failed to start render: ${(err as Error).message}`
      })
      return
    }

    Promise.resolve(started)
      .then((handle) => {
        liveHandle = handle
        if (killed) handle.kill()
        return handle.done
      })
      .then(
        (outcome) => finish(outcome),
        (err) =>
          finish({
            ok: false,
            code: 'UNKNOWN',
            engine: job.engine,
            message: `Render crashed: ${(err as Error).message}`
          })
      )
  }

  /** Promote/cleanup after a render completes, then drain the next pending job. */
  private async finalize(
    workspaceKey: string,
    job: RenderJob,
    record: InFlight,
    outcome: RenderOutcome,
    resolve: (o: RenderOutcome) => void
  ): Promise<void> {
    if (record.stale) {
      // Superseded mid-flight: discard output + temp files, resolve as superseded.
      await this.cleanupTmp(job)
      resolve({
        ok: false,
        code: 'UNKNOWN',
        engine: job.engine,
        message: 'Superseded by a newer render request'
      })
    } else if (outcome.ok) {
      // Promote temp → final atomically.
      try {
        await rename(job.tmpStlPath, job.finalStlPath)
        if (job.tmpStepPath && job.finalStepPath) {
          await rename(job.tmpStepPath, job.finalStepPath).catch(() => undefined)
        }
        resolve({ ...outcome, stlPath: job.finalStlPath })
      } catch (err) {
        await this.cleanupTmp(job)
        resolve({
          ok: false,
          code: 'UNKNOWN',
          engine: outcome.engine,
          message: `Failed to finalize STL: ${(err as Error).message}`
        })
      }
    } else {
      await this.cleanupTmp(job)
      resolve(outcome)
    }

    // Drain anything that queued up while we ran.
    void this.pump(workspaceKey)
  }

  private async cleanupTmp(job: RenderJob): Promise<void> {
    await rm(job.tmpStlPath, { force: true }).catch(() => undefined)
    if (job.tmpStepPath) await rm(job.tmpStepPath, { force: true }).catch(() => undefined)
  }
}
