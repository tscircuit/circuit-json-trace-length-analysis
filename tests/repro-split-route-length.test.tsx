import { expect, test } from "bun:test"
import { pcb_trace } from "circuit-json"
import { Circuit } from "tscircuit"
import { analyzeCircuitJsonTraceLength } from "../lib"

test("a routed net measures all three PCB traces without extra connecting segments", async () => {
  const circuit = new Circuit()
  circuit.add(
    <board width={12} height={10} routingDisabled schAutoLayoutEnabled>
      <chip
        name="U1"
        pcbX={0}
        connections={{ pin1: "net.SIGNAL" }}
        footprint={
          <smtpad shape="rect" width={1} height={1} portHints={["pin1"]} />
        }
      />
      <chip
        name="U2"
        pcbX={6}
        connections={{ pin1: "net.SIGNAL" }}
        footprint={
          <smtpad shape="rect" width={1} height={1} portHints={["pin1"]} />
        }
      />
    </board>,
  )
  await circuit.renderUntilSettled()
  const circuitJson = circuit.getCircuitJson()
  const sourceTrace = circuitJson.find(
    (element) => element.type === "source_trace",
  )!
  // A 12 mm detour in three out-of-order pieces, with the last piece reversed.
  circuitJson.push(
    pcb_trace.parse({
      type: "pcb_trace",
      source_trace_id: sourceTrace.source_trace_id,
      route: [
        { route_type: "wire", x: 0, y: 3, width: 0.2, layer: "top" },
        { route_type: "wire", x: 6, y: 3, width: 0.2, layer: "top" },
      ],
    }),
    pcb_trace.parse({
      type: "pcb_trace",
      source_trace_id: sourceTrace.source_trace_id,
      route: [
        { route_type: "wire", x: 6, y: 0, width: 0.2, layer: "top" },
        { route_type: "wire", x: 6, y: 3, width: 0.2, layer: "top" },
      ],
    }),
    pcb_trace.parse({
      type: "pcb_trace",
      source_trace_id: sourceTrace.source_trace_id,
      route: [
        { route_type: "wire", x: 0, y: 0, width: 0.2, layer: "top" },
        { route_type: "wire", x: 0, y: 3, width: 0.2, layer: "top" },
      ],
    }),
  )

  const analysis = analyzeCircuitJsonTraceLength(circuitJson, {
    targetPinOrNet: "net.SIGNAL",
  })

  expect(
    circuitJson.filter((element) => element.type === "pcb_trace"),
  ).toHaveLength(3)
  expect(analysis.totalStraightLineDistanceMm).toBe(6)
  expect(analysis.totalLengthMm).toBe(12)
  expect(analysis.toString()).toMatchSnapshot()
})
