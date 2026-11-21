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
  competencies: Array<{
    id: number
    name: string
    indicators: Array<{ id: string; indicator: string; levels: Record<string, string> }>
  }>
}

export const mockCompetencyModelRaw: BackendCompetencyModel = raw
