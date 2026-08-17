# Fleet Console

An admin console for a fleet of video-conferencing nodes: live analytics and
configuration management in one place. React + TypeScript, no UI framework, no state
library.

The interesting problem here is not the layout. It is that the three data sources update
at completely different rates — inventory every 15 seconds, alerts every 10, telemetry
**ten times a second** — and the UI has to stay responsive while aggregating all three.

```
npm install
npm run dev      # http://localhost:5173
npm test         # 18 tests
npm run build
```

---

## The one decision worth reading

Telemetry arrives at 10 Hz. The naive version calls `setState` on every sample, which
re-renders the tree ten times a second; with a chart mounted that is enough to drop
frames. Throttling the *fetch* instead loses history the chart needs.

So ingest and render are decoupled. Samples land in a `useRef` — writing a ref does not
schedule a render — and a 500 ms timer flushes the buffer into state:

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

Full-resolution ingest, bounded render rate, and dropped frames are *counted* rather than
silently discarded. It is the same separation as decoupling a simulation tick from a
frame rate in a real-time system.

The other deliberate choice: **each endpoint owns its error state**. If `/alerts` is down,
the alerts card says so and the rest of the console keeps working. A single shared `error`
flag would blank the whole page over one bad service.

The node table shows a **loading skeleton** for the first ~120 ms before the fleet
inventory arrives, so the page has structure instead of nothing. Once loaded, an empty
state distinguishes "no nodes in the fleet" from "filter returned nothing".

Config writes are **optimistic with rollback** — the control moves immediately, and reverts
with an announced error if the server rejects it. `node-08` is offline in the mock backend
and always rejects, so the failure path is something you can click rather than something I
claim works.

## Accessibility

Not a pass at the end; built in.

- Sortable columns are real `<th>` elements with `aria-sort`, and the control inside each
  is a `<button>` — so Tab and Enter work without a single key handler, because the
  platform already does it.
- The node table has a debounced text search (name or region) and a status filter. Both
  controls have explicit `<label>` elements. A `role="status"` live region announces the
  narrowed count ("1 of 12 nodes") without interrupting what the screen reader was saying.
- The chart is `role="img"` with a generated summary label, plus a visually-hidden `<table>`
  carrying the same data. Canvas is invisible to a screen reader; the table is not.
- Changing figures sit in `aria-live="polite"` regions; a rejected write uses `role="alert"`
  so it interrupts, a successful one uses `role="status"` so it does not.
- Skip link, visible `:focus-visible` rings that are never removed, `prefers-reduced-motion`
  honoured, and every colour pair in `tokens.css` checked at ≥ 4.5:1.

## Design tokens

Every colour, space and type value lives in `src/styles/tokens.css`. Components read tokens
and never hard-code a value, and each primitive forwards unknown props to its underlying
element so a caller can always add an `aria-*` attribute the library did not anticipate.
That last part is the difference between a design system and a cage.

## Testing

18 tests, split by what they are actually for:

- `aggregation.test.ts` — the merge and summarise logic, pure, no React. This is where a
  bug would silently show an admin a wrong number: a node whose telemetry has not arrived
  must not vanish from the table, an offline node must not drag the fleet CPU mean down,
  packet loss is a worst-case not an average.
- `ui.test.tsx` — queried by role and label, never by class name or test id. A test that
  passes because of a CSS class breaks on every restyle and catches nothing. Includes
  filter tests that use `waitFor` to outlast the debounce without coupling to a specific
  timer implementation.

CI runs typecheck, tests and build on every push.

## Structure

```
src/
├── api/          mock backend + shared types
├── hooks/        useFleetData — polling, buffering, merging, optimistic writes
├── ui/           design tokens + primitives (Button, Card, StatTile, Badge)
├── features/     NodeTable (+ CSS module), ThroughputChart, ConfigPanel
└── test/
```

Swap `api/mockServer.ts` for `fetch` against a real service and nothing above it changes.

## Known limits

Polling, not WebSocket or SSE — a real deployment of this would push. `useState` is
sufficient at this size; a larger console would want a query cache for request
deduplication and background refetch. No virtualisation on the table, which would matter
past a few hundred rows. No i18n.
