import { Users } from 'lucide-react'
import { AppLayout } from '../layout/AppLayout'
import { PageHeader } from '../components/PageHeader'
import { EmptyState } from '../components/EmptyState'
import { texts } from '../lib/texts'

export function SupervisorHomePage() {
  const t = texts.supervisorHome
  return (
    <AppLayout withAssistant>
      <PageHeader title={t.title} lead={t.lead} />
      <EmptyState icon={Users} title={t.emptyTitle} body={t.emptyBody} />
    </AppLayout>
  )
}
