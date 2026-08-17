/*
 * Configuration management for one node.
 *
 * Writes are optimistic: the control moves the instant it is clicked, and rolls back with
 * an announced error if the server rejects it. `node-08` is offline in the mock backend
 * and always rejects, so the failure path is a thing you can click rather than a thing I
 * claim works.
 */
import { useState } from 'react'
import { Button, Card } from '../ui'
import type { FleetNode } from '../api/types'

export function ConfigPanel({
  node,
  onUpdate,
}: {
  node: FleetNode | null
  onUpdate: (id: string, patch: Partial<FleetNode>) => Promise<{ ok: boolean; message?: string }>
}) {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  if (!node) {
    return (
      <Card title="Configuration">
        <p style={{ color: 'var(--muted)', margin: 0 }}>
          Select a node from the table to edit its configuration.
        </p>
      </Card>
    )
  }

  const apply = async (patch: Partial<FleetNode>) => {
    setPending(true)
    setError(null)
    setSaved(false)
    const result = await onUpdate(node.id, patch)
    setPending(false)
    if (result.ok) {
      setSaved(true)
      window.setTimeout(() => setSaved(false), 2500)
    } else {
      setError(result.message ?? 'Update failed')
    }
  }

  return (
    <Card title={`Configuration — ${node.name}`}>
      <div style={{ display: 'grid', gap: 'var(--space-4)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
          <input
            id="transcoding"
            type="checkbox"
            checked={node.transcodingEnabled}
            disabled={pending}
            onChange={(e) => void apply({ transcodingEnabled: e.target.checked })}
          />
          <label htmlFor="transcoding">Hardware transcoding</label>
        </div>

        <div style={{ display: 'grid', gap: 'var(--space-2)' }}>
          <label htmlFor="maxCalls">
            Maximum concurrent calls
            <span style={{ color: 'var(--muted)' }}> (currently {node.maxCalls})</span>
          </label>
          <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
            <input
              id="maxCalls"
              type="number"
              min={0}
              max={500}
              defaultValue={node.maxCalls}
              disabled={pending}
              aria-describedby="maxCalls-help"
              style={{
                font: 'inherit',
                background: 'var(--surface-raised)',
                color: 'var(--text)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius)',
                padding: 'var(--space-2)',
                width: 120,
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  void apply({ maxCalls: Number((e.target as HTMLInputElement).value) })
                }
              }}
            />
            <Button
              variant="primary"
              disabled={pending}
              onClick={() => {
                const el = document.getElementById('maxCalls') as HTMLInputElement | null
                if (el) void apply({ maxCalls: Number(el.value) })
              }}
            >
              {pending ? 'Applying…' : 'Apply'}
            </Button>
          </div>
          <p id="maxCalls-help" style={{ color: 'var(--muted)', fontSize: 'var(--text-sm)', margin: 0 }}>
            Applied immediately; rolled back if the node rejects it.
          </p>
        </div>

        {/*
          role="status" announces politely without stealing focus; role="alert" is
          assertive and interrupts, which is right for a failure the admin must notice.
        */}
        <div role="status" style={{ color: 'var(--ok)', minHeight: '1.2em' }}>
          {saved ? 'Configuration applied.' : ''}
        </div>
        {error ? (
          <div role="alert" style={{ color: 'var(--danger)' }}>
            {error}
          </div>
        ) : null}
      </div>
    </Card>
  )
}
