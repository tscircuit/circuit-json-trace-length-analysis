# circuit-json-trace-length-analysis

Analyze a Circuit JSON graph and turn one target pin or net into a readable trace-length digest.

The main entry point is:

```ts
analyzeCircuitJsonTraceLength(circuitJson, {
  targetPinOrNet: string,
})
```

It returns a `TraceLengthAnalysis` object with:

- `toString()` for a digestible XML summary
- `listTraces()` for structured trace objects

Each `Trace` includes:

- connected pins
- trace length
- whether the connection is a direct pin-to-pin connection or a net-backed connection
- any length requirement currently attached to the underlying `source_trace`
- pin positions
- XYL points along the inferred path

## What This Repo Is For

Circuit JSON is very good at representing logical connectivity, component pins, PCB pin locations, and trace intent. It is not always a complete routed-copper representation.

This repo gives you a practical analysis layer on top of that data:

- pick one pin like `U1.USB_DP`
- or one net like `net.GND`
- get back a trace analysis object
- print it as XML that is easy for humans and LLMs to read

The XML is meant to answer:

1. Which pins are connected?
2. How long is the trace?
3. Is the connection direct, or is it mediated by a net?
4. Are there any declared length requirements?
5. Where are the pins physically located?
6. What XYL points describe the path, including vias and intermediate points every 5mm?

## Current Model

This project currently works from:

- `source_trace`
- `source_net`
- `source_port`
- `source_component`
- `pcb_port`

That means the analysis is only as physically accurate as the Circuit JSON data allows.

In particular:

- If a trace is direct pin-to-pin, the current implementation measures a straight-line path between the PCB pin positions.
- If a trace is pin-to-net, the current implementation measures from the pin to an inferred net hub.
- If the endpoints are on different layers, an inferred via is inserted at the midpoint between the endpoints.
- Intermediate `Path > Point` samples are inserted every 5mm along each same-layer segment.

This is intentionally explicit. The XML is a useful digest of the currently available geometry, but it should not be mistaken for exact routed-copper length unless the input data eventually includes full routed path primitives.

## Install

This repo is currently set up as a Bun + TypeScript library.

```bash
bun install
```

## Quick Start

```ts
import { readFileSync } from "node:fs"

import { analyzeCircuitJsonTraceLength } from "circuit-json-trace-length-analysis"

const circuitJson = JSON.parse(readFileSync("circuit.json", "utf8"))

const analysis = analyzeCircuitJsonTraceLength(circuitJson, {
  targetPinOrNet: "U1.USB_DP",
})

console.log(analysis.toString())

for (const trace of analysis.listTraces()) {
  console.log(trace.lengthMm)
  console.log(trace.toString())
}
```

## Target Syntax

### Pin targets

Use:

```txt
${componentName}.${pinLabelOrNumber}
```

Examples:

```txt
U1.USB_DP
U1.25
J1.GND
```

Pin resolution is case-insensitive and matches against:

- the source port name
- the pin number
- any `port_hints`

### Net targets

Use:

```txt
net.GND
net.RESET_N
```

### Bare targets

If the string does not contain a `.`, the analyzer tries to infer what you meant.

It currently prefers nets first, then unique pin matches.

Example:

```ts
analyzeCircuitJsonTraceLength(circuitJson, {
  targetPinOrNet: "RESET_N",
})
```

This will emit:

```txt
inferring net.RESET_N
```

If the target is ambiguous or missing, the analyzer throws.

## API

### `analyzeCircuitJsonTraceLength(circuitJson, options)`

```ts
type AnalyzeCircuitJsonTraceLengthOptions = {
  targetPinOrNet: string
}
```

Returns:

```ts
TraceLengthAnalysis
```

### `TraceLengthAnalysis`

Properties:

- `requestedTarget`
- `resolvedTarget`
- `targetKind`
- `traceCount`
- `totalLengthMm`

Methods:

- `listTraces(): Trace[]`
- `toString(): string`

### `Trace`

Properties:

- `id`
- `label`
- `connectionType`
- `connectionTarget`
- `connectionTargetPosition`
- `connectedPins`
- `pinPositions`
- `requirements`
- `points`
- `lengthMm`
- `sourceTraceId`
- `displayName`

Methods:

- `toString(): string`

### `TracePoint`

```ts
type TracePoint = {
  x: number
  y: number
  layer: string
  kind: "endpoint" | "track" | "via"
}
```

## XML Output

The `toString()` methods produce XML-like output using:

- PascalCase elements
- camelCase attributes
- 0.01mm precision

Example:

```xml
<TraceLengthAnalysis requestedTarget="U1.USB_DP" resolvedTarget="U1.USB_DP" targetKind="pin" traceCount="1" totalLengthMm="34.10">
  <Trace id="source_trace_9" label="U1.USB_DP -> J1.D_P" connectionType="direct connection" lengthMm="34.10">
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
</TraceLengthAnalysis>
```

## Interpretation Notes

### `connectionType`

- `"direct connection"` means the underlying `source_trace` directly connects ports.
- `"via net"` means the selected pin is analyzed through a net membership relationship.

### `TraceRequirements`

- If `source_trace.max_length` exists, it is emitted as `<MaxLengthMm>`.
- Otherwise the XML emits `<TraceRequirements none />`.

### `Path`

`Path` contains XYL points:

- `endpoint` for the start or end of a segment
- `track` for intermediate samples every 5mm
- `via` for inferred layer transitions

## Example Workflows

### Analyze one explicit pin

```ts
const analysis = analyzeCircuitJsonTraceLength(circuitJson, {
  targetPinOrNet: "U1.USB_DP",
})
```

### Analyze an explicit net

```ts
const analysis = analyzeCircuitJsonTraceLength(circuitJson, {
  targetPinOrNet: "net.GND",
})
```

### Let the analyzer infer a net

```ts
const analysis = analyzeCircuitJsonTraceLength(circuitJson, {
  targetPinOrNet: "RESET_N",
})
```

## Development

Run the test suite:

```bash
bun test
```

Run type checking:

```bash
bun run typecheck
```

Check formatting:

```bash
bun run format:check
```

Format the repo:

```bash
bun run format
```

## Test Fixture

The current snapshot test uses:

- [`tests/assets/circuit01.json`](tests/assets/circuit01.json)

That test intentionally verifies both:

- a real inline XML snapshot for `U1.USB_DP`
- inference logging for a bare target like `RESET_N`

## Limitations

- This is not yet a full routed-copper extractor.
- Net-backed traces currently use an inferred net hub rather than exact copper geometry.
- If the Circuit JSON lacks a `pcb_port` position for a required pin, analysis throws.
- Length values are geometric lengths of the inferred path, not electrical timing metrics.

## Why The README Is So Explicit

This project sits right on the boundary between logical connectivity and physical routing. A vague README would make the tool sound more exact than it currently is.

This one aims to be clear about both:

- what the library already does well
- what it still infers

That makes the output much easier to trust.
