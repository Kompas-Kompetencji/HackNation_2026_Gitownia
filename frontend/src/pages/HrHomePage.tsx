import { ClipboardList } from 'lucide-react'
import { AppLayout } from '../layout/AppLayout'
import { PageHeader } from '../components/PageHeader'
import { EmptyState } from '../components/EmptyState'
import { texts } from '../lib/texts'

export function HrHomePage() {
  const t = texts.hrHome
  return (
    <AppLayout>
      <PageHeader title={t.title} lead={t.lead} />
      <EmptyState icon={ClipboardList} title={t.emptyTitle} body={t.emptyBody} />
    </AppLayout>
  )
}
