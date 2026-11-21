/**
 * Wszystkie teksty interfejsu w jednym miejscu. Pełne nazwy, bez skrótów.
 */
import type {
  AssessmentStatus,
  AssistantMode,
  ContractType,
  EmployeeStatus,
  UserRole,
} from '../types'

export const texts = {
  app: {
    name: 'Kompas Kompetencji',
    institution: 'Urząd — system wspierania ocen pracowniczych',
    skipToContent: 'Przejdź do treści',
  },

  roles: {
    supervisor: 'Przełożony',
    hr: 'Kadry',
  } satisfies Record<UserRole, string>,

  login: {
    title: 'Zaloguj się',
    lead: 'Wybierz konto demonstracyjne. Każdy przełożony widzi wyłącznie własnych pracowników, kadry widzą terminy i statusy wszystkich ocen.',
    groupSupervisors: 'Przełożeni',
    groupHr: 'Kadry',
    signIn: 'Zaloguj się',
    signingIn: 'Logowanie…',
    loading: 'Wczytywanie kont…',
    loadError: 'Nie udało się wczytać listy kont. Sprawdź, czy backend działa, i odśwież stronę.',
    chooseAccount: 'Wybierz konto, aby się zalogować.',
    demoNotice: 'Wersja demonstracyjna: dane osobowe są fikcyjne, logowanie nie wymaga hasła.',
    mockNotice: 'Dane przykładowe (makiety) są włączone.',
    supervisorScope: (count: number) =>
      count === 1 ? 'Ocenia 1 pracownika' : `Ocenia ${count} pracowników`,
    hrScope: 'Statusy i terminy wszystkich ocen',
  },

  nav: {
    label: 'Nawigacja główna',
    supervisorHome: 'Moi pracownicy',
    hrHome: 'Oceny w urzędzie',
    signedInAs: 'Zalogowano jako',
    signOut: 'Wyloguj się',
    showAssistant: 'Pokaż asystenta',
    hideAssistant: 'Ukryj asystenta',
  },

  routes: {
    forbiddenTitle: 'Brak dostępu do tego widoku',
    forbiddenBody: 'Ten widok jest przeznaczony dla innej roli. Wróć do swojego panelu.',
    backHome: 'Wróć do swojego panelu',
    notFoundTitle: 'Nie ma takiej strony',
    notFoundBody: 'Adres jest nieprawidłowy albo strona została przeniesiona.',
  },

  supervisorHome: {
    title: 'Moi pracownicy',
    lead: 'Tutaj pojawi się lista Twoich pracowników z terminami następnych ocen.',
    emptyTitle: 'Lista pracowników powstaje w kolejnym etapie',
    emptyBody: 'Na razie możesz sprawdzić asystenta formalnego w panelu po prawej stronie.',
  },

  hrHome: {
    title: 'Oceny w urzędzie',
    lead: 'Tutaj pojawi się tabela wszystkich ocen ze statusami, terminami i przypomnieniami.',
    emptyTitle: 'Tabela ocen powstaje w kolejnym etapie',
    emptyBody: 'Kadry widzą statusy i terminy, bez treści ocen i punktów.',
  },

  assistant: {
    regionLabel: 'Panel asystenta',
    title: 'Asystent',
    modeLabel: 'Tryb asystenta',
    modes: {
      formal: 'Asystent formalny',
      interview: 'Asystent rozmowy',
    } satisfies Record<AssistantMode, string>,
    modeHints: {
      formal: 'Odpowiada wyłącznie na podstawie przepisów i dokumentów urzędu, zawsze ze wskazaniem źródła.',
      interview: 'Pomaga przygotować rozmowę oceniającą i sformułować uzasadnienie.',
    } satisfies Record<AssistantMode, string>,
    questionLabel: 'Twoje pytanie',
    placeholder: {
      formal: 'Na przykład: jaki jest termin oceny okresowej?',
      interview: 'Na przykład: jak przygotować się do rozmowy?',
    } satisfies Record<AssistantMode, string>,
    submit: 'Zadaj pytanie',
    submitting: 'Szukam odpowiedzi…',
    emptyQuestion: 'Wpisz pytanie, zanim je wyślesz.',
    emptyState: 'Zadaj pytanie. Odpowiedzi pojawią się tutaj razem ze źródłem.',
    suggestionsLabel: 'Przykładowe pytania',
    suggestions: {
      formal: ['Jaki jest termin oceny okresowej?', 'Kiedy uzasadnienie jest obowiązkowe?', 'Co oznacza brak podstaw do oceny?'],
      interview: ['Jak przygotować się do rozmowy?', 'Jak napisać uzasadnienie?'],
    } satisfies Record<AssistantMode, string[]>,
    you: 'Pytanie',
    sourceLabel: 'Źródło',
    noDataTitle: 'Brak danych w dokumentach',
    noDataBody: 'W dostępnych dokumentach nie ma podstawy do odpowiedzi na to pytanie. Sprawdź przepisy samodzielnie lub zapytaj kadry.',
    error: 'Asystent nie odpowiedział. Spróbuj ponownie za chwilę.',
    disclaimer: 'Asystent tylko podpowiada. Decyzję o ocenie podejmuje przełożony.',
    clear: 'Wyczyść rozmowę',
  },

  status: {
    employee: {
      awaiting_first_assessment: 'Czeka na pierwszą ocenę',
      assessment_in_progress: 'Ocena w toku',
      assessment_due_soon: 'Termin oceny wkrótce',
      assessment_overdue: 'Termin oceny minął',
      up_to_date: 'Ocena aktualna',
    } satisfies Record<EmployeeStatus, string>,
    assessment: {
      not_started: 'Nierozpoczęta',
      draft: 'Wersja robocza',
      awaiting_interview: 'Czeka na rozmowę',
      completed: 'Zakończona',
      overdue: 'Po terminie',
    } satisfies Record<AssessmentStatus, string>,
  },

  contractType: {
    fixed_term_first: 'Pierwsza umowa na czas określony',
    indefinite: 'Umowa na czas nieokreślony',
    appointment: 'Mianowanie',
  } satisfies Record<ContractType, string>,

  common: {
    loading: 'Wczytywanie…',
    retry: 'Spróbuj ponownie',
  },
} as const
