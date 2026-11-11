import assert from "node:assert/strict"
import { test } from "node:test"

import { analyzeCircuitJsonTraceLength } from "../lib/analyze-circuit-json-trace-length.ts"

// Node 22.18+ can run this TypeScript file directly:
// node --test tests/target-resolution.test.ts
// Bun discovery and execution must also be checked by the repository's bun test.

type Item = { type: string; [key: string]: unknown }

const net = (id: string, name: string): Item => ({
  type: "source_net",
  source_net_id: id,
  name,
})

const component: Item = {
  type: "source_component",
  source_component_id: "component_1",
  name: "U1",
}

const pin = (fields: Record<string, unknown> = {}): Item => ({
  type: "source_port",
  source_port_id: "port_1",
  source_component_id: "component_1",
  name: "RESET_N",
  pin_number: 1,
  ...fields,
})

const analyze = (items: readonly Item[], targetPinOrNet: string) =>
  analyzeCircuitJsonTraceLength(items, { targetPinOrNet })

test("ambiguous bare nets do not fall back to a unique named pin", () => {
  const items = [
    net("net_1", "RESET_N"),
    net("net_2", "RESET_N"),
    component,
    pin(),
  ]
  const before = JSON.stringify(items)
  assert.throws(() => analyze(items, "RESET_N"))
  assert.equal(JSON.stringify(items), before)
})

test("case-insensitive ambiguous nets do not fall back to a pin", () => {
  assert.throws(() =>
    analyze(
      [
        net("net_1", "RESET_N"),
        net("net_2", "reset_n"),
        component,
        pin(),
      ],
      "Reset_N",
    ),
  )
})

test("ambiguous nets do not fall back to a unique pin number", () => {
  assert.throws(() =>
    analyze([net("net_1", "1"), net("net_2", "1"), component, pin()], "1"),
  )
})

test("ambiguous nets do not fall back to a unique port hint", () => {
  assert.throws(() =>
    analyze(
      [
        net("net_1", "RESET_N"),
        net("net_2", "RESET_N"),
        component,
        pin({ name: "GPIO", port_hints: ["RESET_N"] }),
      ],
      "RESET_N",
    ),
  )
})

test("ambiguous bare nets without a matching pin still reject", () => {
  assert.throws(() =>
    analyze([net("net_1", "RESET_N"), net("net_2", "RESET_N")], "RESET_N"),
  )
})

test("a unique net takes precedence over a same-name pin", () => {
  const result = analyze([net("net_1", "RESET_N"), component, pin()], "RESET_N")
  assert.equal(result.targetKind, "net")
  assert.equal(result.requestedTarget, "RESET_N")
  assert.equal(result.resolvedTarget, "net.RESET_N")
})

test("a unique net takes precedence over ambiguous pins", () => {
  const result = analyze(
    [
      net("net_1", "RESET_N"),
      component,
      pin(),
      pin({ source_port_id: "port_2" }),
    ],
    "RESET_N",
  )
  assert.equal(result.targetKind, "net")
  assert.equal(result.resolvedTarget, "net.RESET_N")
})

test("a unique case-insensitive net still resolves before a pin", () => {
  const result = analyze([net("net_1", "reset_n"), component, pin()], "Reset_N")
  assert.equal(result.targetKind, "net")
  assert.equal(result.resolvedTarget, "net.reset_n")
})

test("an exact net name retains precedence over case-folded alternatives", () => {
  const result = analyze(
    [
      net("net_1", "RESET_N"),
      net("net_2", "reset_n"),
      component,
      pin(),
    ],
    "RESET_N",
  )
  assert.equal(result.targetKind, "net")
  assert.equal(result.resolvedTarget, "net.RESET_N")
})

test("a unique named pin resolves when no net matches", () => {
  const result = analyze([net("net_1", "OTHER"), component, pin()], "RESET_N")
  assert.equal(result.targetKind, "pin")
  assert.equal(result.resolvedTarget, "U1.RESET_N")
})

test("a unique pin number resolves when no net matches", () => {
  assert.equal(analyze([component, pin()], "1").resolvedTarget, "U1.RESET_N")
})

test("a unique case-insensitive port hint resolves when no net matches", () => {
  const result = analyze(
    [component, pin({ name: "GPIO", port_hints: ["RESET_N"] })],
    "reset_n",
  )
  assert.equal(result.targetKind, "pin")
  assert.equal(result.resolvedTarget, "U1.GPIO")
})

test("an explicit pin bypasses bare-net ambiguity", () => {
  const result = analyze(
    [net("net_1", "RESET_N"), net("net_2", "RESET_N"), component, pin()],
    "U1.RESET_N",
  )
  assert.equal(result.targetKind, "pin")
  assert.equal(result.resolvedTarget, "U1.RESET_N")
})

test("an explicit ambiguous net still rejects", () => {
  assert.throws(() =>
    analyze(
      [net("net_1", "RESET_N"), net("net_2", "RESET_N"), component, pin()],
      "net.RESET_N",
    ),
  )
})

test("a missing target still rejects", () => {
  assert.throws(() => analyze([component, pin()], "MISSING"))
})

test("ambiguous pins without a matching net still reject", () => {
  assert.throws(() =>
    analyze([component, pin(), pin({ source_port_id: "port_2" })], "RESET_N"),
  )
})

test("a resolved pin retains its direct trace length and XML output", () => {
  const result = analyze(
    [
      component,
      pin(),
      pin({ source_port_id: "port_2", name: "GPIO", pin_number: 2 }),
      {
        type: "pcb_port",
        pcb_port_id: "pcb_port_1",
        source_port_id: "port_1",
        x: 0,
        y: 0,
        layers: ["top"],
      },
      {
        type: "pcb_port",
        pcb_port_id: "pcb_port_2",
        source_port_id: "port_2",
        x: 3,
        y: 4,
        layers: ["top"],
      },
      {
        type: "source_trace",
        source_trace_id: "trace_1",
        connected_source_port_ids: ["port_1", "port_2"],
      },
    ],
    "RESET_N",
  )
  assert.equal(result.traceCount, 1)
  assert.equal(result.totalLengthMm, 5)
  assert.equal(result.totalStraightLineDistanceMm, 5)
  assert.equal(result.listTraces()[0]?.connectionTarget, "U1.GPIO")
  assert.match(result.toString(), /resolvedTarget="U1.RESET_N"/)
  assert.match(result.toString(), /totalLengthMm="5.00"/)
})
