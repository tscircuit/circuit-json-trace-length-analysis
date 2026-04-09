type CircuitJsonItem = {
  type: string
  [key: string]: unknown
}

type SourceComponent = {
  type: "source_component"
  source_component_id: string
  name?: string
}

type SourcePort = {
  type: "source_port"
  source_port_id: string
  source_component_id: string
  name?: string
  pin_number?: number | string
  port_hints?: string[]
}

type SourceNet = {
  type: "source_net"
  source_net_id: string
  name?: string
}

type SourceTrace = {
  type: "source_trace"
  source_trace_id: string
  connected_source_port_ids?: string[]
  connected_source_net_ids?: string[]
  display_name?: string
  max_length?: number | null
}

type PcbPort = {
  type: "pcb_port"
  pcb_port_id: string
  source_port_id: string
  x?: number
  y?: number
  layers?: string[]
}

type ResolvedTarget =
  | {
      kind: "net"
      requestedTarget: string
      resolvedTarget: string
      net: SourceNet
    }
  | {
      kind: "pin"
      requestedTarget: string
      resolvedTarget: string
      port: SourcePort
    }

type PortPosition = {
  x: number
  y: number
  layers: string[]
}

type ConnectedPin = {
  ref: string
  x: number | null
  y: number | null
  layers: string[]
}

type TracePointKind = "endpoint" | "track" | "via"

export type TracePoint = {
  x: number
  y: number
  layer: string
  kind: TracePointKind
}

type TraceRequirement = {
  maxLengthMm: number | null
}

type TraceModel = {
  id: string
  label: string
  connectionType: "direct connection" | "via net"
  connectionTarget: string
  connectionTargetPosition: { x: number; y: number; layer: string } | null
  connectedPins: ConnectedPin[]
  pinPositions: ConnectedPin[]
  requirements: TraceRequirement
  points: TracePoint[]
  lengthMm: number
  sourceTraceId: string
  displayName: string | null
}

export type AnalyzeCircuitJsonTraceLengthOptions = {
  targetPinOrNet: string
}

export class Trace {
  readonly id: string
  readonly label: string
  readonly connectionType: "direct connection" | "via net"
  readonly connectionTarget: string
  readonly connectionTargetPosition: {
    x: number
    y: number
    layer: string
  } | null
  readonly connectedPins: ConnectedPin[]
  readonly pinPositions: ConnectedPin[]
  readonly requirements: TraceRequirement
  readonly points: TracePoint[]
  readonly lengthMm: number
  readonly sourceTraceId: string
  readonly displayName: string | null

  constructor(model: TraceModel) {
    this.id = model.id
    this.label = model.label
    this.connectionType = model.connectionType
    this.connectionTarget = model.connectionTarget
    this.connectionTargetPosition = model.connectionTargetPosition
    this.connectedPins = model.connectedPins
    this.pinPositions = model.pinPositions
    this.requirements = model.requirements
    this.points = model.points
    this.lengthMm = model.lengthMm
    this.sourceTraceId = model.sourceTraceId
    this.displayName = model.displayName
  }

  toString() {
    const lines = [
      `<Trace id="${escapeXml(this.id)}" label="${escapeXml(this.label)}" connectionType="${escapeXml(this.connectionType)}" lengthMm="${formatNumber(this.lengthMm)}">`,
      `  <ConnectedPins>`,
      ...this.connectedPins.map(
        (pin) => `    <Pin ref="${escapeXml(pin.ref)}" />`,
      ),
      `  </ConnectedPins>`,
      `  <PinPositions>`,
      ...this.pinPositions.map((pin) => renderPinPosition(pin, "    ")),
      `  </PinPositions>`,
      renderConnection(this),
      renderRequirements(this.requirements, "  "),
      `  <Path>`,
      ...this.points.map(
        (point) =>
          `    <Point x="${formatNumber(point.x)}" y="${formatNumber(point.y)}" layer="${escapeXml(point.layer)}" kind="${escapeXml(point.kind)}" />`,
      ),
      `  </Path>`,
      `</Trace>`,
    ]

    return lines.join("\n")
  }
}

