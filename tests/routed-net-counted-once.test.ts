import { expect, test } from "bun:test"
import { pcb_trace } from "circuit-json"
import { analyzeCircuitJsonTraceLength } from "../lib"

test("a routed source trace shared by two pins is counted once per net", () => {
  const route = pcb_trace.parse({
    type: "pcb_trace",
    source_trace_id: "connection",
    route: [
      { route_type: "wire", x: 0, y: 0, layer: "top", width: 0.2 },
      { route_type: "wire", x: 3, y: 4, layer: "top", width: 0.2 },
    ],
  })
  const analysis = analyzeCircuitJsonTraceLength(
    [
      { type: "source_net", source_net_id: "signal", name: "SIGNAL" },
      {
        type: "source_port",
        source_port_id: "first",
        source_component_id: "U1",
      },
      {
        type: "source_port",
        source_port_id: "second",
        source_component_id: "U2",
      },
      {
        type: "pcb_port",
        pcb_port_id: "pad1",
        source_port_id: "first",
        x: 0,
        y: 0,
        layers: ["top"],
      },
      {
        type: "pcb_port",
        pcb_port_id: "pad2",
        source_port_id: "second",
        x: 3,
        y: 4,
        layers: ["top"],
      },
      {
        type: "source_trace",
        source_trace_id: "connection",
        connected_source_port_ids: ["first", "second"],
        connected_source_net_ids: ["signal"],
      },
      route,
      { ...route },
    ],
    { targetPinOrNet: "net.SIGNAL" },
  )

  expect(analysis.totalLengthMm).toBe(5)
  expect(analysis.traceCount).toBe(1)
})
