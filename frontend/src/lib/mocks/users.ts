import type { User } from '../../types'

/** Fikcyjni użytkownicy do logowania demonstracyjnego. */
export const mockUsers: User[] = [
  {
    id: 'sup-001',
    role: 'supervisor',
    first_name: 'Halina',
    last_name: 'Zawadzka-Nowicka',
    job_title: 'Dyrektor Departamentu Spraw Obywatelskich',
    organizational_unit: 'Departament Spraw Obywatelskich',
  },
  {
    id: 'sup-002',
    role: 'supervisor',
    first_name: 'Tomasz',
    last_name: 'Kędzierski',
    job_title: 'Naczelnik Wydziału Zamówień Publicznych',
    organizational_unit: 'Wydział Zamówień Publicznych',
  },
  {
    id: 'hr-001',
    role: 'hr',
    first_name: 'Bożena',
    last_name: 'Ślęzak',
    job_title: 'Główny specjalista do spraw kadr',
    organizational_unit: 'Biuro Kadr i Szkoleń',
  },
]