export class TraceLengthAnalysis {
  readonly requestedTarget: string
  readonly resolvedTarget: string
  readonly targetKind: "pin" | "net"
  readonly totalLengthMm: number
  readonly traceCount: number
  #traces: Trace[]

  constructor(args: {
    requestedTarget: string
    resolvedTarget: string
    targetKind: "pin" | "net"
    traces: Trace[]
  }) {
    this.requestedTarget = args.requestedTarget
    this.resolvedTarget = args.resolvedTarget
    this.targetKind = args.targetKind
    this.#traces = [...args.traces]
    this.totalLengthMm = this.#traces.reduce(
      (sum, trace) => sum + trace.lengthMm,
      0,
    )
    this.traceCount = this.#traces.length
  }

  listTraces() {
    return [...this.#traces]
  }

  toString() {
    const lines = [
      `<TraceLengthAnalysis requestedTarget="${escapeXml(this.requestedTarget)}" resolvedTarget="${escapeXml(this.resolvedTarget)}" targetKind="${escapeXml(this.targetKind)}" traceCount="${this.traceCount}" totalLengthMm="${formatNumber(this.totalLengthMm)}">`,
      ...this.#traces.flatMap((trace) =>
        trace
          .toString()
          .split("\n")
          .map((line) => `  ${line}`),
      ),
      `</TraceLengthAnalysis>`,
    ]

    return lines.join("\n")
  }
}

export function analyzeCircuitJsonTraceLength(
  circuitJson: readonly CircuitJsonItem[],
  options: AnalyzeCircuitJsonTraceLengthOptions,
) {
  const index = new CircuitJsonIndex(circuitJson)
  const target = resolveTarget(index, options.targetPinOrNet)
  const traces =
    target.kind === "pin"
      ? collectPinTraces(index, target)
      : collectNetTraces(index, target)

  return new TraceLengthAnalysis({
    requestedTarget: target.requestedTarget,
    resolvedTarget: target.resolvedTarget,
    targetKind: target.kind,
    traces,
  })
}

class CircuitJsonIndex {
  readonly componentsById = new Map<string, SourceComponent>()
  readonly componentsByName = new Map<string, SourceComponent[]>()
  readonly portsById = new Map<string, SourcePort>()
  readonly portsByComponentId = new Map<string, SourcePort[]>()
  readonly netsById = new Map<string, SourceNet>()
  readonly netsByName = new Map<string, SourceNet[]>()
  readonly pcbPortsBySourcePortId = new Map<string, PcbPort[]>()
  readonly tracesById = new Map<string, SourceTrace>()
  readonly tracesByPortId = new Map<string, SourceTrace[]>()
  readonly tracesByNetId = new Map<string, SourceTrace[]>()

  constructor(circuitJson: readonly CircuitJsonItem[]) {
    for (const item of circuitJson) {
      switch (item.type) {
        case "source_component":
          this.addComponent(item as SourceComponent)
          break
        case "source_port":
          this.addPort(item as SourcePort)
          break
        case "source_net":
          this.addNet(item as SourceNet)
          break
        case "pcb_port":
          this.addPcbPort(item as PcbPort)
          break
        case "source_trace":
          this.addTrace(item as SourceTrace)
          break
        default:
          break
      }
    }
  }

  getComponentByName(name: string) {
    return this.lookupWithCaseFallback(this.componentsByName, name)
  }

  getNetByName(name: string) {
    return this.lookupWithCaseFallback(this.netsByName, name)
  }

  getPcbPort(sourcePortId: string) {
    return this.pcbPortsBySourcePortId.get(sourcePortId)?.[0]
  }

