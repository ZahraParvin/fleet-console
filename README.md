# Fleet Console

Admin console for a fleet of video-conferencing nodes. Live telemetry, fleet-wide analytics, per-node config. React + TypeScript, no UI framework, no state library.

```
npm install
npm run dev      # http://localhost:5173
npm test         # 18 tests
npm run build
```

---

## Telemetry buffering

The core problem: telemetry arrives at 10 Hz, but calling `setState` on every sample re-renders the tree ten times a second. With a chart mounted that's enough to drop frames on a mid-range laptop. Throttling the fetch instead loses the history the chart needs.

The fix is to decouple ingest from render. Samples land in a `useRef` (writing a ref does not schedule a render), and a 500 ms timer flushes the buffer into state:

```ts
const buffer = useRef<TelemetrySample[] | null>(null)

const pollTelemetry = async () => {
  const samples = await fetchTelemetry()
  if (buffer.current) droppedFrames.current += 1   // overwrote an unflushed frame
  buffer.current = samples
}

const flush = () => {
  const samples = buffer.current
  if (!samples) return
  buffer.current = null
  setLatest(new Map(samples.map((s) => [s.nodeId, s])))
  setHistory((prev) => [...prev, summarise(samples)].slice(-HISTORY_LENGTH))
}
```

Full-resolution ingest, bounded render rate. Overwritten frames are counted rather than silently dropped.

A few other choices:

- **Each endpoint has its own error state.** If `/alerts` goes down, the alerts card shows an error and everything else keeps working. A shared `error` flag would blank the page over one bad service.
- **The node table shows a loading skeleton** while the fleet inventory fetches (~120 ms). An empty state after load distinguishes "no nodes" from "filter returned nothing".
- **Config writes are optimistic.** The control moves immediately and rolls back with an announced error if the server rejects it. `node-08` is always offline in the mock, so the failure path is something you can actually click.

## Accessibility

- Sortable columns use `<th aria-sort>` with a `<button>` inside — Tab and Enter work without any key handlers.
- Search and status filter both have `<label>` elements. A `role="status"` live region announces the result count after filtering.
- The chart is `role="img"` with a generated label, plus a visually-hidden `<table>` carrying the same data, since canvas is invisible to screen readers.
- Stat tiles use `aria-live="polite"`. Rejected writes use `role="alert"` (interrupts); successful ones use `role="status"` (doesn't).
- Skip link, `:focus-visible` rings that are never removed, `prefers-reduced-motion` respected, all colour pairs in `tokens.css` at ≥ 4.5:1 contrast.

## Testing

18 tests across two files:

- `aggregation.test.ts` — pure logic, no React. Tests the merge and summarise functions directly, since that's where a bug would silently show an admin a wrong number.
- `ui.test.tsx` — queried by role and label, never by class name. Filter tests use `waitFor` to outlast the 300 ms debounce without hardcoding timer state.

## Structure

```
src/
├── api/          mock backend + shared types
├── hooks/        useFleetData — polling, buffering, merging, optimistic writes
├── ui/           design tokens + primitives (Button, Card, StatTile, Badge)
├── features/     NodeTable (+ CSS module), ThroughputChart, ConfigPanel
└── test/
```

Swap `api/mockServer.ts` for real `fetch` calls and nothing above it changes.

## Known limits

Polling instead of WebSocket or SSE. No table virtualisation (fine up to a few hundred rows). No i18n. `useState` is enough at this scale — a larger app would want a query cache for deduplication and background refetch.
