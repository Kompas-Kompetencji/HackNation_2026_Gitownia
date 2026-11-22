import type { AssistantAnswer, AssistantMode } from '../../types'
import { mockCompetencyModelRaw } from './competencies'

/**
 * Makieta asystenta. Odpowiada tylko na kilka przygotowanych pytań (dopasowanie po słowach).
 * Na wszystko inne zwraca status "no_data", tak jak docelowo asystent formalny,
 * gdy w dokumentach nie ma podstawy do odpowiedzi. Dokumenty źródłowe są fikcyjne.
 */
interface Rule {
  mode: AssistantMode
  keywords: string[]
  answer: Omit<AssistantAnswer, 'mode' | 'status'>
}

const REGULATIONS = 'Regulamin oceniania pracowników urzędu (dokument przykładowy)'
const INSTRUCTION = 'Instrukcja wypełniania arkusza oceny (dokument przykładowy)'
const GUIDE = 'Poradnik rozmowy oceniającej (dokument przykładowy)'

// Kolejność ma znaczenie: reguły szczegółowe przed ogólnymi.
const RULES: Rule[] = [
  {
    mode: 'formal',
    keywords: ['rozmowę wstępną', 'rozmowy wstępnej', 'rozmowa wstępna'],
    answer: {
      answer:
        'Rozmowę wstępną z nowo zatrudnionym pracownikiem przełożony przeprowadza na początku zatrudnienia. Omawia na niej zakres obowiązków, oczekiwania i sposób pierwszej oceny. Termin dla konkretnego pracownika widać w jego panelu.',
      sources: [{ document_title: REGULATIONS, location: '§ 2 ust. 1', excerpt: 'Przełożony przeprowadza z nowym pracownikiem rozmowę wstępną.' }],
    },
  },
  {
    mode: 'formal',
    keywords: ['sprawozdan'],
    answer: {
      answer:
        'Przed pierwszą oceną pracownik przygotowuje krótkie sprawozdanie z wykonywanych zadań. Przełożony bierze je pod uwagę, oceniając pięć elementów: rzetelność, wykorzystywanie wiedzy, organizację pracy, komunikację i współpracę.',
      sources: [{ document_title: REGULATIONS, location: '§ 4 ust. 3', excerpt: 'Pracownik przedkłada sprawozdanie z wykonywania obowiązków.' }],
    },
  },
  {
    mode: 'formal',
    keywords: ['minął', 'minal', 'po terminie', 'przekrocz'],
    answer: {
      answer:
        'Przekroczenie terminu nie zwalnia z obowiązku sporządzenia oceny. Należy ją sporządzić niezwłocznie i poinformować kadry o przyczynie opóźnienia.',
      sources: [{ document_title: REGULATIONS, location: '§ 3 ust. 4', excerpt: 'Ocenę sporządza się niezwłocznie po ustaniu przyczyny opóźnienia.' }],
    },
  },
  {
    mode: 'formal',
    keywords: ['rozmowę oceniającą', 'rozmowy oceniającej'],
    answer: {
      answer:
        'Rozmowę oceniającą przeprowadza się przed sporządzeniem oceny okresowej, w terminie pozwalającym zakończyć ocenę przed upływem 24 miesięcy od poprzedniej. Termin dla tego pracownika widać w jego panelu.',
      sources: [{ document_title: REGULATIONS, location: '§ 5 ust. 1', excerpt: 'Przed sporządzeniem oceny przełożony przeprowadza rozmowę oceniającą.' }],
    },
  },
  {
    mode: 'interview',
    keywords: ['wstępn', 'nowym pracownikiem', 'nowego pracownika'],
    answer: {
      answer:
        'Na rozmowie wstępnej omów zakres obowiązków z opisu stanowiska, pięć elementów pierwszej oceny i to, jak będziesz zbierać przykłady zachowań. Ustal, kto wprowadza pracownika w zadania, i umów termin rozmowy kontrolnej.',
      sources: [{ document_title: GUIDE, location: 'Część 2', excerpt: 'Rozmowa wstępna ustala oczekiwania na okres pierwszej oceny.' }],
    },
  },
  {
    mode: 'formal',
    keywords: ['termin', 'kiedy', 'jak często', 'co ile'],
    answer: {
      answer:
        'Ocenę okresową sporządza się co 24 miesiące. Pierwszą ocenę sporządza się przed upływem okresu pierwszej umowy zawartej na czas określony.',
      sources: [
        {
          document_title: REGULATIONS,
          location: '§ 3 ust. 1 i 2',
          excerpt: 'Ocenę okresową sporządza bezpośredni przełożony co 24 miesiące.',
        },
      ],
    },
  },
  {
    mode: 'formal',
    keywords: ['negatywn', 'uzasadnien'],
    answer: {
      answer:
        'Przy ocenie negatywnej przełożony sporządza pisemne uzasadnienie. Wskazuje w nim wskaźniki, w których pracownik nie spełnił oczekiwań, oraz zalecenia na kolejny okres.',
      sources: [
        {
          document_title: REGULATIONS,
          location: '§ 7 ust. 3',
          excerpt: 'W przypadku oceny negatywnej oceniający sporządza uzasadnienie.',
        },
      ],
    },
  },
  {
    mode: 'formal',
    keywords: ['skala', 'poziom', 'brak podstaw'],
    answer: {
      answer:
        'Każdy wskaźnik ocenia się w skali pięciu poziomów: 1, 3, 5, 7, 9. Jeśli przełożony nie miał okazji zaobserwować zachowania, zaznacza „brak podstaw do oceny" i wskaźnik nie wchodzi do średniej.',
      sources: [
        {
          document_title: INSTRUCTION,
          location: 'Rozdział 2, punkt 4',
          excerpt: 'Poziom 1 oznacza zachowanie znacznie poniżej oczekiwań.',
        },
      ],
    },
  },
  {
    mode: 'interview',
    keywords: ['rozmow', 'przygot', 'zacząć', 'pytani'],
    answer: {
      answer:
        'Zacznij od celu rozmowy i jej przebiegu. Omów każdą kompetencję, opierając się na zapisanych przykładach (sytuacja, działanie, rezultat). Daj pracownikowi czas na jego ocenę własną, zanim przedstawisz swoją. Zakończ ustaleniem dwóch, trzech celów rozwojowych.',
      sources: [{ document_title: GUIDE, location: 'Część 1', excerpt: 'Rozmowa oceniająca składa się z czterech etapów.' }],
    },
  },
  {
    mode: 'interview',
    keywords: ['uzasadn', 'napisz', 'sformułuj'],
    answer: {
      answer:
        'Uzasadnienie opieraj na faktach: opisz sytuację, działanie pracownika i jego rezultat. Zamiast oceny osoby („jest niedokładny") opisz zachowanie („w trzech z pięciu spraw w październiku termin został przekroczony").',
      sources: [
        { document_title: GUIDE, location: 'Część 3', excerpt: 'Uzasadnienie odwołuje się do obserwowalnych zachowań.' },
      ],
    },
  },
]