  getPortPosition(sourcePortId: string): PortPosition | null {
    const pcbPort = this.getPcbPort(sourcePortId)
    if (
      !pcbPort ||
      typeof pcbPort.x !== "number" ||
      typeof pcbPort.y !== "number"
    ) {
      return null
    }

    const layers = normalizeLayers(pcbPort.layers)
    return {
      x: pcbPort.x,
      y: pcbPort.y,
      layers,
    }
  }

  getPortReference(sourcePortId: string) {
    const port = this.portsById.get(sourcePortId)
    if (!port) {
      return sourcePortId
    }

    const component = this.componentsById.get(port.source_component_id)
    const componentName = component?.name ?? port.source_component_id
    const portName = port.name ?? String(port.pin_number ?? port.source_port_id)
    return `${componentName}.${portName}`
  }

  getConnectedPinsForNet(sourceNetId: string) {
    const traces = this.tracesByNetId.get(sourceNetId) ?? []
    const sourcePortIds = new Set<string>()

    for (const trace of traces) {
      for (const sourcePortId of trace.connected_source_port_ids ?? []) {
        sourcePortIds.add(sourcePortId)
      }
    }

    return [...sourcePortIds].map((sourcePortId) =>
      this.toConnectedPin(sourcePortId),
    )
  }

  toConnectedPin(sourcePortId: string): ConnectedPin {
    const position = this.getPortPosition(sourcePortId)

    return {
      ref: this.getPortReference(sourcePortId),
      x: position?.x ?? null,
      y: position?.y ?? null,
      layers: position?.layers ?? [],
    }
  }

  private addComponent(component: SourceComponent) {
    this.componentsById.set(component.source_component_id, component)
    const name = component.name
    if (!name) {
      return
    }

    this.addLookup(this.componentsByName, name, component)
  }

  private addPort(port: SourcePort) {
    this.portsById.set(port.source_port_id, port)
    this.addLookup(this.portsByComponentId, port.source_component_id, port)
  }

  private addNet(net: SourceNet) {
    this.netsById.set(net.source_net_id, net)
    const name = net.name
    if (!name) {
      return
    }

    this.addLookup(this.netsByName, name, net)
  }

  private addPcbPort(pcbPort: PcbPort) {
    this.addLookup(this.pcbPortsBySourcePortId, pcbPort.source_port_id, pcbPort)
  }

  private addTrace(trace: SourceTrace) {
    this.tracesById.set(trace.source_trace_id, trace)

    for (const sourcePortId of trace.connected_source_port_ids ?? []) {
      this.addLookup(this.tracesByPortId, sourcePortId, trace)
    }

    for (const sourceNetId of trace.connected_source_net_ids ?? []) {
      this.addLookup(this.tracesByNetId, sourceNetId, trace)
    }
  }

  private addLookup<T>(map: Map<string, T[]>, key: string, value: T) {
    const existing = map.get(key) ?? []
    existing.push(value)
    map.set(key, existing)
  }

  private lookupWithCaseFallback<T>(map: Map<string, T[]>, key: string) {
    const exactMatch = map.get(key)
    if (exactMatch?.length) {
      return exactMatch
    }

    const loweredKey = key.toLowerCase()
    const fuzzyMatches: T[] = []

    for (const [candidateKey, values] of map.entries()) {
      if (candidateKey.toLowerCase() === loweredKey) {
        fuzzyMatches.push(...values)
      }
    }

    return fuzzyMatches
  }
}

