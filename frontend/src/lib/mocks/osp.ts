import type { OspAnalysis } from '../../types'

/**
 * Makieta analizy opisu stanowiska pracy: wynik zależy wyłącznie od nazwy pliku.
 * Nazwa zawiera „naczelnik" → arkusz B, w pozostałych przypadkach arkusz C.
 * Nazwa zawiera „uszkodzony" → błąd analizy (do sprawdzania stanu błędu wgrania).
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
        { criterion_id: 'KD-01', name: 'Kierowanie ludźmi', rationale: 'Opis stanowiska wymienia kierowanie zespołem dwunastu osób.' },
        { criterion_id: 'KD-02', name: 'Zarządzanie zasobami', rationale: 'Do obowiązków należy planowanie obsady stanowisk obsługi.' },
        { criterion_id: 'KD-03', name: 'Zorientowanie na obywatela', rationale: 'Wydział odpowiada za bezpośrednią obsługę interesantów.' },
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
        { criterion_id: 'KD-04', name: 'Myślenie analityczne', rationale: 'Stanowisko obejmuje opiniowanie projektów aktów prawnych.' },
        { criterion_id: 'KD-05', name: 'Komunikacja', rationale: 'Opis wymaga przygotowywania wyjaśnień dla innych komórek.' },
        { criterion_id: 'KD-06', name: 'Rzetelność i terminowość', rationale: 'Opinie prawne mają określone terminy sporządzenia.' },
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
      { criterion_id: 'KD-07', name: 'Rzetelność i terminowość', rationale: 'Opis stanowiska wskazuje rozpatrywanie skarg w terminach ustawowych.' },
      { criterion_id: 'KD-08', name: 'Komunikacja', rationale: 'Do obowiązków należy przygotowywanie odpowiedzi dla obywateli.' },
      { criterion_id: 'KD-09', name: 'Zorientowanie na obywatela', rationale: 'Stanowisko obsługuje skargi i wnioski mieszkańców.' },
    ],
  }
}
