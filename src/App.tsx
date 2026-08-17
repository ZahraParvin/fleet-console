import { useMemo, useState } from 'react'
import { Card, StatTile } from './ui'
import { NodeTable } from './features/NodeTable'
import { ThroughputChart } from './features/ThroughputChart'
import { ConfigPanel } from './features/ConfigPanel'
import { useFleetData } from './hooks/useFleetData'

export default function App() {
  const { views, nodes, alerts, health, history, updateNode } = useFleetData()
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const selected = useMemo(() => nodes.find((n) => n.id === selectedId) ?? null, [nodes, selectedId])

  const totals = useMemo(() => {
    const calls = views.reduce((acc, v) => acc + v.activeCalls, 0)
    const capacity = views.reduce((acc, v) => acc + (v.status === 'offline' ? 0 : v.maxCalls), 0)
    const worstLoss = views.reduce((acc, v) => Math.max(acc, v.packetLossPercent), 0)
    return {
      calls,
      utilisation: capacity ? Math.round((calls / capacity) * 100) : 0,
      offline: views.filter((v) => v.status === 'offline').length,
      worstLoss,
    }
  }, [views])

  return (
    <div style={{ maxWidth: 1180, margin: '0 auto', padding: 'var(--space-5)' }}>
      {/* A skip link is the single highest-value accessibility feature on a dense page. */}
      <a
        href="#main"
        style={{
          position: 'absolute',
          left: -9999,
          top: 8,
        }}
        onFocus={(e) => Object.assign(e.currentTarget.style, { left: '8px', background: 'var(--surface-raised)', padding: '8px', borderRadius: '8px' })}
        onBlur={(e) => Object.assign(e.currentTarget.style, { left: '-9999px' })}
      >
        Skip to main content
      </a>

      <header style={{ marginBottom: 'var(--space-5)' }}>
        <h1 style={{ margin: 0, fontSize: 'var(--text-xl)' }}>Fleet Console</h1>
        <p style={{ color: 'var(--muted)', margin: '4px 0 0' }}>
          Configuration and analytics for a fleet of conferencing nodes.
        </p>
      </header>

      <main id="main" style={{ display: 'grid', gap: 'var(--space-4)' }}>
        <section aria-label="Fleet summary" style={{ display: 'grid', gap: 'var(--space-3)', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
          <StatTile label="Active calls" value={totals.calls} />
          <StatTile label="Capacity used" value={totals.utilisation} unit="%" />
          <StatTile
            label="Worst packet loss"
            value={totals.worstLoss.toFixed(2)}
            unit="%"
            tone={totals.worstLoss > 1 ? 'warn' : 'ok'}
          />
          <StatTile
            label="Nodes offline"
            value={totals.offline}
            tone={totals.offline > 0 ? 'danger' : 'ok'}
          />
        </section>

        <Card
          title="Throughput"
          action={
            <span style={{ color: 'var(--muted)', fontSize: 'var(--text-sm)' }}>
              {health.telemetry === 'error' ? 'telemetry unavailable' : 'live · 500 ms'}
            </span>
          }
        >
          <ThroughputChart data={history} />
        </Card>

        <div style={{ display: 'grid', gap: 'var(--space-4)', gridTemplateColumns: 'minmax(0, 2fr) minmax(280px, 1fr)' }}>
          <Card title="Nodes">
            {health.nodes === 'error' ? (
              <p role="alert" style={{ color: 'var(--danger)', margin: 0 }}>
                Could not load the fleet inventory.
              </p>
            ) : (
              <NodeTable views={views} selectedId={selectedId} onSelect={setSelectedId} loading={health.nodes === 'loading'} />
            )}
          </Card>

          <div style={{ display: 'grid', gap: 'var(--space-4)', alignContent: 'start' }}>
            <ConfigPanel node={selected} onUpdate={updateNode} />
            <Card title={`Alerts (${alerts.length})`}>
              {health.alerts === 'error' ? (
                <p style={{ color: 'var(--muted)', margin: 0 }}>Alert service unavailable.</p>
              ) : alerts.length === 0 ? (
                <p style={{ color: 'var(--muted)', margin: 0 }}>No active alerts.</p>
              ) : (
                <ul style={{ margin: 0, paddingLeft: 'var(--space-4)', display: 'grid', gap: 'var(--space-2)' }}>
                  {alerts.map((a) => (
                    <li key={a.id}>
                      <strong style={{ color: a.severity === 'critical' ? 'var(--danger)' : 'var(--warn)' }}>
                        {a.severity}
                      </strong>{' '}
                      <span style={{ color: 'var(--muted)' }}>{a.nodeId}</span>
                      <div>{a.message}</div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </div>
      </main>
    </div>
  )
}
