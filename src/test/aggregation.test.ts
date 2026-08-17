/*
 * Tests for the pure aggregation logic.
 *
 * These are the interesting tests: merging and summarising is where a bug would silently
 * show an admin the wrong number, and none of it needs React to verify.
 */
import { describe, expect, it } from 'vitest'
import { mergeNodeViews, summarise } from '../hooks/useFleetData'
import type { Alert, FleetNode, TelemetrySample } from '../api/types'

const node = (id: string, over: Partial<FleetNode> = {}): FleetNode => ({
  id,
  name: `conf-${id}`,
  region: 'eu-north',
  status: 'healthy',
  maxCalls: 40,
  transcodingEnabled: true,
  ...over,
})

const sample = (nodeId: string, over: Partial<TelemetrySample> = {}): TelemetrySample => ({
  nodeId,
  timestamp: 1,
  activeCalls: 10,
  cpuPercent: 50,
  packetLossPercent: 0.1,
  ...over,
})

describe('mergeNodeViews', () => {
  it('joins telemetry onto the matching node', () => {
    const views = mergeNodeViews([node('a')], new Map([['a', sample('a', { activeCalls: 20 })]]), [])
    expect(views[0]!.activeCalls).toBe(20)
    expect(views[0]!.utilisation).toBe(0.5)
  })

  it('keeps a node visible when its telemetry has not arrived yet', () => {
    // A node with no sample must not vanish from the table — an admin needs to see that
    // it exists and is reporting nothing.
    const views = mergeNodeViews([node('a'), node('b')], new Map([['a', sample('a')]]), [])
    expect(views).toHaveLength(2)
    expect(views[1]!.activeCalls).toBe(0)
  })

  it('counts alerts per node rather than globally', () => {
    const alerts: Alert[] = [
      { id: '1', nodeId: 'a', severity: 'warning', message: 'x', raisedAt: 0 },
      { id: '2', nodeId: 'a', severity: 'critical', message: 'y', raisedAt: 0 },
      { id: '3', nodeId: 'b', severity: 'warning', message: 'z', raisedAt: 0 },
    ]
    const views = mergeNodeViews([node('a'), node('b')], new Map(), alerts)
    expect(views[0]!.alertCount).toBe(2)
    expect(views[1]!.alertCount).toBe(1)
  })

  it('does not divide by zero when a node reports no capacity', () => {
    const views = mergeNodeViews([node('a', { maxCalls: 0 })], new Map(), [])
    expect(views[0]!.utilisation).toBe(0)
  })
})

describe('summarise', () => {
  it('sums calls and averages CPU across reporting nodes only', () => {
    // The offline node contributes zeroes; including it in the mean would drag the
    // fleet CPU figure down and hide a real problem.
    const point = summarise([
      sample('a', { activeCalls: 10, cpuPercent: 60 }),
      sample('b', { activeCalls: 30, cpuPercent: 80 }),
      sample('c', { activeCalls: 0, cpuPercent: 0 }),
    ])
    expect(point.totalCalls).toBe(40)
    expect(point.meanCpu).toBe(70)
  })

  it('reports the worst packet loss, not the average', () => {
    const point = summarise([
      sample('a', { packetLossPercent: 0.1 }),
      sample('b', { packetLossPercent: 3.4 }),
    ])
    expect(point.worstLoss).toBe(3.4)
  })

  it('survives an empty frame', () => {
    expect(summarise([]).meanCpu).toBe(0)
  })
})