const LEVEL_NAMES: Record<string, string> = {
  '1': 'znacznie poniżej oczekiwań',
  '3': 'poniżej oczekiwań',
  '5': 'na poziomie oczekiwań',
  '7': 'powyżej oczekiwań',
  '9': 'znacznie powyżej oczekiwań',
}

/**
 * Pytania z formularza oceny mają na początku kontekst w treści (kontrakt askAiAssistant się nie zmienia):
 * "Kryterium: Nazwa (C01)", "Wskaźnik: C01_I02", "Poziom: 1" oraz linie "- Nazwa: decyzja 5 pkt…".
 * Makieta odczytuje je, żeby odpowiedzi pasowały do bieżącego kroku.
 */
function contextualAnswer(question: string, mode: AssistantMode): AssistantAnswer | null {
  const q = question.toLowerCase()
  const criterion = question.match(/Kryterium: (.+?) \((C\d\d)\)/)
  const indicatorId = question.match(/Wskaźnik: (C\d\d_I\d\d)/)?.[1]
  const indicator = indicatorId
    ? mockCompetencyModelRaw.competencies.flatMap((c) => c.indicators).find((i) => i.id === indicatorId)
    : undefined

  if (mode === 'formal' && q.includes('co oznacza') && indicator) {
    return {
      mode,
      status: 'answered',
      answer: `Wskaźnik „${indicator.indicator}” opisuje zachowanie, które obserwujesz w kryterium „${criterion?.[1] ?? ''}”. Standardem jest poziom 5 (na poziomie oczekiwań): ${indicator.levels['5']} Poziom 1 to sytuacja, gdy pracownik: ${indicator.levels['1'].charAt(0).toLowerCase()}${indicator.levels['1'].slice(1)}`,
      sources: [{ document_title: 'Model kompetencji służby cywilnej', location: `wskaźnik ${indicator.id}`, excerpt: indicator.levels['5'] }],
    }
  }

  if (mode === 'formal' && (q.includes('obowiązkow') || q.includes('dodatkow')) && q.includes('kryteri')) {
    return {
      mode,
      status: 'answered',
      answer:
        'Arkusz określa pięć kryteriów obowiązkowych. Przełożony może dodać do trzech kryteriów dodatkowych spośród czternastu kryteriów z wykazu, dobranych do zadań na stanowisku. Każde kryterium, obowiązkowe i dodatkowe, dostaje ocenę w skali 1, 3, 5, 7, 9.',
      sources: [{ document_title: 'Rozporządzenie o ocenach okresowych z 2016 r. (dokument przykładowy)', location: '§ 4 i § 5 ust. 2', excerpt: 'Oceniający może wybrać nie więcej niż trzy kryteria dodatkowe.' }],
    }
  }

  const level = question.match(/poziom (\d)/i)?.[1]
  if (mode === 'interview' && q.includes('jak uzasadnić') && level) {
    return {
      mode,
      status: 'answered',
      answer: `Uzasadniając poziom ${level} (${LEVEL_NAMES[level] ?? ''})${criterion ? ` w kryterium „${criterion[1]}”` : ''}, opisz jeden lub dwa konkretne przykłady z okresu oceny: sytuację, działanie pracownika i jego rezultat. Wskaż, czy zachowanie się powtarzało i jaki miało wpływ na pracę komórki. Unikaj ocen osoby; opisuj zachowania.${level === '1' ? ' Przy poziomie 1 ocena jest negatywna niezależnie od średniej, więc uzasadnienie musi być szczególnie konkretne.' : ''}`,
      sources: [{ document_title: GUIDE, location: 'Część 3', excerpt: 'Uzasadnienie odwołuje się do obserwowalnych zachowań.' }],
    }
  }

  if (mode === 'interview' && q.includes('przygotuj rozmowę oceniającą')) {
    const rows = [...question.matchAll(/^- (.+?): decyzja (\d) pkt/gm)].map((m) => ({ name: m[1], level: Number(m[2]) }))
    const strong = rows.filter((r) => r.level >= 7).map((r) => r.name)
    const weak = rows.filter((r) => r.level <= 3).map((r) => r.name)
    const negative = q.includes('wynik: negatywna')
    return {
      mode,
      status: 'answered',
      answer: [
        `Plan rozmowy (${rows.length} kryteriów):`,
        '1. Otwarcie: cel rozmowy, przebieg i to, że pracownik może przedstawić swoją ocenę.',
        strong.length ? `2. Mocne strony: zacznij od kryteriów ${strong.join(', ')} i przykładów, które je potwierdzają.` : '2. Mocne strony: wskaż zachowania na poziomie oczekiwań, które warto utrzymać.',
        weak.length ? `3. Obszary do rozwoju: ${weak.join(', ')}. Przy każdym podaj przykład i zapytaj o przyczyny.` : '3. Obszary do rozwoju: zapytaj pracownika, co chciałby rozwijać w kolejnym okresie.',
        negative
          ? '4. Wynik negatywny: przedstaw uzasadnienie, poinformuj o prawie do sprzeciwu w terminie 7 dni i o kolejnej ocenie po 6 miesiącach.'
          : '4. Zakończenie: ustalcie dwa, trzy cele rozwojowe i sposób ich sprawdzenia.',
      ].join('\n'),
      sources: [{ document_title: GUIDE, location: 'Część 1', excerpt: 'Rozmowa oceniająca składa się z czterech etapów.' }],
    }
  }
  return null
}

export function mockAskAiAssistant(question: string, mode: AssistantMode): AssistantAnswer {
  const contextual = contextualAnswer(question, mode)
  if (contextual) return contextual
  // Bez bloku kontekstu dopasowujemy tylko samo pytanie.
  const q = (question.split('Pytanie: ').pop() ?? question).toLowerCase()
  const rule = RULES.find((r) => r.mode === mode && r.keywords.some((k) => q.includes(k)))

  if (!rule) return { mode, status: 'no_data', answer: '', sources: [] }
  return { mode, status: 'answered', ...rule.answer }
}
