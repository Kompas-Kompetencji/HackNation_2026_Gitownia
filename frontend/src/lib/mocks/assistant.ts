import type { AssistantAnswer, AssistantMode } from '../../types'

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

const RULES: Rule[] = [
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

export function mockAskAiAssistant(question: string, mode: AssistantMode): AssistantAnswer {
  const q = question.toLowerCase()
  const rule = RULES.find((r) => r.mode === mode && r.keywords.some((k) => q.includes(k)))

  if (!rule) return { mode, status: 'no_data', answer: '', sources: [] }
  return { mode, status: 'answered', ...rule.answer }
}
