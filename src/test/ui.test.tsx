/*
 * Component tests, written the way Testing Library intends: query by the thing a user
 * perceives (role, label, text), never by class name or test id. A test that passes only
 * because of a CSS class is a test that breaks on every restyle and catches nothing.
 */
import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NodeTable } from '../features/NodeTable'
import { ConfigPanel } from '../features/ConfigPanel'
import { StatTile } from '../ui'
import type { NodeView } from '../api/types'

const view = (over: Partial<NodeView> & { id: string; name: string }): NodeView => ({
  region: 'eu-north',
  status: 'healthy',
  maxCalls: 40,
  transcodingEnabled: true,
  activeCalls: 10,
  cpuPercent: 40,
  packetLossPercent: 0.2,
  utilisation: 0.25,
  alertCount: 0,
  ...over,
})

const views = [
  view({ id: 'a', name: 'conf-alpha', activeCalls: 5, cpuPercent: 20 }),
  view({ id: 'b', name: 'conf-bravo', activeCalls: 35, cpuPercent: 90 }),
]

describe('NodeTable', () => {
  it('exposes sort state through aria-sort so a screen reader can announce it', async () => {
    render(<NodeTable views={views} selectedId={null} onSelect={() => {}} />)

    const callsHeader = screen.getByRole('columnheader', { name: /calls/i })
    expect(callsHeader).toHaveAttribute('aria-sort', 'descending')

    await userEvent.click(within(callsHeader).getByRole('button'))
    expect(callsHeader).toHaveAttribute('aria-sort', 'ascending')
  })

  it('sorts rows by the selected column', async () => {
    render(<NodeTable views={views} selectedId={null} onSelect={() => {}} />)

    // Default sort is calls descending, so bravo (35) leads.
    let rows = screen.getAllByRole('row').slice(1)
    expect(within(rows[0]!).getByRole('button', { name: /conf-/ })).toHaveTextContent('conf-bravo')

    await userEvent.click(within(screen.getByRole('columnheader', { name: /calls/i })).getByRole('button'))
    rows = screen.getAllByRole('row').slice(1)
    expect(within(rows[0]!).getByRole('button', { name: /conf-/ })).toHaveTextContent('conf-alpha')
  })

  it('is operable by keyboard alone', async () => {
    const onSelect = vi.fn()
    render(<NodeTable views={views} selectedId={null} onSelect={onSelect} />)

    // Tab past search input and status select, then through 5 sort buttons, then to
    // the first row's node button (calls descending default, so conf-bravo leads).
    await userEvent.tab() // search input
    await userEvent.tab() // status select
    await userEvent.tab() // sort: Node
    await userEvent.tab() // sort: Region
    await userEvent.tab() // sort: Calls
    await userEvent.tab() // sort: CPU %
    await userEvent.tab() // sort: Loss %
    await userEvent.tab() // first row's node button
    await userEvent.keyboard('{Enter}')

    expect(onSelect).toHaveBeenCalledOnce()
  })

  it('marks the selected row with aria-pressed', () => {
    render(<NodeTable views={views} selectedId="a" onSelect={() => {}} />)
    expect(screen.getByRole('button', { name: 'conf-alpha' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'conf-bravo' })).toHaveAttribute('aria-pressed', 'false')
  })
})

/*
 * Tests written before the search/filter implementation (task b).
 *
 * The debounce means the filter does not fire synchronously. waitFor polls until the
 * assertion passes (default 1000 ms), which is enough to outlast the 300 ms debounce
 * without coupling the test to a specific timer implementation.
 */
describe('NodeTable search and filter', () => {
  it('filters rows by name when the user types in the search box', async () => {
    render(<NodeTable views={views} selectedId={null} onSelect={() => {}} />)

    await userEvent.type(screen.getByRole('searchbox', { name: /search/i }), 'alpha')

    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'conf-bravo' })).not.toBeInTheDocument(),
    )
    expect(screen.getByRole('button', { name: 'conf-alpha' })).toBeInTheDocument()
  })

  it('announces the filtered result count in the live region', async () => {
    render(<NodeTable views={views} selectedId={null} onSelect={() => {}} />)

    await userEvent.type(screen.getByRole('searchbox', { name: /search/i }), 'bravo')

    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent('1 of 2 nodes'),
    )
  })
})

describe('ConfigPanel', () => {
  const node = {
    id: 'a',
    name: 'conf-alpha',
    region: 'eu-north',
    status: 'healthy' as const,
    maxCalls: 40,
    transcodingEnabled: false,
  }

  it('prompts for a selection when no node is chosen', () => {
    render(<ConfigPanel node={null} onUpdate={async () => ({ ok: true })} />)
    expect(screen.getByText(/select a node/i)).toBeInTheDocument()
  })

  it('sends the toggled value to the update handler', async () => {
    const onUpdate = vi.fn().mockResolvedValue({ ok: true })
    render(<ConfigPanel node={node} onUpdate={onUpdate} />)

    await userEvent.click(screen.getByLabelText(/hardware transcoding/i))
    expect(onUpdate).toHaveBeenCalledWith('a', { transcodingEnabled: true })
  })

  it('announces a rejected write through an alert region', async () => {
    const onUpdate = vi.fn().mockResolvedValue({ ok: false, message: 'Node is offline' })
    render(<ConfigPanel node={node} onUpdate={onUpdate} />)

    await userEvent.click(screen.getByLabelText(/hardware transcoding/i))
    expect(await screen.findByRole('alert')).toHaveTextContent('Node is offline')
  })

  it('confirms a successful write through a status region', async () => {
    render(<ConfigPanel node={node} onUpdate={async () => ({ ok: true })} />)
    await userEvent.click(screen.getByLabelText(/hardware transcoding/i))
    expect(await screen.findByText(/configuration applied/i)).toBeInTheDocument()
  })
})

describe('StatTile', () => {
  it('puts changing values in a polite live region', () => {
    render(<StatTile label="Active calls" value={42} />)
    const live = screen.getByText('42').parentElement
    expect(live).toHaveAttribute('aria-live', 'polite')
  })
})
