/** Shapes returned by the three endpoints the console aggregates. */

export type NodeStatus = 'healthy' | 'degraded' | 'offline'

/** GET /api/nodes — changes rarely (fleet inventory + config). */
export interface FleetNode {
  id: string
  name: string
  region: string
  status: NodeStatus
  maxCalls: number
  transcodingEnabled: boolean
}

/** GET /api/telemetry — changes constantly (live counters, ~10 Hz). */
export interface TelemetrySample {
  nodeId: string
  timestamp: number
  activeCalls: number
  cpuPercent: number
  packetLossPercent: number
}

/** GET /api/alerts — changes occasionally. */
export interface Alert {
  id: string
  nodeId: string
  severity: 'warning' | 'critical'
  message: string
  raisedAt: number
}

/** One node with its live telemetry merged in — what the UI actually renders. */
export interface NodeView extends FleetNode {
  activeCalls: number
  cpuPercent: number
  packetLossPercent: number
  utilisation: number
  alertCount: number
}
