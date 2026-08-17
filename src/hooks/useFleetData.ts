/*
 * Aggregating three endpoints that update at different rates, without melting the UI.
 *
 * The problem: telemetry arrives ~10x per second. Calling setState on every sample
 * re-renders the whole subtree 10x per second, and with a chart in it that is enough to
 * drop frames on a laptop. But throwing samples away loses the history the chart needs.
 *
 * The approach: samples land in a ref (no render), and a timer flushes the buffer into
 * state at a fixed, human-perceptible rate. Ingest stays at full resolution; render rate
 * is decoupled from it and bounded. Same trick as decoupling simulation tick from frame
 * rate in a real-time system, which is where I first ran into it.
 *
 * Each endpoint also owns its own error state. If /alerts is down, the rest of the
 * console keeps working — a shared `error` flag would blank a page over one bad service.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchAlerts, fetchNodes, fetchTelemetry, patchNode as patchNodeImpl } from '../api/mockServer'
import type { Alert, FleetNode, NodeView, TelemetrySample } from '../api/types'

/** How often each source is polled, in ms. Telemetry is the fast one. */
export const POLL_MS = { nodes: 15_000, telemetry: 100, alerts: 10_000 } as const
/** How often buffered telemetry is flushed into React state. */
export const FLUSH_MS = 500
/** Points retained for the throughput chart. */
export const HISTORY_LENGTH = 60

export interface ThroughputPoint {
  t: number
  totalCalls: number
  meanCpu: number
  worstLoss: number
}

type Health = 'loading' | 'ok' | 'error'

/**
 * Merge inventory + latest telemetry + alert counts into the rows the table renders.
 * Pure and exported so it can be tested without mounting a component.
 */
export function mergeNodeViews(
  nodes: FleetNode[],
  latest: Map<string, TelemetrySample>,
  alerts: Alert[],
): NodeView[] {
  const alertsByNode = new Map<string, number>()
  for (const a of alerts) alertsByNode.set(a.nodeId, (alertsByNode.get(a.nodeId) ?? 0) + 1)

  return nodes.map((node) => {
    const t = latest.get(node.id)
    const activeCalls = t?.activeCalls ?? 0
    return {
      ...node,
      activeCalls,
      cpuPercent: t?.cpuPercent ?? 0,
      packetLossPercent: t?.packetLossPercent ?? 0,
      utilisation: node.maxCalls > 0 ? activeCalls / node.maxCalls : 0,
      alertCount: alertsByNode.get(node.id) ?? 0,
    }
  })
}

/** Collapse one telemetry frame into a single chart point. */
export function summarise(samples: TelemetrySample[]): ThroughputPoint {
  const live = samples.filter((s) => s.activeCalls > 0 || s.cpuPercent > 0)
  const meanCpu = live.length
    ? Math.round(live.reduce((acc, s) => acc + s.cpuPercent, 0) / live.length)
    : 0
  return {
    t: Date.now(),
    totalCalls: samples.reduce((acc, s) => acc + s.activeCalls, 0),
    meanCpu,
    worstLoss: samples.reduce((acc, s) => Math.max(acc, s.packetLossPercent), 0),
  }
}

export function useFleetData() {
  const [nodes, setNodes] = useState<FleetNode[]>([])
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [latest, setLatest] = useState<Map<string, TelemetrySample>>(new Map())
  const [history, setHistory] = useState<ThroughputPoint[]>([])
  const [health, setHealth] = useState<Record<'nodes' | 'telemetry' | 'alerts', Health>>({
    nodes: 'loading',
    telemetry: 'loading',
    alerts: 'loading',
  })

  // Buffer: written on every poll, read only by the flush timer. Writing a ref does not
  // schedule a render, which is the entire point.
  const buffer = useRef<TelemetrySample[] | null>(null)
  const droppedFrames = useRef(0)

  useEffect(() => {
    let alive = true

    const loadNodes = async () => {
      try {
        const data = await fetchNodes()
        if (!alive) return
        setNodes(data)
        setHealth((h) => ({ ...h, nodes: 'ok' }))
      } catch {
        if (alive) setHealth((h) => ({ ...h, nodes: 'error' }))
      }
    }

    const loadAlerts = async () => {
      try {
        const data = await fetchAlerts()
        if (!alive) return
        setAlerts(data)
        setHealth((h) => ({ ...h, alerts: 'ok' }))
      } catch {
        if (alive) setHealth((h) => ({ ...h, alerts: 'error' }))
      }
    }

    const pollTelemetry = async () => {
      try {
        const samples = await fetchTelemetry()
        if (!alive) return
        // Overwriting an unflushed buffer means the UI never saw that frame. Counting it
        // makes the trade-off visible instead of silent.
        if (buffer.current) droppedFrames.current += 1
        buffer.current = samples
        setHealth((h) => (h.telemetry === 'ok' ? h : { ...h, telemetry: 'ok' }))
      } catch {
        if (alive) setHealth((h) => ({ ...h, telemetry: 'error' }))
      }
    }

    const flush = () => {
      const samples = buffer.current
      if (!samples) return
      buffer.current = null
      setLatest(new Map(samples.map((s) => [s.nodeId, s])))
      setHistory((prev) => {
        const next = [...prev, summarise(samples)]
        return next.length > HISTORY_LENGTH ? next.slice(next.length - HISTORY_LENGTH) : next
      })
    }

    void loadNodes()
    void loadAlerts()
    void pollTelemetry()

    const timers = [
      setInterval(loadNodes, POLL_MS.nodes),
      setInterval(loadAlerts, POLL_MS.alerts),
      setInterval(pollTelemetry, POLL_MS.telemetry),
      setInterval(flush, FLUSH_MS),
    ]

    return () => {
      alive = false
      timers.forEach(clearInterval)
    }
  }, [])

  /**
   * Optimistic config write: paint the new value immediately, roll back if the server
   * rejects it. An admin toggling a setting should not wait 300ms to see a checkbox move,
   * but they must never be left believing a change landed when it did not.
   */
  const updateNode = useCallback(
    // `patchFn` is injectable so a test can supply a failing writer.
    async (id: string, patch: Partial<FleetNode>, patchFn = patchNodeImpl) => {
      const before = nodes
      setNodes((prev) => prev.map((n) => (n.id === id ? { ...n, ...patch } : n)))
      try {
        const saved = await patchFn(id, patch)
        setNodes((prev) => prev.map((n) => (n.id === id ? saved : n)))
        return { ok: true as const }
      } catch (err) {
        setNodes(before)
        return { ok: false as const, message: (err as Error).message }
      }
    },
    [nodes],
  )

  return {
    nodes,
    alerts,
    health,
    history,
    views: mergeNodeViews(nodes, latest, alerts),
    droppedFrames: droppedFrames.current,
    updateNode,
  }
}
