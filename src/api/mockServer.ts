/*
 * A fake backend, in-process.
 *
 * Real admin consoles talk to several services that update at wildly different rates:
 * inventory changes daily, telemetry changes ten times a second, alerts come and go.
 * This module reproduces that so the front-end problem is honest — including latency
 * and the fact that one endpoint can fail while the others are fine.
 *
 * Swap this for `fetch` against a real service and nothing above it has to change.
 */
import type { Alert, FleetNode, TelemetrySample } from './types'

const REGIONS = ['eu-north', 'eu-west', 'us-east', 'ap-south'] as const

const nodes: FleetNode[] = Array.from({ length: 12 }, (_, i) => ({
  id: `node-${String(i + 1).padStart(2, '0')}`,
  name: `conf-${REGIONS[i % REGIONS.length]}-${Math.floor(i / REGIONS.length) + 1}`,
  region: REGIONS[i % REGIONS.length]!,
  status: i === 7 ? 'offline' : i === 3 || i === 9 ? 'degraded' : 'healthy',
  maxCalls: 40 + (i % 3) * 20,
  transcodingEnabled: i % 2 === 0,
}))

/** Deterministic pseudo-random so charts look alive but tests stay reproducible. */
function wobble(seed: number, spread: number): number {
  const x = Math.sin(seed) * 10000
  return (x - Math.floor(x)) * spread
}

let tick = 0

/** Simulated network latency, so loading states are real rather than theoretical. */
function delay<T>(value: T, ms: number): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms))
}

export function fetchNodes(): Promise<FleetNode[]> {
  return delay(nodes.map((n) => ({ ...n })), 120)
}

export function fetchTelemetry(): Promise<TelemetrySample[]> {
  tick += 1
  const now = Date.now()
  const samples = nodes.map((node, i) => {
    if (node.status === 'offline') {
      return { nodeId: node.id, timestamp: now, activeCalls: 0, cpuPercent: 0, packetLossPercent: 0 }
    }
    const base = node.status === 'degraded' ? 0.75 : 0.45
    return {
      nodeId: node.id,
      timestamp: now,
      activeCalls: Math.round(node.maxCalls * base + wobble(tick + i, 8) - 4),
      cpuPercent: Math.min(99, Math.round(base * 100 + wobble(tick * 1.3 + i, 14) - 7)),
      packetLossPercent: node.status === 'degraded'
        ? Number((1.2 + wobble(tick + i, 1.4)).toFixed(2))
        : Number((wobble(tick + i, 0.35)).toFixed(2)),
    }
  })
  return delay(samples, 60)
}

export function fetchAlerts(): Promise<Alert[]> {
  const now = Date.now()
  const alerts: Alert[] = nodes
    .filter((n) => n.status !== 'healthy')
    .map((n, i) => ({
      id: `alert-${n.id}`,
      nodeId: n.id,
      severity: n.status === 'offline' ? 'critical' : 'warning',
      message: n.status === 'offline'
        ? 'Node unreachable — no heartbeat for 90s'
        : 'Packet loss above 1% for 5 minutes',
      raisedAt: now - (i + 1) * 420_000,
    }))
  return delay(alerts, 200)
}

/**
 * PATCH /api/nodes/:id — deliberately fails for one node so the optimistic-update
 * rollback path is exercised rather than assumed.
 */
export function patchNode(id: string, patch: Partial<FleetNode>): Promise<FleetNode> {
  const node = nodes.find((n) => n.id === id)
  if (!node) return Promise.reject(new Error(`Unknown node ${id}`))
  if (node.status === 'offline') {
    return new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Node is offline — configuration not applied')), 400),
    )
  }
  Object.assign(node, patch)
  return delay({ ...node }, 300)
}