function resolveTarget(
  index: CircuitJsonIndex,
  targetPinOrNet: string,
): ResolvedTarget {
  if (targetPinOrNet.includes(".")) {
    if (targetPinOrNet.startsWith("net.")) {
      const netName = targetPinOrNet.slice("net.".length)
      const net = resolveNetByName(index, netName)

      return {
        kind: "net",
        requestedTarget: targetPinOrNet,
        resolvedTarget: `net.${net.name ?? net.source_net_id}`,
        net,
      }
    }

    return resolvePinTarget(index, targetPinOrNet)
  }

  const matchingNet = resolveOptionalNetByName(index, targetPinOrNet)
  if (matchingNet) {
    const resolvedTarget = `net.${matchingNet.name ?? matchingNet.source_net_id}`
    console.log(`inferring ${resolvedTarget}`)
    return {
      kind: "net",
      requestedTarget: targetPinOrNet,
      resolvedTarget,
      net: matchingNet,
    }
  }

  const matchingPin = resolveOptionalPinByLabel(index, targetPinOrNet)
  if (matchingPin) {
    const resolvedTarget = index.getPortReference(matchingPin.source_port_id)
    console.log(`inferring ${resolvedTarget}`)
    return {
      kind: "pin",
      requestedTarget: targetPinOrNet,
      resolvedTarget,
      port: matchingPin,
    }
  }

  throw new Error(
    `Unable to resolve target "${targetPinOrNet}" to a pin or net`,
  )
}

function resolvePinTarget(
  index: CircuitJsonIndex,
  targetPinOrNet: string,
): ResolvedTarget {
  const [componentName, ...pinParts] = targetPinOrNet.split(".")
  const pinLabelOrNumber = pinParts.join(".")

  if (!componentName || !pinLabelOrNumber) {
    throw new Error(`Invalid pin target "${targetPinOrNet}"`)
  }

  const components = index.getComponentByName(componentName)
  if (components.length !== 1) {
    throw new Error(
      components.length === 0
        ? `Unable to find component "${componentName}"`
        : `Component "${componentName}" is ambiguous`,
    )
  }

  const component = components[0]
  if (!component) {
    throw new Error(`Unable to find component "${componentName}"`)
  }

  const ports =
    index.portsByComponentId.get(component.source_component_id) ?? []
  const matchingPorts = ports.filter((port) =>
    portMatchesLabel(port, pinLabelOrNumber),
  )

  if (matchingPorts.length !== 1) {
    throw new Error(
      matchingPorts.length === 0
        ? `Unable to find pin "${pinLabelOrNumber}" on ${componentName}`
        : `Pin "${pinLabelOrNumber}" on ${componentName} is ambiguous`,
    )
  }

  const port = matchingPorts[0]
  if (!port) {
    throw new Error(
      `Unable to find pin "${pinLabelOrNumber}" on ${componentName}`,
    )
  }

  return {
    kind: "pin",
    requestedTarget: targetPinOrNet,
    resolvedTarget: index.getPortReference(port.source_port_id),
    port,
  }
}

function resolveOptionalPinByLabel(
  index: CircuitJsonIndex,
  pinLabelOrNumber: string,
): SourcePort | null {
  const matchingPorts = [...index.portsById.values()].filter((port) =>
    portMatchesLabel(port, pinLabelOrNumber),
  )

  if (matchingPorts.length !== 1) {
    return null
  }

  return matchingPorts[0] ?? null
}

function resolveNetByName(index: CircuitJsonIndex, netName: string): SourceNet {
  const matchingNets = index.getNetByName(netName)
  if (matchingNets.length !== 1) {
    throw new Error(
      matchingNets.length === 0
        ? `Unable to find net "${netName}"`
        : `Net "${netName}" is ambiguous`,
    )
  }

  const net = matchingNets[0]
  if (!net) {
    throw new Error(`Unable to find net "${netName}"`)
  }

  return net
}

function resolveOptionalNetByName(
  index: CircuitJsonIndex,
  netName: string,
): SourceNet | null {
  const matchingNets = index.getNetByName(netName)
  if (matchingNets.length !== 1) {
    return null
  }

  return matchingNets[0] ?? null
}

function collectPinTraces(
  index: CircuitJsonIndex,
  target: Extract<ResolvedTarget, { kind: "pin" }>,
) {
  const traces = index.tracesByPortId.get(target.port.source_port_id) ?? []

  return traces
    .flatMap((trace) => {
      const netIds = trace.connected_source_net_ids ?? []

      if (netIds.length > 0) {
        return netIds.map((sourceNetId) =>
          createNetTraceModel(index, {
            trace,
            sourceNetId,
            focusSourcePortId: target.port.source_port_id,
          }),
        )
      }

      return [
        createDirectTraceModel(index, {
          trace,
          focusSourcePortId: target.port.source_port_id,
        }),
      ]
    })
    .sort(compareTraceModels)
    .map((model) => new Trace(model))
}

