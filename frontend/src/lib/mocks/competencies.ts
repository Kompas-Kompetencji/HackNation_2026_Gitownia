/**
 * Model kompetencji w KSZTAŁCIE ODPOWIEDZI BACKENDU (GET /competencies).
 *
 * Plik data/competency_model.json to kopia backend/data/processed/competency_model.json
 * z gałęzi feature/backend-m1-rules-engine (wygenerowany z Model_kompetencji.xlsx):
 * 14 kompetencji, 49 wskaźników behawioralnych, opisy pięciu poziomów. Wskaźniki są prawdziwe,
 * nie przykładowe. Mapowanie na kontrakt frontendu (CompetencyModel) robi api.ts.
 */
import raw from './data/competency_model.json'

export interface BackendCompetencyModel {
  version: string
  /** Skala ocen z etykietami (GET /competencies); w kopii makiety może jej nie być. */
  rating_scale?: Array<{ score: number; key: string; label: string }>
  competencies: Array<{
    id: number
    name: string
    mandatory_for_B?: boolean
    mandatory_for_C?: boolean
    mandatory_for_first_eval?: boolean
    /** Tylko przy GET /competencies?form_type=FORM_B|FORM_C|FIRST_EVAL_FORM. */
    is_mandatory_for_selected_form?: boolean
    indicators: Array<{ id: string; indicator: string; levels: Record<string, string> }>
  }>
}

export const mockCompetencyModelRaw: BackendCompetencyModel = raw
