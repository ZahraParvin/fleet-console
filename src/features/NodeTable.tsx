/*
 * The fleet table: sortable, filterable, keyboard-operable, and announced correctly.
 *
 * Sorting is done with real <th> elements carrying aria-sort, and the control is a
 * <button> inside the header rather than a click handler on the <th>. That is what makes
 * it reachable by Tab and operable by Enter/Space without writing a single key handler —
 * the platform already does it if you use the right element.
 *
 * Filtering: a debounced text search (name or region) and a status select. The debounce
 * prevents re-filtering on every keystroke; the live region tells screen-reader users
 * how many nodes survived the filter without interrupting them.
 *
 * Loading: when the fleet inventory has not arrived yet, a skeleton table gives the page
 * structure so the layout does not jump. An empty state covers the case where the fetch
 * succeeded but returned nothing, which is different from "still waiting".
 */
import { useEffect, useMemo, useState } from 'react'
import { Badge } from '../ui'
import type { NodeStatus, NodeView } from '../api/types'
import styles from './NodeTable.module.css'

type SortKey = 'name' | 'region' | 'activeCalls' | 'cpuPercent' | 'packetLossPercent'
type Direction = 'ascending' | 'descending'

const COLUMNS: { key: SortKey; label: string; numeric?: boolean }[] = [
  { key: 'name', label: 'Node' },
  { key: 'region', label: 'Region' },
  { key: 'activeCalls', label: 'Calls', numeric: true },
  { key: 'cpuPercent', label: 'CPU %', numeric: true },
  { key: 'packetLossPercent', label: 'Loss %', numeric: true },
]

const statusTone: Record<NodeStatus, 'ok' | 'warn' | 'danger'> = {
  healthy: 'ok',
  degraded: 'warn',
  offline: 'danger',
}

const SKELETON_ROWS = 5
const DEBOUNCE_MS = 300

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(id)
  }, [value, delay])
  return debounced
}

export function NodeTable({
  views,
  selectedId,
  onSelect,
  loading = false,
}: {
  views: NodeView[]
  selectedId: string | null
  onSelect: (id: string) => void
  loading?: boolean
}) {
  const [sort, setSort] = useState<{ key: SortKey; direction: Direction }>({
    key: 'activeCalls',
    direction: 'descending',
  })
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<NodeStatus | 'all'>('all')
  const debouncedSearch = useDebounce(search, DEBOUNCE_MS)

  const rows = useMemo(() => {
    const q = debouncedSearch.toLowerCase()
    return [...views]
      .sort((a, b) => {
        const x = a[sort.key]
        const y = b[sort.key]
        const cmp =
          typeof x === 'number' && typeof y === 'number'
            ? x - y
            : String(x).localeCompare(String(y))
        return sort.direction === 'ascending' ? cmp : -cmp
      })
      .filter((n) => {
        const matchesText =
          !q || n.name.toLowerCase().includes(q) || n.region.toLowerCase().includes(q)
        const matchesStatus = statusFilter === 'all' || n.status === statusFilter
        return matchesText && matchesStatus
      })
  }, [views, sort, debouncedSearch, statusFilter])

  const toggle = (key: SortKey) =>
    setSort((prev) =>
      prev.key === key
        ? { key, direction: prev.direction === 'ascending' ? 'descending' : 'ascending' }
        : { key, direction: key === 'name' || key === 'region' ? 'ascending' : 'descending' },
    )

  const isFiltering = debouncedSearch !== '' || statusFilter !== 'all'

  if (loading) {
    return (
      <table className={styles.table} aria-busy="true" aria-label="Loading nodes…">
        <thead>
          <tr>
            {COLUMNS.map((col) => (
              <th
                key={col.key}
                scope="col"
                className={`${styles.th}${col.numeric ? ` ${styles.thNumeric}` : ''}`}
              >
                {col.label}
              </th>
            ))}
            <th scope="col" className={styles.th}>Status</th>
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: SKELETON_ROWS }, (_, i) => (
            <tr key={i}>
              {Array.from({ length: COLUMNS.length + 1 }, (_, j) => (
                <td key={j} className={styles.td}>
                  <span
                    className={styles.skeleton}
                    style={{ width: `${50 + ((i * 13 + j * 7) % 40)}%` }}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    )
  }

  return (
    <>
      <div className={styles.controls}>
        <div className={styles.controlGroup}>
          <label htmlFor="node-search" className={styles.label}>Search</label>
          <input
            id="node-search"
            type="search"
            className={styles.input}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Name or region…"
          />
        </div>
        <div className={styles.controlGroup}>
          <label htmlFor="status-filter" className={styles.label}>Status</label>
          <select
            id="status-filter"
            className={styles.select}
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as NodeStatus | 'all')}
          >
            <option value="all">All</option>
            <option value="healthy">Healthy</option>
            <option value="degraded">Degraded</option>
            <option value="offline">Offline</option>
          </select>
        </div>
        {/* aria-live sits on a persistent wrapper so content changes are announced. */}
        <div
          role="status"
          aria-live="polite"
          aria-atomic="true"
          className={styles.resultCount}
        >
          {isFiltering ? `${rows.length} of ${views.length} nodes` : `${views.length} nodes`}
        </div>
      </div>

      {rows.length === 0 ? (
        <p className={styles.emptyState}>
          {isFiltering ? 'No nodes match the current filter.' : 'No nodes in the fleet.'}
        </p>
      ) : (
        <table className={styles.table}>
          <caption className="visually-hidden">
            Conferencing nodes with live call, CPU and packet loss figures. Select a row to edit its
            configuration.
          </caption>
          <thead>
            <tr>
              {COLUMNS.map((col) => {
                const active = sort.key === col.key
                return (
                  <th
                    key={col.key}
                    scope="col"
                    aria-sort={active ? sort.direction : 'none'}
                    className={`${styles.th}${col.numeric ? ` ${styles.thNumeric}` : ''}`}
                  >
                    <button
                      type="button"
                      onClick={() => toggle(col.key)}
                      className={`${styles.sortButton}${active ? ` ${styles.sortButtonActive}` : ''}`}
                    >
                      {col.label}
                      <span aria-hidden="true">
                        {active ? (sort.direction === 'ascending' ? ' ↑' : ' ↓') : ''}
                      </span>
                    </button>
                  </th>
                )
              })}
              <th scope="col" className={styles.th}>Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((n) => {
              const selected = n.id === selectedId
              return (
                <tr key={n.id} className={selected ? styles.rowSelected : undefined}>
                  <th scope="row" className={styles.rowHeader}>
                    <button
                      type="button"
                      onClick={() => onSelect(n.id)}
                      aria-pressed={selected}
                      className={styles.nodeButton}
                    >
                      {n.name}
                    </button>
                  </th>
                  <td className={`${styles.td} ${styles.muted}`}>{n.region}</td>
                  <td className={`${styles.td} ${styles.tdNumeric}`}>
                    {n.activeCalls}
                    <span className={styles.muted}>/{n.maxCalls}</span>
                  </td>
                  <td className={`${styles.td} ${styles.tdNumeric}`}>{n.cpuPercent}</td>
                  <td className={`${styles.td} ${styles.tdNumeric}`}>
                    {n.packetLossPercent.toFixed(2)}
                  </td>
                  <td className={styles.td}>
                    <Badge tone={statusTone[n.status]}>{n.status}</Badge>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </>
  )
}
