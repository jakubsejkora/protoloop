import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import type { BackendId, EngineId, ModelId, EffortLevel, GenMode, ToolStatus } from '@shared/types'
import { ENGINES, MODELS, modelById, modelSupportsEffort } from '@shared/types'
import { useStore } from '@/store/store'
import { cn } from '@/lib/cn'
import { effortLabel } from '@/lib/format'
import { Dropdown } from '@/components/Dropdown'
import { Spinner } from '@/components/Spinner'

export function SettingsModal(): JSX.Element {
  const open = useStore((s) => s.settingsOpen)
  const closeSettings = useStore((s) => s.closeSettings)

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center p-8"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.14 }}
        >
          <div className="absolute inset-0 bg-black/55 backdrop-blur-[2px]" onClick={closeSettings} />
          <motion.div
            initial={{ opacity: 0, scale: 0.97, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 8 }}
            transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
            className="relative flex max-h-[82vh] w-full max-w-[560px] flex-col overflow-hidden rounded-xl border border-line bg-panel shadow-2xl shadow-black/60"
          >
            <SettingsHeader onClose={closeSettings} />
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
              <BackendSection />
              <Divider />
              <DefaultsSection />
              <Divider />
              <EnginesSection />
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function SettingsHeader({ onClose }: { onClose: () => void }): JSX.Element {
  return (
    <div className="flex h-12 shrink-0 items-center justify-between border-b border-line px-5">
      <h2 className="font-mono text-xs font-medium tracking-[0.16em] text-ink-dim">SETTINGS</h2>
      <button
        type="button"
        onClick={onClose}
        className="flex h-7 w-7 items-center justify-center rounded-md text-ink-mute transition-colors hover:bg-hover hover:text-ink"
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path d="M3.5 3.5 10.5 10.5M10.5 3.5 3.5 10.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  )
}

function Divider(): JSX.Element {
  return <div className="my-5 h-px bg-line/60" />
}

function SectionTitle({ children, hint }: { children: React.ReactNode; hint?: string }): JSX.Element {
  return (
    <div className="mb-3">
      <h3 className="text-2xs font-medium uppercase tracking-[0.16em] text-ink-mute">{children}</h3>
      {hint && <p className="mt-1 text-2xs text-ink-mute/70">{hint}</p>}
    </div>
  )
}

function Row({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }): JSX.Element {
  return (
    <div className="flex items-center justify-between gap-4 py-1.5">
      <div className="min-w-0">
        <div className="text-xs text-ink-dim">{label}</div>
        {hint && <div className="mt-0.5 text-2xs text-ink-mute/70">{hint}</div>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}

// ---------- Backend ----------

function BackendSection(): JSX.Element {
  const settings = useStore((s) => s.settings)
  const saveSettings = useStore((s) => s.saveSettings)
  const setApiKey = useStore((s) => s.setApiKey)

  const backend: BackendId = settings?.backend ?? 'cli'
  const [keyDraft, setKeyDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const submitKey = async (): Promise<void> => {
    if (!keyDraft.trim()) return
    setSaving(true)
    setSaved(false)
    const ok = await setApiKey(keyDraft.trim())
    setSaving(false)
    if (ok) {
      setKeyDraft('')
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    }
  }

  return (
    <section>
      <SectionTitle hint="How Protoloop talks to Claude.">Backend</SectionTitle>
      <div className="grid grid-cols-2 gap-2">
        <BackendCard
          active={backend === 'cli'}
          title="Claude CLI"
          desc="Uses your local claude login. No key needed."
          onClick={() => void saveSettings({ backend: 'cli' })}
        />
        <BackendCard
          active={backend === 'api'}
          title="Anthropic API"
          desc="Direct API calls with your own key."
          onClick={() => void saveSettings({ backend: 'api' })}
        />
      </div>

      <AnimatePresence initial={false}>
        {backend === 'api' && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            <div className="mt-3 rounded-lg border border-line/70 bg-elevated/60 p-3">
              <div className="mb-1.5 flex items-center justify-between">
                <span className="text-2xs uppercase tracking-wider text-ink-mute">API key</span>
                <span
                  className={cn(
                    'flex items-center gap-1 text-2xs',
                    settings?.hasApiKey ? 'text-good' : 'text-ink-mute'
                  )}
                >
                  <span className={cn('h-1.5 w-1.5 rounded-full', settings?.hasApiKey ? 'bg-good' : 'bg-ink-mute')} />
                  {settings?.hasApiKey ? 'Key stored' : 'No key stored'}
                </span>
              </div>
              <div className="flex gap-2">
                <input
                  type="password"
                  value={keyDraft}
                  onChange={(e) => setKeyDraft(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && void submitKey()}
                  placeholder="sk-ant-…"
                  spellCheck={false}
                  className="h-7 flex-1 rounded-md border border-line bg-base px-2 font-mono text-2xs text-ink outline-none transition-colors focus:border-amber/60"
                />
                <button
                  type="button"
                  onClick={() => void submitKey()}
                  disabled={!keyDraft.trim() || saving}
                  className={cn(
                    'flex h-7 items-center gap-1.5 rounded-md px-2.5 text-2xs font-medium transition-colors',
                    keyDraft.trim() && !saving
                      ? 'bg-amber text-base hover:bg-amber-bright'
                      : 'cursor-not-allowed bg-hover text-ink-mute/60'
                  )}
                >
                  {saving && <Spinner size={10} className="text-base" />}
                  {saved ? 'Saved' : 'Save'}
                </button>
              </div>
              <p className="mt-1.5 text-2xs text-ink-mute/70">Stored securely in the system keychain.</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  )
}

function BackendCard({
  active,
  title,
  desc,
  onClick
}: {
  active: boolean
  title: string
  desc: string
  onClick: () => void
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex flex-col gap-1 rounded-lg border p-3 text-left transition-colors',
        active
          ? 'border-amber/50 bg-amber/[0.06] ring-1 ring-inset ring-amber/20'
          : 'border-line/70 bg-elevated/40 hover:border-line hover:bg-elevated'
      )}
    >
      <span className="flex items-center gap-1.5">
        <span
          className={cn(
            'flex h-3 w-3 items-center justify-center rounded-full border',
            active ? 'border-amber' : 'border-ink-mute'
          )}
        >
          {active && <span className="h-1.5 w-1.5 rounded-full bg-amber" />}
        </span>
        <span className={cn('text-xs font-medium', active ? 'text-ink' : 'text-ink-dim')}>{title}</span>
      </span>
      <span className="text-2xs leading-snug text-ink-mute">{desc}</span>
    </button>
  )
}

// ---------- Defaults ----------

function DefaultsSection(): JSX.Element {
  const settings = useStore((s) => s.settings)
  const saveSettings = useStore((s) => s.saveSettings)
  if (!settings) return <></>

  const model = settings.defaultModel
  const showEffort = modelSupportsEffort(model)

  return (
    <section>
      <SectionTitle hint="Applied to new creations.">Defaults</SectionTitle>
      <Row label="Model">
        <Dropdown<ModelId>
          value={model}
          onChange={(v) => void saveSettings({ defaultModel: v })}
          align="right"
          className="min-w-[130px]"
          menuClassName="min-w-[230px]"
          options={MODELS.map((m) => ({ value: m.id, label: m.label, hint: m.blurb }))}
        />
      </Row>
      {showEffort && (
        <Row label="Effort">
          <Dropdown<EffortLevel>
            value={settings.defaultEffort}
            onChange={(v) => void saveSettings({ defaultEffort: v })}
            align="right"
            className="min-w-[130px]"
            options={modelById(model).efforts.map((e) => ({ value: e, label: effortLabel(e) }))}
          />
        </Row>
      )}
      <Row label="Generation mode">
        <Dropdown<GenMode>
          value={settings.defaultMode}
          onChange={(v) => void saveSettings({ defaultMode: v })}
          align="right"
          className="min-w-[130px]"
          options={[
            { value: 'cad', label: 'CAD engine', hint: 'Parametric source + render' },
            { value: 'direct', label: 'Direct', hint: 'Mesh script directly' }
          ]}
        />
      </Row>
      <Row label="CAD engine">
        <Dropdown<EngineId>
          value={settings.defaultEngine}
          onChange={(v) => void saveSettings({ defaultEngine: v })}
          align="right"
          className="min-w-[130px]"
          menuClassName="min-w-[230px]"
          options={ENGINES.map((e) => ({ value: e.id, label: e.label, hint: e.blurb }))}
        />
      </Row>
    </section>
  )
}

// ---------- Engines & tools ----------

function EnginesSection(): JSX.Element {
  const tools = useStore((s) => s.tools)
  const auth = tools?.auth
  const installing = useStore((s) => s.installing)
  const installLog = useStore((s) => s.installLog)
  const installEngines = useStore((s) => s.installEngines)
  const refreshTools = useStore((s) => s.refreshTools)

  const logRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight })
  }, [installLog.length])

  const rows: ToolStatus[] = tools
    ? [tools.claude, tools.openscad, tools.python3, tools.venv]
    : []

  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <SectionTitle>Engines &amp; tools</SectionTitle>
        <button
          type="button"
          onClick={() => void refreshTools()}
          className="-mt-2 flex h-6 items-center gap-1 rounded px-1.5 text-2xs text-ink-mute transition-colors hover:bg-hover hover:text-ink-dim"
        >
          <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
            <path d="M10 6a4 4 0 1 1-1.2-2.85" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
            <path d="M9 1.2v2.4H6.6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Refresh
        </button>
      </div>

      {!tools ? (
        <div className="flex items-center gap-2 px-1 py-3 text-2xs text-ink-mute">
          <Spinner size={11} /> Detecting tools…
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-line/70">
          {rows.map((t, i) => (
            <ToolRow key={t.name} tool={t} last={i === rows.length - 1} />
          ))}
        </div>
      )}

      {/* Claude auth */}
      {auth && (
        <div className="mt-2 flex items-center gap-2 rounded-lg border border-line/70 bg-elevated/40 px-3 py-2">
          <span className={cn('h-1.5 w-1.5 rounded-full', auth.loggedIn ? 'bg-good' : 'bg-bad')} />
          <span className="text-2xs text-ink-dim">
            {auth.loggedIn ? 'Claude authenticated' : 'Claude not logged in'}
          </span>
          {auth.loggedIn && (auth.subscription || auth.method) && (
            <span className="ml-auto font-mono text-2xs text-ink-mute">
              {auth.subscription ?? auth.method}
            </span>
          )}
        </div>
      )}

      {/* Install CADQuery + build123d */}
      <div className="mt-3 rounded-lg border border-line/70 bg-elevated/40 p-3">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs text-ink-dim">Python B-rep engines</div>
            <div className="mt-0.5 text-2xs text-ink-mute/80">
              Install CADQuery + build123d into a managed virtualenv.
            </div>
          </div>
          <button
            type="button"
            onClick={() => void installEngines()}
            disabled={installing}
            className={cn(
              'flex h-7 shrink-0 items-center gap-1.5 rounded-md px-2.5 text-2xs font-medium transition-colors',
              installing
                ? 'cursor-not-allowed bg-hover text-ink-mute'
                : 'border border-line bg-base text-ink-dim hover:border-amber/40 hover:text-amber-bright'
            )}
          >
            {installing && <Spinner size={11} />}
            {installing ? 'Installing…' : 'Install'}
          </button>
        </div>

        <AnimatePresence initial={false}>
          {(installing || installLog.length > 0) && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
              className="overflow-hidden"
            >
              <div
                ref={logRef}
                className="mt-2.5 max-h-32 overflow-y-auto rounded-md border border-line bg-base p-2 font-mono text-2xs leading-relaxed text-ink-mute"
              >
                {installLog.length === 0 ? (
                  <span className="text-ink-mute/60">Starting…</span>
                ) : (
                  installLog.map((line, i) => (
                    <div
                      key={i}
                      className={cn('whitespace-pre-wrap break-all', line.startsWith('!') && 'text-bad')}
                    >
                      {line}
                    </div>
                  ))
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </section>
  )
}

function ToolRow({ tool: t, last }: { tool: ToolStatus; last: boolean }): JSX.Element {
  return (
    <div
      className={cn(
        'flex items-center gap-2.5 bg-elevated/30 px-3 py-2',
        !last && 'border-b border-line/50'
      )}
    >
      <span className={cn('h-2 w-2 shrink-0 rounded-full', t.ok ? 'bg-good' : 'bg-bad')} />
      <span className="w-20 shrink-0 truncate font-mono text-2xs text-ink-dim">{t.name}</span>
      <div className="min-w-0 flex-1">
        {t.ok ? (
          <span className="truncate font-mono text-2xs text-ink-mute" title={t.path}>
            {t.version ?? t.path ?? 'available'}
          </span>
        ) : (
          <span className="truncate text-2xs text-ink-mute/80" title={t.hint}>
            {t.hint ?? 'Not found'}
          </span>
        )}
      </div>
      <span
        className={cn(
          'shrink-0 rounded px-1.5 py-0.5 text-2xs font-medium',
          t.ok ? 'bg-good/10 text-good' : 'bg-bad/10 text-bad'
        )}
      >
        {t.ok ? 'OK' : 'Missing'}
      </span>
    </div>
  )
}
