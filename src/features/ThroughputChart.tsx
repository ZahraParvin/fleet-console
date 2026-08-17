/*
 * The chart.
 *
 * A <canvas>-backed chart is invisible to a screen reader, so the same data is also
 * rendered as a real <table> that is visually hidden but present in the accessibility
 * tree. The chart gets role="img" and a summary label. This is the cheapest way to make
 * a visualisation accessible and it survives every future restyle.
 */
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { ThroughputPoint } from '../hooks/useFleetData'

const clock = (t: number) =>
  new Date(t).toLocaleTimeString(undefined, { minute: '2-digit', second: '2-digit' })

export function ThroughputChart({ data }: { data: ThroughputPoint[] }) {
  const last = data.at(-1)
  const summary = last
    ? `Fleet throughput over the last ${data.length} samples. Currently ${last.totalCalls} active calls, mean CPU ${last.meanCpu} percent.`
    : 'Fleet throughput chart. No data yet.'

  return (
    <>
      <div role="img" aria-label={summary} style={{ height: 220 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
            <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
            <XAxis
              dataKey="t"
              tickFormatter={clock}
              stroke="var(--muted)"
              fontSize={12}
              minTickGap={48}
            />
            <YAxis stroke="var(--muted)" fontSize={12} />
            <Tooltip
              labelFormatter={(t) => clock(Number(t))}
              contentStyle={{
                background: 'var(--surface-raised)',
                border: '1px solid var(--border)',
                borderRadius: 8,
                color: 'var(--text)',
              }}
            />
            <Line
              type="monotone"
              dataKey="totalCalls"
              name="Active calls"
              stroke="var(--accent)"
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="meanCpu"
              name="Mean CPU %"
              stroke="var(--ok)"
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <table className="visually-hidden">
        <caption>Fleet throughput, tabular equivalent of the chart above</caption>
        <thead>
          <tr>
            <th scope="col">Time</th>
            <th scope="col">Active calls</th>
            <th scope="col">Mean CPU percent</th>
          </tr>
        </thead>
        <tbody>
          {data.slice(-10).map((p) => (
            <tr key={p.t}>
              <th scope="row">{clock(p.t)}</th>
              <td>{p.totalCalls}</td>
              <td>{p.meanCpu}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  )
}
