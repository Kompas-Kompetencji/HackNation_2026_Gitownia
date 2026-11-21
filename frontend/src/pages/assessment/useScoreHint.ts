import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError, calculateScore } from '../../lib/api'
import type { IndicatorAnswer, ScoreResult } from '../../types'

export type ScoreHint =
  | { kind: 'empty' }
  | { kind: 'ready'; result: ScoreResult; calculating: boolean }
  | { kind: 'loading' }
  | { kind: 'error'; result: ScoreResult | null }
  | { kind: 'invalid'; message: string }

const DELAY_MS = 400

/**
 * Wskazówka poziomu z backendu (calculateScore) dla jednego kryterium.
 * Zapytanie idzie dopiero po krótkiej przerwie w klikaniu, a poprzedni wynik zostaje
 * na ekranie do czasu nowego, żeby liczby nie migały.
 */
export function useScoreHint(answers: IndicatorAnswer[]): { hint: ScoreHint; retry: () => void } {
  const [hint, setHint] = useState<ScoreHint>({ kind: 'empty' })
  const answersRef = useRef(answers)
  answersRef.current = answers
  const requestId = useRef(0)
  // Przeliczamy tylko przy zmianie poziomów; sam tekst przykładu nie zmienia wyniku.
  const key = answers.map((a) => `${a.indicator_id}:${a.selected_level ?? 'x'}`).join('|')

  const run = useCallback(() => {
    const current = answersRef.current
    const id = ++requestId.current
    if (current.length === 0) {
      setHint({ kind: 'empty' })
      return
    }
    setHint((h) => (h.kind === 'ready' ? { ...h, calculating: true } : { kind: 'loading' }))
    calculateScore(current)
      .then((result) => id === requestId.current && setHint({ kind: 'ready', result, calculating: false }))
      .catch((error) => {
        if (id !== requestId.current) return
        if (error instanceof ApiError && error.status === 422) setHint({ kind: 'invalid', message: error.message })
        else setHint((h) => ({ kind: 'error', result: h.kind === 'ready' ? h.result : null }))
      })
  }, [])

  useEffect(() => {
    if (answersRef.current.length === 0) {
      requestId.current++
      setHint({ kind: 'empty' })
      return
    }
    setHint((h) => (h.kind === 'ready' ? { ...h, calculating: true } : h))
    const timer = setTimeout(run, DELAY_MS)
    return () => clearTimeout(timer)
  }, [key, run])

  return { hint, retry: run }
}
