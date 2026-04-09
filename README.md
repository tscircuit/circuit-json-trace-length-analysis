# circuit-json-trace-length-analysis

Analyze Circuit JSON for one pin or net and get back a trace-length digest.

## Install

```bash
bun add https://github.com/tscircuit/circuit-json-trace-length-analysis
```

## Usage

```ts
import { readFileSync } from "node:fs"

import { analyzeCircuitJsonTraceLength } from "circuit-json-trace-length-analysis"

const circuitJson = JSON.parse(readFileSync("circuit.json", "utf8"))

const analysis = analyzeCircuitJsonTraceLength(circuitJson, {
  targetPinOrNet: "U1.USB_DP",
})

console.log(analysis.toString())
```

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

## Targets

- Pin: `U1.USB_DP`
- Pin by number: `U1.25`
- Net: `net.GND`
- Bare target: `RESET_N`

If the target does not contain `.`, the analyzer tries to infer it. It prefers nets first, then unique pin matches, and logs the inferred target:

```txt
inferring net.RESET_N
```

If the target is missing or ambiguous, the analyzer throws.

## Return Value

`analyzeCircuitJsonTraceLength(...)` returns a `TraceLengthAnalysis`.

It exposes:

- `toString()` for XML output
- `listTraces()` for structured `Trace` objects
- `traceCount`
- `totalLengthMm`
- `requestedTarget`
- `resolvedTarget`

Each `Trace` includes:

- `lengthMm`
- `connectionType`
- `connectionTarget`
- `connectedPins`
- `pinPositions`
- `requirements`
- `points`
- `toString()`
