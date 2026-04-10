import { readFileSync } from "node:fs"

import { expect, test } from "bun:test"

import { analyzeCircuitJsonTraceLength } from "lib/index"

const circuit01Json = JSON.parse(
  readFileSync(new URL("./assets/circuit01.json", import.meta.url), "utf8"),
) as readonly {
  type: string
  [key: string]: unknown
}[]

test("circuit01 trace length snapshot", () => {
  const analysis = analyzeCircuitJsonTraceLength(circuit01Json, {
    targetPinOrNet: "U1.USB_DP",
  })

  expect(analysis.toString()).toMatchInlineSnapshot(`
    "<TraceLengthAnalysis requestedTarget="U1.USB_DP" resolvedTarget="U1.USB_DP" targetKind="pin" traceCount="1" totalLengthMm="34.10" totalStraightLineDistanceMm="34.10">
      <Trace id="source_trace_9" label="U1.USB_DP -&gt; J1.D_P" connectionType="direct connection" lengthMm="34.10" straightLineDistanceMm="34.10">
        <ConnectedPins>
          <Pin ref="U1.USB_DP" />
          <Pin ref="J1.D_P" />
        </ConnectedPins>
        <PinPositions>
          <Pin ref="U1.USB_DP" x="0.25" y="-5.66" layers="top" />
          <Pin ref="J1.D_P" x="-33.25" y="0.70" layers="top" />
        </PinPositions>
        <Connection kind="direct connection" target="J1.D_P" x="-33.25" y="0.70" layer="top" />
        <TraceRequirements none />
      </Trace>
    </TraceLengthAnalysis>"
  `)
})
