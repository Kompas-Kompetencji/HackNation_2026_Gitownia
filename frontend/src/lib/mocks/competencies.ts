import type { AssessmentForm, CompetencyModel } from '../../types'

/**
 * Przykładowy model czternastu kompetencji (dane fikcyjne, do podmiany na odpowiedź backendu).
 * Każda kompetencja ma dwa wskaźniki behawioralne.
 */
const definitions: Array<{ name: string; definition: string; forms: AssessmentForm[]; indicators: [string, string] }> = [
  { name: 'Zorientowanie na osiąganie celów', definition: 'Planowanie i realizowanie zadań tak, by przynosiły zamierzony efekt w wyznaczonym terminie.', forms: ['B', 'C'], indicators: ['Ustala kolejność zadań według ich wagi i terminów.', 'Doprowadza sprawy do końca mimo przeszkód.'] },
  { name: 'Rzetelność i terminowość', definition: 'Wykonywanie obowiązków dokładnie, zgodnie z przepisami i w ustalonym czasie.', forms: ['B', 'C'], indicators: ['Sprawdza poprawność dokumentów przed przekazaniem dalej.', 'Informuje z wyprzedzeniem o ryzyku przekroczenia terminu.'] },
  { name: 'Komunikacja', definition: 'Przekazywanie informacji jasno, zrozumiale i z uwzględnieniem odbiorcy.', forms: ['B', 'C'], indicators: ['Pisze pisma zrozumiałe dla osób spoza urzędu.', 'Upewnia się, że rozmówca zrozumiał przekazaną informację.'] },
  { name: 'Współpraca', definition: 'Działanie z innymi na rzecz wspólnego celu i dzielenie się wiedzą.', forms: ['B', 'C'], indicators: ['Udostępnia współpracownikom potrzebne informacje bez ponaglania.', 'Szuka rozwiązań akceptowalnych dla wszystkich stron.'] },
  { name: 'Zorientowanie na obywatela', definition: 'Uwzględnianie potrzeb obywateli i interesantów w codziennej pracy.', forms: ['B', 'C'], indicators: ['Wyjaśnia interesantowi kolejne kroki postępowania.', 'Proponuje usprawnienia obsługi na podstawie zgłoszeń obywateli.'] },
  { name: 'Myślenie analityczne', definition: 'Zbieranie i porządkowanie informacji oraz wyciąganie z nich trafnych wniosków.', forms: ['B', 'C'], indicators: ['Wskazuje przyczyny problemu, a nie tylko jego objawy.', 'Opiera wnioski na sprawdzonych danych.'] },
  { name: 'Rozwiązywanie problemów', definition: 'Znajdowanie skutecznych rozwiązań w sytuacjach nietypowych.', forms: ['B', 'C'], indicators: ['Proponuje więcej niż jedno rozwiązanie z oceną skutków.', 'Działa samodzielnie w granicach swoich uprawnień.'] },
  { name: 'Zarządzanie informacją', definition: 'Wyszukiwanie, ocena i przekazywanie informacji właściwym osobom.', forms: ['B', 'C'], indicators: ['Prowadzi dokumentację tak, by inni mogli ją przejąć.', 'Chroni informacje zgodnie z ich klauzulą.'] },
  { name: 'Etyka i bezstronność', definition: 'Postępowanie zgodne z zasadami służby publicznej i bez stronniczości.', forms: ['B', 'C'], indicators: ['Zgłasza sytuacje mogące rodzić konflikt interesów.', 'Traktuje strony postępowania jednakowo.'] },
  { name: 'Odporność na stres', definition: 'Zachowanie skuteczności w sytuacjach presji czasu i napięcia.', forms: ['B', 'C'], indicators: ['Zachowuje spokój w rozmowie z wzburzonym interesantem.', 'Utrzymuje jakość pracy przy zwiększonej liczbie spraw.'] },
  { name: 'Kierowanie ludźmi', definition: 'Wyznaczanie kierunku pracy zespołu i wspieranie jego członków.', forms: ['B'], indicators: ['Jasno przydziela zadania i odpowiedzialność.', 'Udziela pracownikom regularnej informacji zwrotnej.'] },
  { name: 'Podejmowanie decyzji', definition: 'Wybieranie rozwiązań w odpowiednim czasie i branie za nie odpowiedzialności.', forms: ['B'], indicators: ['Podejmuje decyzje mimo niepełnych informacji, gdy wymaga tego termin.', 'Uzasadnia decyzje zespołowi.'] },
  { name: 'Zarządzanie zasobami', definition: 'Racjonalne wykorzystanie ludzi, czasu i budżetu jednostki.', forms: ['B'], indicators: ['Planuje obsadę z uwzględnieniem urlopów i zastępstw.', 'Kontroluje wykorzystanie środków w ciągu roku.'] },
  { name: 'Zarządzanie zmianą', definition: 'Wprowadzanie zmian organizacyjnych w sposób zrozumiały dla zespołu.', forms: ['B'], indicators: ['Wyjaśnia zespołowi cel i harmonogram zmiany.', 'Reaguje na trudności zgłaszane w czasie wdrażania.'] },
]

export const mockCompetencyModel: CompetencyModel = {
  version: 'makieta-2026-11',
  competencies: definitions.map((d, i) => {
    const competency_id = `K${String(i + 1).padStart(2, '0')}`
    return {
      competency_id,
      name: d.name,
      definition: d.definition,
      forms: d.forms,
      indicators: d.indicators.map((description, j) => ({
        indicator_id: `${competency_id}-W${j + 1}`,
        competency_id,
        description,
      })),
    }
  }),
}
