import { ChatWidget } from '@/components/shared/ChatWidget'

export default function MmDeskLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <ChatWidget agentType="mm_desk" />
    </>
  )
}
