import { readFileSync } from "node:fs"

import { expect, test } from "bun:test"

import { analyzeCircuitJsonTraceLength } from "lib/index"

const circuitJson = JSON.parse(
  readFileSync(new URL("./assets/circuit01.json", import.meta.url), "utf8"),
) as readonly {
  type: string
  [key: string]: unknown
}[]

test("renders a digestible XML trace analysis for a direct pin target", () => {
  const analysis = analyzeCircuitJsonTraceLength(circuitJson, {
    targetPinOrNet: "U1.USB_DP",
  })

  expect(analysis.toString()).toMatchInlineSnapshot(`
    "<TraceLengthAnalysis requestedTarget="U1.USB_DP" resolvedTarget="U1.USB_DP" targetKind="pin" traceCount="1" totalLengthMm="34.10">
      <Trace id="source_trace_9" label="U1.USB_DP -&gt; J1.D_P" connectionType="direct connection" lengthMm="34.10">
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
        <Path>
          <Point x="0.25" y="-5.66" layer="top" kind="endpoint" />
          <Point x="-4.66" y="-4.73" layer="top" kind="track" />
          <Point x="-9.57" y="-3.80" layer="top" kind="track" />
          <Point x="-14.49" y="-2.86" layer="top" kind="track" />
          <Point x="-19.40" y="-1.93" layer="top" kind="track" />
          <Point x="-24.31" y="-1.00" layer="top" kind="track" />
          <Point x="-29.22" y="-0.06" layer="top" kind="track" />
          <Point x="-33.25" y="0.70" layer="top" kind="endpoint" />
        </Path>
      </Trace>
    </TraceLengthAnalysis>"
  `)
})

test("infers net targets when the caller omits the net. prefix", () => {
  const logs: string[] = []
  const originalLog = console.log
  console.log = (...messages: unknown[]) => {
    logs.push(messages.join(" "))
  }

  try {
    const analysis = analyzeCircuitJsonTraceLength(circuitJson, {
      targetPinOrNet: "RESET_N",
    })

    expect(logs).toEqual(["inferring net.RESET_N"])
    expect(analysis.listTraces().length).toBeGreaterThan(0)
  } finally {
    console.log = originalLog
  }
})