function collectNetTraces(
  index: CircuitJsonIndex,
  target: Extract<ResolvedTarget, { kind: "net" }>,
) {
  const traces = index.tracesByNetId.get(target.net.source_net_id) ?? []

  return traces
    .flatMap((trace) => {
      const connectedSourcePortIds = trace.connected_source_port_ids ?? []
      if (connectedSourcePortIds.length === 0) {
        return []
      }

      return connectedSourcePortIds.map((focusSourcePortId) =>
        createNetTraceModel(index, {
          trace,
          sourceNetId: target.net.source_net_id,
          focusSourcePortId,
        }),
      )
    })
    .sort(compareTraceModels)
    .map((model) => new Trace(model))
}

function createDirectTraceModel(
  index: CircuitJsonIndex,
  args: {
    trace: SourceTrace
    focusSourcePortId: string
  },
): TraceModel {
  const connectedSourcePortIds = args.trace.connected_source_port_ids ?? []
  if (connectedSourcePortIds.length === 0) {
    throw new Error(
      `Trace ${args.trace.source_trace_id} has no connected ports`,
    )
  }

  const orderedPortIds = prioritizeFocus(
    connectedSourcePortIds,
    args.focusSourcePortId,
  )
  const firstPortId = orderedPortIds[0]
  const secondPortId = orderedPortIds[1] ?? orderedPortIds[0]
  if (!firstPortId || !secondPortId) {
    throw new Error(
      `Trace ${args.trace.source_trace_id} is missing connected ports`,
    )
  }

  const firstPosition = requirePortPosition(index, firstPortId)
  const secondPosition = requirePortPosition(index, secondPortId)
  const firstLayer = primaryLayer(firstPosition.layers)
  const secondLayer = primaryLayer(secondPosition.layers)

  const basePoints = buildPathBetween({
    from: {
      x: firstPosition.x,
      y: firstPosition.y,
      layer: firstLayer,
      kind: "endpoint",
    },
    to: {
      x: secondPosition.x,
      y: secondPosition.y,
      layer: secondLayer,
      kind: "endpoint",
    },
  })

  const points = densifyPath(basePoints)
  const connectedPins = orderedPortIds.map((sourcePortId) =>
    index.toConnectedPin(sourcePortId),
  )
  const connectionTarget = index.getPortReference(secondPortId)

  return {
    id: args.trace.source_trace_id,
    label: `${index.getPortReference(firstPortId)} -> ${connectionTarget}`,
    connectionType: "direct connection",
    connectionTarget,
    connectionTargetPosition: {
      x: secondPosition.x,
      y: secondPosition.y,
      layer: secondLayer,
    },
    connectedPins,
    pinPositions: connectedPins,
    requirements: {
      maxLengthMm:
        typeof args.trace.max_length === "number"
          ? args.trace.max_length
          : null,
    },
    points,
    lengthMm: measurePathLength(points),
    sourceTraceId: args.trace.source_trace_id,
    displayName: args.trace.display_name ?? null,
  }
}

