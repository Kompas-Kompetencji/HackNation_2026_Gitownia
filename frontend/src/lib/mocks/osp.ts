import type { OspAnalysis } from '../../types'

/**
 * Makieta analizy opisu stanowiska pracy: wynik zależy wyłącznie od nazwy pliku.
 * Nazwa zawiera „naczelnik" → arkusz B, w pozostałych przypadkach arkusz C.
 * Nazwa zawiera „uszkodzony" → błąd analizy (do sprawdzania stanu błędu wgrania).
 * criterion_id kryteriów dodatkowych = competency_id z modelu kompetencji (np. "C10").
 */
export function mockAnalyzeOsp(filename: string): OspAnalysis {
  const name = filename.toLowerCase()

  if (name.includes('uszkodzony')) {
    throw new Error('Makieta: nie udało się odczytać pliku')
  }

  if (name.includes('naczelnik')) {
    return {
      filename,
      position_title: 'Naczelnik wydziału',
      organizational_unit: 'Wydział Obsługi Interesantów',
      has_management_duties: true,
      subordinates_count: 12,
      suggested_form: 'B',
      additional_criteria: [
        { criterion_id: 'C12', name: 'Zarządzanie strategiczne', rationale: 'Do obowiązków należy planowanie rocznych celów wydziału i ich rozliczanie.' },
        { criterion_id: 'C11', name: 'Radzenie sobie w sytuacjach kryzysowych', rationale: 'Wydział zapewnia ciągłość obsługi interesantów przy awariach i nagłych brakach obsady.' },
        { criterion_id: 'C10', name: 'Orientacja na klienta/interesanta', rationale: 'Wydział odpowiada za bezpośrednią obsługę interesantów.' },
      ],
    }
  }

  if (name.includes('radca')) {
    return {
      filename,
      position_title: 'Radca',
      organizational_unit: 'Wydział Prawny',
      has_management_duties: false,
      subordinates_count: 0,
      suggested_form: 'C',
      additional_criteria: [
        { criterion_id: 'C07', name: 'Myślenie analityczne', rationale: 'Stanowisko obejmuje opiniowanie projektów aktów prawnych.' },
        { criterion_id: 'C08', name: 'Negocjowanie', rationale: 'Opis wymaga uzgadniania stanowiska urzędu z innymi resortami.' },
        { criterion_id: 'C09', name: 'Wystąpienia publiczne', rationale: 'Radca reprezentuje urząd na posiedzeniach komisji.' },
      ],
    }
  }

  return {
    filename,
    position_title: 'Starszy specjalista',
    organizational_unit: 'Wydział Skarg i Wniosków',
    has_management_duties: false,
    subordinates_count: 0,
    suggested_form: 'C',
    additional_criteria: [
      { criterion_id: 'C10', name: 'Orientacja na klienta/interesanta', rationale: 'Stanowisko obsługuje skargi i wnioski mieszkańców.' },
      { criterion_id: 'C07', name: 'Myślenie analityczne', rationale: 'Opis stanowiska wskazuje analizę zasadności skarg i wskazywanie ich przyczyn.' },
      { criterion_id: 'C11', name: 'Radzenie sobie w sytuacjach kryzysowych', rationale: 'Do obowiązków należą rozmowy z wzburzonymi skarżącymi.' },
    ],
  }
}
