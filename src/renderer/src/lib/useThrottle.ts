import { useEffect, useRef } from 'react'

/**
 * Returns a stable function that invokes `fn` at most once per `waitMs`.
 * Calls during the cooldown are coalesced into a single trailing call.
 */
export function useThrottledCallback(fn: () => void, waitMs: number): () => void {
  const lastRunRef = useRef(0)
  const trailingRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const fnRef = useRef(fn)
  fnRef.current = fn

  useEffect(
    () => () => {
      if (trailingRef.current) clearTimeout(trailingRef.current)
    },
    []
  )

  return () => {
    const now = Date.now()
    const elapsed = now - lastRunRef.current
    if (elapsed >= waitMs) {
      lastRunRef.current = now
      fnRef.current()
      return
    }
    if (trailingRef.current) return
    trailingRef.current = setTimeout(() => {
      trailingRef.current = null
      lastRunRef.current = Date.now()
      fnRef.current()
    }, waitMs - elapsed)
  }
}