function createNetTraceModel(
  index: CircuitJsonIndex,
  args: {
    trace: SourceTrace
    sourceNetId: string
    focusSourcePortId: string
  },
): TraceModel {
  const net = index.netsById.get(args.sourceNetId)
  if (!net) {
    throw new Error(`Unable to find net ${args.sourceNetId}`)
  }

  const focusPosition = requirePortPosition(index, args.focusSourcePortId)
  const focusLayer = primaryLayer(focusPosition.layers)
  const connectedPins = index
    .getConnectedPinsForNet(args.sourceNetId)
    .sort((a, b) => a.ref.localeCompare(b.ref))
  const hub = inferNetHub(connectedPins, focusLayer)
  const focusPin = index.toConnectedPin(args.focusSourcePortId)
  const path = densifyPath(
    buildPathBetween({
      from: {
        x: focusPosition.x,
        y: focusPosition.y,
        layer: focusLayer,
        kind: "endpoint",
      },
      to: {
        x: hub.x,
        y: hub.y,
        layer: hub.layer,
        kind: "endpoint",
      },
    }),
  )

  return {
    id: `${args.trace.source_trace_id}:${args.focusSourcePortId}`,
    label: `${focusPin.ref} -> net.${net.name ?? net.source_net_id}`,
    connectionType: "via net",
    connectionTarget: `net.${net.name ?? net.source_net_id}`,
    connectionTargetPosition: hub,
    connectedPins: prioritizePin(focusPin, connectedPins),
    pinPositions: prioritizePin(focusPin, connectedPins),
    requirements: {
      maxLengthMm:
        typeof args.trace.max_length === "number"
          ? args.trace.max_length
          : null,
    },
    points: path,
    lengthMm: measurePathLength(path),
    sourceTraceId: args.trace.source_trace_id,
    displayName: args.trace.display_name ?? null,
  }
}

function requirePortPosition(
  index: CircuitJsonIndex,
  sourcePortId: string,
): PortPosition {
  const position = index.getPortPosition(sourcePortId)
  if (!position) {
    throw new Error(
      `Unable to analyze ${index.getPortReference(sourcePortId)} because it has no pcb_port position`,
    )
  }

  return position
}

function inferNetHub(
  connectedPins: ConnectedPin[],
  fallbackLayer: string,
): { x: number; y: number; layer: string } {
  const positionedPins = connectedPins.filter(
    (pin): pin is ConnectedPin & { x: number; y: number } =>
      typeof pin.x === "number" && typeof pin.y === "number",
  )

  if (positionedPins.length === 0) {
    return {
      x: 0,
      y: 0,
      layer: fallbackLayer,
    }
  }

  const x =
    positionedPins.reduce((sum, pin) => sum + pin.x, 0) / positionedPins.length
  const y =
    positionedPins.reduce((sum, pin) => sum + pin.y, 0) / positionedPins.length
  const layerCounts = new Map<string, number>()

  for (const pin of positionedPins) {
    const layer = pin.layers[0] ?? fallbackLayer
    layerCounts.set(layer, (layerCounts.get(layer) ?? 0) + 1)
  }

  const sortedLayers = [...layerCounts.entries()].sort((left, right) => {
    if (right[1] !== left[1]) {
      return right[1] - left[1]
    }

    return left[0].localeCompare(right[0])
  })
  const layer = sortedLayers[0]?.[0] ?? fallbackLayer

  return { x, y, layer }
}

function buildPathBetween(args: {
  from: TracePoint
  to: TracePoint
}): TracePoint[] {
  if (args.from.layer === args.to.layer) {
    return [args.from, args.to]
  }

  const viaX = (args.from.x + args.to.x) / 2
  const viaY = (args.from.y + args.to.y) / 2

  return [
    args.from,
    {
      x: viaX,
      y: viaY,
      layer: args.from.layer,
      kind: "via",
    },
    {
      x: viaX,
      y: viaY,
      layer: args.to.layer,
      kind: "via",
    },
    args.to,
  ]
}

function densifyPath(basePoints: TracePoint[]): TracePoint[] {
  if (basePoints.length === 0) {
    return []
  }

  const firstPoint = basePoints[0]
  if (!firstPoint) {
    return []
  }

  const points: TracePoint[] = [firstPoint]

  for (let index = 1; index < basePoints.length; index += 1) {
    const previous = basePoints[index - 1]
    const current = basePoints[index]
    if (!previous || !current) {
      continue
    }

    const distance = distanceBetween(previous, current)

    if (distance > 0 && previous.layer === current.layer) {
      for (
        let sampleDistance = 5;
        sampleDistance < distance;
        sampleDistance += 5
      ) {
        const progress = sampleDistance / distance
        points.push({
          x: lerp(previous.x, current.x, progress),
          y: lerp(previous.y, current.y, progress),
          layer: previous.layer,
          kind: "track",
        })
      }
    }

    points.push(current)
  }

  return points
}

