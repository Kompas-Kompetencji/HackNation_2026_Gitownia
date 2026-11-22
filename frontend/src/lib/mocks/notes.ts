import type { Note } from '../../types'

export const mockNotes: Note[] = [
  {
    id: 'note-001',
    employee_id: 'emp-001',
    created_at: '2026-10-02T09:40:00Z',
    text: 'Samodzielnie przygotowała odpowiedź na skargę zbiorczą mieszkańców, termin dotrzymany mimo dwóch tygodni zastępstwa.',
  },
  {
    id: 'note-003',
    employee_id: 'emp-001',
    created_at: '2026-06-17T11:20:00Z',
    text: 'Zauważyła błędną podstawę prawną w projekcie odpowiedzi kolegi i poprawiła ją przed wysyłką; skarżący nie odwołał się.',
  },
  {
    id: 'note-004',
    employee_id: 'emp-001',
    created_at: '2026-03-05T14:00:00Z',
    text: 'Dwa pisma w lutym wysłane po terminie ustawowym; nie zgłosiła wcześniej ryzyka opóźnienia.',
  },
  {
    id: 'note-005',
    employee_id: 'emp-001',
    created_at: '2025-11-24T08:45:00Z',
    text: 'Przeprowadziła dla zespołu krótkie szkolenie z nowej instrukcji kancelaryjnej po kursie w październiku.',
  },
  {
    id: 'note-006',
    employee_id: 'emp-002',
    created_at: '2026-09-09T10:10:00Z',
    text: 'Opinia do projektu uchwały wskazała dwie kolizje z ustawą; projekt poprawiono przed posiedzeniem zarządu.',
  },
  {
    id: 'note-002',
    employee_id: 'emp-003',
    created_at: '2026-09-18T13:05:00Z',
    text: 'Wprowadziła nowy grafik dyżurów w punkcie obsługi; kolejki w poniedziałki krótsze o około połowę.',
  },
  {
    id: 'note-007',
    employee_id: 'emp-003',
    created_at: '2026-05-12T09:30:00Z',
    text: 'Przy awarii systemu kolejkowego w ciągu godziny zorganizowała ręczną obsługę i poinformowała interesantów.',
  },
]
