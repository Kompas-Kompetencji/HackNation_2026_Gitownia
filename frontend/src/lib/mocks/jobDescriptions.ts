import type { JobDescriptionDocument } from '../../types'
import { mockAnalyzeOsp } from './osp'

const documents: Omit<JobDescriptionDocument, 'analysis'>[] = [
  {
    id: 'jd-001a',
    employee_id: 'emp-001',
    filename: 'opis_stanowiska_specjalista_skargi_2022.docx',
    uploaded_at: '2022-11-03T09:15:00Z',
    version: 1,
  },
  {
    id: 'jd-001',
    employee_id: 'emp-001',
    filename: 'opis_stanowiska_starszy_specjalista_skargi.docx',
    uploaded_at: '2024-11-20T10:00:00Z',
    version: 2,
  },
  {
    id: 'jd-002',
    employee_id: 'emp-002',
    filename: 'opis_stanowiska_radca_wydzial_prawny.docx',
    uploaded_at: '2025-04-30T08:30:00Z',
    version: 1,
  },
  // Małgorzata Wróbel-Sośnicka (emp-003) celowo nie ma opisu stanowiska:
  // przed oceną okresową aplikacja prosi o jego wgranie.
]

/** Zapisane opisy stanowiska z wynikiem analizy potwierdzonym przez przełożonego. */
export const mockJobDescriptions: JobDescriptionDocument[] = documents.map((d) => ({
  ...d,
  analysis: mockAnalyzeOsp(d.filename),
}))