function measurePathLength(points: TracePoint[]) {
  let lengthMm = 0

  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1]
    const current = points[index]
    if (!previous || !current) {
      continue
    }

    lengthMm += distanceBetween(previous, current)
  }

  return lengthMm
}

function renderPinPosition(pin: ConnectedPin, indent: string) {
  if (typeof pin.x !== "number" || typeof pin.y !== "number") {
    return `${indent}<Pin ref="${escapeXml(pin.ref)}" position="unavailable" />`
  }

  const layers = pin.layers.length > 0 ? pin.layers.join(",") : "unknown"
  return `${indent}<Pin ref="${escapeXml(pin.ref)}" x="${formatNumber(pin.x)}" y="${formatNumber(pin.y)}" layers="${escapeXml(layers)}" />`
}

function renderConnection(trace: Trace) {
  if (trace.connectionTargetPosition) {
    return `  <Connection kind="${escapeXml(trace.connectionType)}" target="${escapeXml(trace.connectionTarget)}" x="${formatNumber(trace.connectionTargetPosition.x)}" y="${formatNumber(trace.connectionTargetPosition.y)}" layer="${escapeXml(trace.connectionTargetPosition.layer)}" />`
  }

  return `  <Connection kind="${escapeXml(trace.connectionType)}" target="${escapeXml(trace.connectionTarget)}" />`
}

function renderRequirements(requirements: TraceRequirement, indent: string) {
  if (typeof requirements.maxLengthMm === "number") {
    return [
      `${indent}<TraceRequirements>`,
      `${indent}  <MaxLengthMm>${formatNumber(requirements.maxLengthMm)}</MaxLengthMm>`,
      `${indent}</TraceRequirements>`,
    ].join("\n")
  }

  return `${indent}<TraceRequirements none />`
}

function portMatchesLabel(port: SourcePort, label: string) {
  const loweredLabel = label.toLowerCase()
  const portName = port.name?.toLowerCase()
  const pinNumber = String(port.pin_number ?? "").toLowerCase()
  const portHints = (port.port_hints ?? []).map((hint) => hint.toLowerCase())

  return (
    portName === loweredLabel ||
    pinNumber === loweredLabel ||
    portHints.includes(loweredLabel)
  )
}

function prioritizeFocus(portIds: string[], focusSourcePortId: string) {
  const remainder = portIds.filter((portId) => portId !== focusSourcePortId)
  return [focusSourcePortId, ...remainder]
}

function prioritizePin(focusPin: ConnectedPin, pins: ConnectedPin[]) {
  const remainder = pins.filter((pin) => pin.ref !== focusPin.ref)
  return [focusPin, ...remainder]
}

function compareTraceModels(left: TraceModel, right: TraceModel) {
  return left.label.localeCompare(right.label)
}

function normalizeLayers(layers: unknown) {
  if (!Array.isArray(layers)) {
    return ["top"]
  }

  const normalizedLayers = layers.filter(
    (layer): layer is string => typeof layer === "string" && layer.length > 0,
  )

  return normalizedLayers.length > 0 ? normalizedLayers : ["top"]
}

function primaryLayer(layers: string[]) {
  return layers[0] ?? "top"
}

function distanceBetween(
  left: Pick<TracePoint, "x" | "y">,
  right: Pick<TracePoint, "x" | "y">,
) {
  return Math.hypot(right.x - left.x, right.y - left.y)
}

function lerp(start: number, end: number, amount: number) {
  return start + (end - start) * amount
}

function formatNumber(value: number) {
  return value.toFixed(2)
}

function escapeXml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
}
