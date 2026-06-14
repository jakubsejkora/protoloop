import { useActiveChat, useActiveProject } from '@/store/store'
import { ControlBar } from './ControlBar'
import { Composer } from './Composer'
import { MessageList } from './MessageList'

export function Chat(): JSX.Element {
  const project = useActiveProject()
  const chat = useActiveChat()
  const running = chat?.status === 'running'

  return (
    <section className="flex w-[372px] shrink-0 flex-col border-r border-line bg-panel/60">
      <MessageList chat={chat} projectTitle={project?.title ?? ''} />

      {project && (
        <div className="shrink-0 border-t border-line/70 bg-panel px-3 py-2">
          <ControlBar project={project} />
        </div>
      )}

      <Composer canSend={!running} running={!!running} />
    </section>
  )
}
