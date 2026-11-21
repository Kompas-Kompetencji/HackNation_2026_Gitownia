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
    loadError: 'Nie udało się wczytać listy kont. Odśwież stronę, a jeśli błąd się powtórzy, zgłoś go administratorowi.',
    chooseAccount: 'Wybierz konto, aby się zalogować.',
    demoNotice: 'Wersja demonstracyjna: dane osobowe są fikcyjne, logowanie nie wymaga hasła.',
    mockNotice: 'Dane przykładowe (makiety) są włączone.',
    claim: 'Ocena oparta na zachowaniach, nie na wrażeniach.',
    claimBody:
      'Arkusz, wskaźniki behawioralne i przepisy w jednym miejscu. Aplikacja podpowiada, decyzję podejmuje przełożony.',
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
    lead: 'Pracownicy, których oceniasz, z terminami następnych ocen.',
    addEmployee: 'Dodaj pracownika i rozpocznij pierwszą ocenę',
    searchLabel: 'Szukaj pracownika',
    searchPlaceholder: 'Imię, nazwisko lub stanowisko',
    tableCaption: 'Lista Twoich pracowników',
    columns: {
      name: 'Pracownik',
      position: 'Stanowisko',
      status: 'Status oceny',
      due: 'Termin następnej oceny',
    },
    sortBy: (column: string) => `Sortuj według: ${column}`,
    count: (shown: number, total: number) =>
      shown === total ? `Pracownicy: ${total}` : `Wyniki wyszukiwania: ${shown} z ${total}`,
    dueNotSet: 'Termin ustali system',
    loading: 'Wczytywanie listy pracowników…',
    loadError: 'Nie udało się wczytać listy pracowników.',
    emptyTitle: 'Nie masz jeszcze żadnych pracowników',
    emptyBody: 'Dodaj pracownika, aby wgrać opis jego stanowiska i rozpocząć pierwszą ocenę.',
    noResultsTitle: 'Brak pracowników pasujących do wyszukiwania',
    noResultsBody: 'Sprawdź pisownię albo wyczyść pole wyszukiwania.',
    clearSearch: 'Wyczyść wyszukiwanie',
  },

  dueRelative: {
    today: 'termin dzisiaj',
    inDays: (n: number) => (n === 1 ? 'za 1 dzień' : `za ${n} dni`),
    daysAgo: (n: number) => (n === 1 ? '1 dzień po terminie' : `${n} dni po terminie`),
  },

  wizard: {
    title: 'Nowy pracownik',
    backToList: 'Wróć do listy pracowników',
    stepOf: (step: number, total: number) => `Krok ${step} z ${total}`,
    steps: ['Dane pracownika', 'Opis stanowiska', 'Potwierdzenie'],
    next: 'Dalej',
    back: 'Wstecz',
    cancel: 'Anuluj',
    required: 'pole wymagane',
    personal: {
      lead: 'Wpisz dane z umowy. Na ich podstawie system ustali termin pierwszej oceny.',
      firstName: 'Imię',
      lastName: 'Nazwisko',
      hireDate: 'Data zatrudnienia',
      contractType: 'Rodzaj umowy',
      errors: {
        firstName: 'Wpisz imię pracownika.',
        lastName: 'Wpisz nazwisko pracownika.',
        hireDate: 'Podaj datę zatrudnienia.',
        hireDateFuture: 'Data zatrudnienia nie może być późniejsza niż dzisiejsza.',
        contractType: 'Wybierz rodzaj umowy.',
      },
      errorSummary: (n: number) => (n === 1 ? 'Popraw 1 pole, aby przejść dalej.' : `Popraw ${n} pola, aby przejść dalej.`),
    },
    document: {
      lead: 'Wgraj opis stanowiska pracy w formacie Word. Aplikacja odczyta z niego dane i zaproponuje arkusz oceny. Sprawdź je i popraw, jeśli trzeba.',
      fileLabel: 'Plik z opisem stanowiska',
      fileHint: 'Tylko plik Word z rozszerzeniem .docx, do 10 MB.',
      chooseFile: 'Wybierz plik',
      replaceFile: 'Wybierz inny plik',
      analyzing: (name: string) => `Odczytuję plik ${name}…`,
      errors: {
        missing: 'Wgraj plik z opisem stanowiska.',
        format: 'Ten plik nie jest dokumentem Word (.docx). Zapisz opis stanowiska jako .docx i wgraj go ponownie.',
        size: 'Plik jest większy niż 10 MB. Wgraj mniejszy plik.',
        upload: 'Nie udało się odczytać pliku. Sprawdź, czy otwiera się w programie Word, i wgraj go ponownie.',
      },
      retry: 'Spróbuj odczytać ponownie',
      detectedTitle: 'Dane odczytane z opisu stanowiska',
      detectedLead: 'Sprawdź każde pole. To propozycja: decyzję podejmujesz Ty.',
      positionTitle: 'Nazwa stanowiska',
      organizationalUnit: 'Komórka organizacyjna',
      subordinates: 'Liczba podległych pracowników',
      subordinatesHint: 'Wpisz 0, jeśli pracownik nie kieruje zespołem.',
      form: 'Arkusz oceny okresowej',
      suggested: 'proponowany',
      formOptions: {
        B: { label: 'Arkusz B', hint: 'Dla stanowisk z kierowaniem zespołem.' },
        C: { label: 'Arkusz C', hint: 'Dla stanowisk bez kierowania zespołem.' },
      },
      criteria: 'Kryteria dodatkowe',
      criteriaLead: 'Trzy kryteria, które obok kompetencji podstawowych trafią do arkusza.',
      criterionLabel: (n: number) => `Kryterium dodatkowe ${n}`,
      criterionWhy: 'Dlaczego zaproponowane:',
      errors2: {
        positionTitle: 'Wpisz nazwę stanowiska.',
        subordinates: 'Podaj liczbę podległych pracowników (0 lub więcej).',
        criterion: 'Wpisz nazwę kryterium.',
      },
      confirm: 'Potwierdź dane i przejdź dalej',
    },
    summary: {
      lead: 'Sprawdź dane. Po utworzeniu pracownik pojawi się na Twojej liście, a opis stanowiska zostanie zapisany w jego historii.',
      personalTitle: 'Dane pracownika',
      documentTitle: 'Opis stanowiska',
      file: 'Plik',
      edit: 'Zmień',
      create: 'Utwórz pracownika',
      creating: 'Tworzę pracownika…',
      createError: 'Nie udało się utworzyć pracownika. Dane nie zostały zapisane, spróbuj ponownie.',
    },
  },

  employee: {
    created: (name: string) => `Dodano pracownika ${name}. Opis stanowiska został zapisany.`,
    loading: 'Wczytywanie danych pracownika…',
    loadError: 'Nie udało się wczytać danych pracownika.',
    notFoundTitle: 'Nie znaleziono pracownika',
    notFoundBody: 'Ten pracownik nie istnieje albo nie jest przypisany do Ciebie.',
    detailsTitle: 'Szczegóły',
    position: 'Stanowisko',
    unit: 'Komórka organizacyjna',
    hireDate: 'Data zatrudnienia',
    contractType: 'Rodzaj umowy',
    status: 'Status oceny',
    nextDue: 'Termin następnej oceny',
    lastAssessment: 'Ostatnia ocena',
    noAssessment: 'Brak, pracownik czeka na pierwszą ocenę',
    result: { positive: 'pozytywna', negative: 'negatywna' },
    documentTitle: 'Aktualny opis stanowiska',
    noDocument: 'Brak wgranego opisu stanowiska.',
    version: (v: number) => `wersja ${v}`,
    uploadedAt: 'Wgrano',
    nextStage: 'Historia ocen, notatki i tworzenie oceny okresowej pojawią się w kolejnym etapie.',
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
    mockLabel: 'dane przykładowe',
    mockLabelTitle: 'Odpowiedź z makiety, nie z dokumentów urzędu',
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
