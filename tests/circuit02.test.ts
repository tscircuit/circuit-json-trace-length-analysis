import { readFileSync } from "node:fs"

import { expect, test } from "bun:test"

import { analyzeCircuitJsonTraceLength } from "lib/index"

const circuit02Json = JSON.parse(
  readFileSync(new URL("./assets/circuit02.json", import.meta.url), "utf8"),
) as readonly {
  type: string
  [key: string]: unknown
}[]

test("circuit02 trace length snapshot", () => {
  const analysis = analyzeCircuitJsonTraceLength(circuit02Json, {
    targetPinOrNet: "J1.A5",
  })

  expect(analysis.toString()).toMatchInlineSnapshot(`
    "<TraceLengthAnalysis requestedTarget="J1.A5" resolvedTarget="J1.A5" targetKind="pin" traceCount="1" totalLengthMm="6.52" totalStraightLineDistanceMm="5.24">
      <Trace id="source_trace_3" label="J1.A5 -&gt; R1.pin1" connectionType="direct connection" lengthMm="6.52" straightLineDistanceMm="5.24">
        <ConnectedPins>
          <Pin ref="J1.A5" />
          <Pin ref="R1.pin1" />
        </ConnectedPins>
        <PinPositions>
          <Pin ref="J1.A5" x="-21.93" y="1.25" layers="top" />
          <Pin ref="R1.pin1" x="-20.51" y="-3.80" layers="top" />
        </PinPositions>
        <Connection kind="direct connection" target="R1.pin1" x="-20.51" y="-3.80" layer="top" />
        <TraceRequirements none />
        <Path>
          <Point x="-20.51" y="-3.80" layer="top" kind="endpoint" />
          <Point x="-20.51" y="-3.02" layer="top" kind="track" />
          <Point x="-20.29" y="-2.80" layer="top" kind="track" />
          <Point x="-20.40" y="-2.80" layer="top" kind="track" />
          <Point x="-20.40" y="-2.80" layer="inner1" kind="track" />
          <Point x="-20.40" y="0.70" layer="inner1" kind="track" />
          <Point x="-20.80" y="1.10" layer="inner1" kind="track" />
          <Point x="-20.80" y="1.20" layer="inner1" kind="track" />
          <Point x="-20.80" y="1.20" layer="top" kind="via" />
          <Point x="-21.88" y="1.20" layer="top" kind="track" />
          <Point x="-21.93" y="1.25" layer="top" kind="endpoint" />
        </Path>
      </Trace>
    </TraceLengthAnalysis>"
  `)
})
