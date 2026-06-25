import { ChatWidget } from '@/components/shared/ChatWidget'

export default function PlayerLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <ChatWidget agentType="player" />
    </>
  )
}
