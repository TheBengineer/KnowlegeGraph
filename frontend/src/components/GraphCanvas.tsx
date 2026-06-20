import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ForceGraph2D from 'react-force-graph-2d'

import type { Node, Edge } from '../types'
import {
  INITIAL_NAV,
  processKey,
  classifyEdge,
  getChildEdges,
  getParentEdges,
  getRelatedEdges,
  getTargetNode,
  type NavState,
  type EdgeInfo,
} from '../lib/graph-navigation'
import type { EdgeDirection } from '../lib/graph-navigation'

interface Props {
  nodes: Node[]
  edges: Edge[]
  onNodeClick: (nodeId: string) => void
  onNodeDoubleClick: (nodeId: string) => void
  onNodeDeselect?: () => void
  linkMode: boolean
  linkingState: { sourceNodeId: string; sourceSide: string; sourceLabel: string } | null
  onLinkDragStart: (sourceNodeId: string, side: string, sourceLabel: string) => void
  onLinkDragEnd: (targetNodeId: string, targetLabel: string) => void
  onLinkDragCancel: () => void
  onCreateNode: (label: string, parentId: string, direction: 'child' | 'parent' | 'related') => Promise<void>
}

const CARD_W = 120
const CARD_H = 50
const SPACING_Y = 80
const SPACING_X = 160
const PHANTOM_ID = '__phantom_placeholder__'

const HIERARCHICAL_RELATIONS = new Set([
  'contains', 'extends', 'has_method', 'imports',
  'has_library', 'has_framework', 'has_runtime', 'compiles_to',
])

function isHierarchical(relation: string): boolean {
  return HIERARCHICAL_RELATIONS.has(relation?.toLowerCase())
}

/**
 * d3-force positioning force: pulls nodes toward target coordinates.
 * Unlike fx/fy pinning (which completely immobilises a node), this force
 * applies velocity adjustments each tick so other forces (charge, link)
 * can still nudge nodes — useful when many interconnected nodes exist.
 *
 * strength=0.45 means each tick the node covers 45% of (target - current)
 * * alpha — dominated at high alpha, softly held at low alpha.
 */
function createNavForce(targets: Map<string, { x: number; y: number }>, strength: number) {
  let nodes: any[];
  function force(alpha: number) {
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i]
      const t = targets.get(n.id)
      if (t) {
        n.vx += (t.x - n.x) * alpha * strength
        n.vy += (t.y - n.y) * alpha * strength
      }
    }
  }
  force.initialize = (n: any[]) => { nodes = n }
  return force
}

export default function GraphCanvas({ nodes, edges, onNodeClick, onNodeDoubleClick, onNodeDeselect, linkMode, linkingState, onLinkDragStart, onLinkDragEnd, onLinkDragCancel, onCreateNode }: Props) {
  const fgRef = useRef<any>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [dashboardState, setDashboardState] = useState<'simulating' | 'idle'>('simulating')
  const overlayRef = useRef<HTMLDivElement>(null)
  const phantomRafRef = useRef<number>()
  const clickTsRef = useRef(0)
  const [navState, setNavState] = useState<NavState>(INITIAL_NAV)
  const containerRef = useRef<HTMLDivElement>(null)
  const initialZoomRef = useRef(false)
  const initialFocusRef = useRef(false)
  const dragStateRef = useRef<{
    dragging: boolean
    sourceNode: any
    sourceSide: string
  }>({ dragging: false, sourceNode: null, sourceSide: '' })
  // Mouse position as state so ForceGraph2D re-renders the canvas during drag
  const [linkMousePos, setLinkMousePos] = useState({ x: 0, y: 0 })
  // Mirror of ForceGraph2D's internal graphData for reading simulation positions.
  // ForceGraph2D's ref does NOT expose graphData() as a method (not in methodNames),
  // so we store it here. ForceGraph2D mutates these node/edge objects with x/y/vx/vy.
  const graphDataRef = useRef<{ nodes: any[]; links: any[] }>({ nodes: [], links: [] })
  // Positioning force for keyboard nav: pulls nodes toward layout targets
  // instead of pinning with fx/fy, so other forces can still influence them.
  const navTargetsRef = useRef<Map<string, { x: number; y: number }>>(new Map())
  // Strength must be high enough to dominate charge+link forces during nav.
  const NAV_FORCE_STRENGTH = 0.45
  const navForceRef = useRef<((alpha: number) => void) & { initialize: (n: any[]) => void } | null>(null)

  // Phantom node creation state
  const [phantomNode, setPhantomNode] = useState<{
    direction: 'child' | 'parent' | 'related'
    x: number
    y: number
    focusedNodeId: string
  } | null>(null)
  const [phantomText, setPhantomText] = useState('')
  const phantomInputRef = useRef<HTMLInputElement>(null)
  const [creatingPhantom, setCreatingPhantom] = useState(false)

  const edgeInfos = useMemo<EdgeInfo[]>(() =>
    edges.map(e => ({ id: e.id, source: e.source, target: e.target, relation: e.relation })),
    [edges],
  )

  const handleClick = useCallback((node: { id: string }) => {
    if (linkMode) return
    const now = Date.now()
    if (now - clickTsRef.current < 300) {
      onNodeDoubleClick(node.id)
      clickTsRef.current = 0
    } else {
      clickTsRef.current = now
      setSelectedId(node.id)
      setNavState({ mode: 'node_focused', focusedNodeId: node.id, edgeIndex: 0, nodeIndex: 0 })
      onNodeClick(node.id)
    }
  }, [onNodeClick, onNodeDoubleClick, linkMode])

  const handleBackgroundClick = useCallback(() => {
    setSelectedId(null)
    setNavState(INITIAL_NAV)
    onNodeDeselect?.()
    navTargetsRef.current.clear()
    const fg = fgRef.current
    if (fg) {
      fg.d3Force('nav-layout', null)
      fg.d3ReheatSimulation()
    }
  }, [onNodeDeselect])

  // Keyboard navigation + Ctrl+Arrow phantom node creation handler
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const handler = (e: KeyboardEvent) => {
      const isCtrl = e.ctrlKey || e.metaKey

      // Escape during phantom creation — cancel
      if (e.key === 'Escape' && phantomNode) {
        e.preventDefault()
        setPhantomNode(null)
        setPhantomText('')
        return
      }

      // Ctrl+Arrow — create phantom node in the given direction
      if (isCtrl && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        if (navState.mode === 'idle' || !navState.focusedNodeId) return
        e.preventDefault()
        console.log(`[Ctrl+Arrow] Creating ${e.key === 'ArrowDown' ? 'child' : e.key === 'ArrowUp' ? 'parent' : 'related'} phantom node from focused node ${navState.focusedNodeId}`)
        const dirMap: Record<string, 'child' | 'parent' | 'related'> = {
          ArrowDown: 'child',
          ArrowUp: 'parent',
          ArrowRight: 'related',
          ArrowLeft: 'related',
        }
        const direction = dirMap[e.key]
        const fg = fgRef.current
        if (!fg) return
        const gd = graphDataRef.current
        const focused = gd.nodes.find((n: any) => n.id === navState.focusedNodeId)
        if (!focused) return

        let nx = focused.x, ny = focused.y
        if (direction === 'child') { ny = focused.y + CARD_H + SPACING_Y }
        else if (direction === 'parent') { ny = focused.y - (CARD_H + SPACING_Y) }
        else if (direction === 'related') { nx = focused.x + CARD_W + SPACING_X }

        setPhantomNode({ direction, x: nx, y: ny, focusedNodeId: navState.focusedNodeId })
        setPhantomText('')
        // Focus the input on next render
        setTimeout(() => phantomInputRef.current?.focus(), 50)
        return
      }

      // Existing arrow / escape handling (only when not holding Ctrl)
      if (isCtrl) return
      if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Escape'].includes(e.key)) return
      e.preventDefault()
      const { next, action } = processKey(navState, e.key, edgeInfos)
      setNavState(next)

      const fg = fgRef.current
      if (!fg) return

      if (action?.type === 'select_node' && action.nodeId) {
        setSelectedId(action.nodeId)
        onNodeClick(action.nodeId)
        const gn = graphDataRef.current.nodes.find((n: any) => n.id === action.nodeId)
        if (gn) fg.centerAt(gn.x, gn.y, 400)
      }

      if (action?.type === 'update_layout' && next.focusedNodeId) {
        applyNavLayout(fg, next, edgeInfos)
      }

      if (action?.type === 'clear_highlight') {
        setSelectedId(null)
        onNodeDeselect?.()
        navTargetsRef.current.clear()
        fg.d3Force('nav-layout', null)
        fg.d3ReheatSimulation()
        setTimeout(() => fg.zoomToFit(400, 50), 100)
      }
    }
    el.addEventListener('keydown', handler)
    if (!initialFocusRef.current) {
      el.setAttribute('tabindex', '0')
      el.focus()
      initialFocusRef.current = true
    }
    return () => el.removeEventListener('keydown', handler)
  }, [navState, edgeInfos, onNodeClick, onNodeDeselect, phantomNode])

  // Apply nav layout: register a positioning force that pulls nodes toward
  // layout targets instead of pinning with fx/fy, so charge+link forces can
  // still influence nodes via their interconnected neighbors.
  const applyNavLayout = (fg: any, state: NavState, infos: EdgeInfo[]) => {
    if (!state.focusedNodeId) return
    const gd = graphDataRef.current
    const targets = new Map<string, { x: number; y: number }>()

    const focused = gd.nodes.find((n: any) => n.id === state.focusedNodeId)
    if (!focused) return
    targets.set(state.focusedNodeId, { x: 0, y: 0 })

    const childEdges = getChildEdges(infos, state.focusedNodeId)
    const parentEdges = getParentEdges(infos, state.focusedNodeId)
    const relatedEdges = getRelatedEdges(infos, state.focusedNodeId)

    childEdges.forEach((ce, i) => {
      const tid = getTargetNode(ce, state.focusedNodeId!)
      if (gd.nodes.find((n: any) => n.id === tid)) {
        targets.set(tid, {
          x: (i - (childEdges.length - 1) / 2) * SPACING_X,
          y: CARD_H + SPACING_Y,
        })
      }
    })

    parentEdges.forEach((pe, i) => {
      const tid = getTargetNode(pe, state.focusedNodeId!)
      if (gd.nodes.find((n: any) => n.id === tid)) {
        targets.set(tid, {
          x: (i - (parentEdges.length - 1) / 2) * SPACING_X,
          y: -(CARD_H + SPACING_Y),
        })
      }
    })

    relatedEdges.forEach((re, i) => {
      const tid = getTargetNode(re, state.focusedNodeId!)
      if (gd.nodes.find((n: any) => n.id === tid)) {
        targets.set(tid, {
          x: CARD_W + SPACING_X,
          y: (i - (relatedEdges.length - 1) / 2) * (CARD_H + SPACING_Y),
        })
      }
    })

    navTargetsRef.current = targets
    const navForce = createNavForce(navTargetsRef.current, NAV_FORCE_STRENGTH)
    navForce.initialize(gd.nodes)
    navForceRef.current = navForce
    fg.d3Force('nav-layout', navForce)
    fg.d3ReheatSimulation()
  }

  const handleEngineStop = useCallback(() => {
    setDashboardState('idle')
    if (!initialZoomRef.current && fgRef.current) {
      initialZoomRef.current = true
      setTimeout(() => {
        const fg = fgRef.current
        if (!fg) return
        fg.zoomToFit(400, 50)
        setTimeout(() => {
          const fg2 = fgRef.current
          if (fg2) {
            fg2.zoom(fg2.zoom() * 0.1, 600)
          }
        }, 500)
      }, 100)
    }
  }, [])

  useEffect(() => {
    const fg = fgRef.current
    if (!fg) return
    const charge = fg.d3Force('charge')
    if (charge) charge.strength(-800)
    const link = fg.d3Force('link')
    if (link) link.distance(250)
    fg.d3ReheatSimulation()
  }, [nodes.length])

  // Build highlighted edge sets for visual feedback.
  // 'selected' = keyboard nav highlight (yellow), 'connected' = focused-node edges (blue).
  const highlightedEdges = useMemo(() => {
    const map = new Map<string, 'selected' | 'connected'>()
    const dirs = new Map<string, EdgeDirection>()
    if (navState.mode === 'selecting_child' && navState.focusedNodeId) {
      const childEdges = getChildEdges(edgeInfos, navState.focusedNodeId)
      childEdges.forEach((e, i) => {
        map.set(e.id, 'selected')
        dirs.set(e.id, 'child')
      })
      if (childEdges[navState.edgeIndex]) map.set(childEdges[navState.edgeIndex].id, 'selected')
    }
    if (navState.mode === 'selecting_parent' && navState.focusedNodeId) {
      const parentEdges = getParentEdges(edgeInfos, navState.focusedNodeId)
      parentEdges.forEach((e, i) => {
        map.set(e.id, 'selected')
        dirs.set(e.id, 'parent')
      })
    }
    if (navState.mode === 'selecting_related' && navState.focusedNodeId) {
      const relatedEdges = getRelatedEdges(edgeInfos, navState.focusedNodeId)
      const relatedNodeIds = [...new Set(relatedEdges.map(e => getTargetNode(e, navState.focusedNodeId!)))]
      relatedEdges.forEach(e => map.set(e.id, 'selected'))
      if (relatedNodeIds[navState.nodeIndex]) {
        const nid = relatedNodeIds[navState.nodeIndex]
        relatedEdges.filter(e => getTargetNode(e, navState.focusedNodeId!) === nid).forEach(e => map.set(e.id, 'selected'))
      }
    }
    if (navState.mode === 'selecting_edge' && navState.focusedNodeId) {
      const relatedEdges = getRelatedEdges(edgeInfos, navState.focusedNodeId)
      const relatedNodeIds = [...new Set(relatedEdges.map(e => getTargetNode(e, navState.focusedNodeId!)))]
      const selNodeId = relatedNodeIds[navState.nodeIndex]
      if (selNodeId) {
        const selNodeEdges = relatedEdges.filter(e => getTargetNode(e, navState.focusedNodeId!) === selNodeId)
        if (selNodeEdges[navState.edgeIndex]) map.set(selNodeEdges[navState.edgeIndex].id, 'selected')
      }
    }
    if (navState.mode === 'node_focused' && navState.focusedNodeId) {
      getChildEdges(edgeInfos, navState.focusedNodeId).forEach(e => map.set(e.id, 'connected'))
      getParentEdges(edgeInfos, navState.focusedNodeId).forEach(e => map.set(e.id, 'connected'))
      getRelatedEdges(edgeInfos, navState.focusedNodeId).forEach(e => map.set(e.id, 'connected'))
    }
    return map
  }, [navState, edgeInfos])

  // RAF sync to position the phantom node input overlay at graph coords
  useEffect(() => {
    if (!phantomNode || !fgRef.current) return
    const sync = () => {
      const fg = fgRef.current
      if (!fg || !overlayRef.current) return
      const pos = fg.graph2ScreenCoords(phantomNode.x, phantomNode.y)
      overlayRef.current.style.transform = `translate(${pos.x}px, ${pos.y}px)`
      phantomRafRef.current = requestAnimationFrame(sync)
    }
    phantomRafRef.current = requestAnimationFrame(sync)
    return () => { if (phantomRafRef.current) cancelAnimationFrame(phantomRafRef.current!) }
  }, [phantomNode])

  const handleConfirmPhantom = useCallback(async () => {
    if (!phantomNode || !phantomText.trim() || creatingPhantom) return
    setCreatingPhantom(true)
    try {
      await onCreateNode(phantomText.trim(), phantomNode.focusedNodeId, phantomNode.direction)
    } finally {
      setPhantomNode(null)
      setPhantomText('')
      setCreatingPhantom(false)
    }
  }, [phantomNode, phantomText, creatingPhantom, onCreateNode])

  const graphData = useMemo(() => {
    const result: { nodes: any[]; links: any[] } = {
      nodes: nodes.map(n => ({ id: n.id, label: n.label })),
      links: edges.map(e => ({ source: e.source, target: e.target, id: e.id, relation: e.relation })),
    }
    if (phantomNode) {
      result.nodes.push({
        id: PHANTOM_ID,
        label: '',
        isPhantom: true,
        x: phantomNode.x,
        y: phantomNode.y,
        fx: phantomNode.x,
        fy: phantomNode.y,
      })
      result.links.push({
        id: `${PHANTOM_ID}_edge`,
        source: phantomNode.focusedNodeId,
        target: PHANTOM_ID,
        relation: phantomNode.direction === 'child' ? 'contains' : phantomNode.direction === 'parent' ? 'extends' : 'links_to',
      })
    }
    graphDataRef.current = result
    return result
  }, [nodes, edges, phantomNode])

  return (
    <div
      ref={containerRef}
      style={{ position: 'relative', width: '100%', height: '100%', outline: 'none' }}
    >
      <ForceGraph2D
        ref={fgRef}
        graphData={graphData}
        nodeLabel="label"
        nodeCanvasObject={(node: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
          // Draw preview line if this node is the drag source
          if (dragStateRef.current.dragging && dragStateRef.current.sourceNode === node) {
            const side = dragStateRef.current.sourceSide
            let sx = node.x, sy = node.y
            if (side === 'top') { sy = node.y - CARD_H / 2 }
            else if (side === 'bottom') { sy = node.y + CARD_H / 2 }
            else if (side === 'left') { sx = node.x - CARD_W / 2 }
            else if (side === 'right') { sx = node.x + CARD_W / 2 }
            ctx.save()
            ctx.strokeStyle = '#ffd54f'
            ctx.lineWidth = 2 / globalScale
            ctx.setLineDash([5 / globalScale, 4 / globalScale])
            ctx.beginPath()
            ctx.moveTo(sx, sy)
            ctx.lineTo(linkMousePos.x, linkMousePos.y)
            ctx.stroke()
            ctx.restore()
          }
          const label = String(node.label || '')
          const truncated = label.length > 25 ? label.slice(0, 25) + '…' : label
          const isFocused = navState.focusedNodeId === node.id
          const isPhantom = node.isPhantom === true
          const w = CARD_W
          const h = CARD_H
          const r = 6
          ctx.save()
          ctx.translate(node.x, node.y)
          ctx.beginPath()
          ctx.moveTo(-w / 2 + r, -h / 2)
          ctx.lineTo(w / 2 - r, -h / 2)
          ctx.arc(w / 2 - r, -h / 2 + r, r, -Math.PI / 2, 0)
          ctx.lineTo(w / 2, h / 2 - r)
          ctx.arc(w / 2 - r, h / 2 - r, r, 0, Math.PI / 2)
          ctx.lineTo(-w / 2 + r, h / 2)
          ctx.arc(-w / 2 + r, h / 2 - r, r, Math.PI / 2, Math.PI)
          ctx.lineTo(-w / 2, -h / 2 + r)
          ctx.arc(-w / 2 + r, -h / 2 + r, r, Math.PI, -Math.PI / 2)
          ctx.closePath()
          ctx.fillStyle = isFocused ? '#0f3460' : isPhantom ? 'rgba(15,52,96,0.5)' : '#1a1a2e'
          ctx.fill()
          if (isPhantom) {
            ctx.setLineDash([4 / globalScale, 3 / globalScale])
            ctx.strokeStyle = '#4fc3f7'
            ctx.lineWidth = 2
          } else {
            ctx.setLineDash([])
            ctx.strokeStyle = isFocused ? '#4fc3f7' : '#2a2a4a'
            ctx.lineWidth = isFocused ? 2 : 1
          }
          ctx.stroke()
          ctx.fillStyle = '#e0e0e0'
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'
          ctx.font = `${13 / globalScale}px sans-serif`
          ctx.fillText(isPhantom ? (phantomText || '…') : truncated, 0, 0)
          // Draw connectors in link mode
          if (linkMode) {
            const rConn = 5
            ctx.beginPath()
            ctx.arc(0, -CARD_H / 2, rConn, 0, 2 * Math.PI)
            ctx.fillStyle = '#ffb300'
            ctx.fill()
            ctx.strokeStyle = '#f0f0f0'
            ctx.lineWidth = 1.5
            ctx.stroke()
            ctx.beginPath()
            ctx.arc(0, CARD_H / 2, rConn, 0, 2 * Math.PI)
            ctx.fillStyle = '#66bb6a'
            ctx.fill()
            ctx.strokeStyle = '#f0f0f0'
            ctx.lineWidth = 1.5
            ctx.stroke()
            ctx.beginPath()
            ctx.arc(-CARD_W / 2, 0, rConn, 0, 2 * Math.PI)
            ctx.fillStyle = '#42a5f5'
            ctx.fill()
            ctx.strokeStyle = '#f0f0f0'
            ctx.lineWidth = 1.5
            ctx.stroke()
            ctx.beginPath()
            ctx.arc(CARD_W / 2, 0, rConn, 0, 2 * Math.PI)
            ctx.fillStyle = '#42a5f5'
            ctx.fill()
            ctx.strokeStyle = '#f0f0f0'
            ctx.lineWidth = 1.5
            ctx.stroke()
          }
          ctx.restore()
        }}
        nodePointerAreaPaint={(node: any, color: string, ctx: CanvasRenderingContext2D, globalScale: number) => {
          // Pad hit area so nodes stay clickable at low zoom (15 screen px buffer)
          const pad = 15 / globalScale
          const w = CARD_W + pad * 2
          const h = CARD_H + pad * 2
          const r = 6
          ctx.save()
          ctx.translate(node.x, node.y)
          ctx.beginPath()
          ctx.moveTo(-w / 2 + r, -h / 2)
          ctx.lineTo(w / 2 - r, -h / 2)
          ctx.arc(w / 2 - r, -h / 2 + r, r, -Math.PI / 2, 0)
          ctx.lineTo(w / 2, h / 2 - r)
          ctx.arc(w / 2 - r, h / 2 - r, r, 0, Math.PI / 2)
          ctx.lineTo(-w / 2 + r, h / 2)
          ctx.arc(-w / 2 + r, h / 2 - r, r, Math.PI / 2, Math.PI)
          ctx.lineTo(-w / 2, -h / 2 + r)
          ctx.arc(-w / 2 + r, -h / 2 + r, r, Math.PI, -Math.PI / 2)
          ctx.closePath()
          ctx.fillStyle = color
          ctx.fill()
          // Connector hit areas in link mode
          if (linkMode) {
            const hs = 6
            ctx.beginPath()
            ctx.rect(0 - hs, -CARD_H / 2 - hs, hs * 2, hs * 2)
            ctx.fillStyle = color
            ctx.fill()
            ctx.beginPath()
            ctx.rect(0 - hs, CARD_H / 2 - hs, hs * 2, hs * 2)
            ctx.fillStyle = color
            ctx.fill()
            ctx.beginPath()
            ctx.rect(-CARD_W / 2 - hs, 0 - hs, hs * 2, hs * 2)
            ctx.fillStyle = color
            ctx.fill()
            ctx.beginPath()
            ctx.rect(CARD_W / 2 - hs, 0 - hs, hs * 2, hs * 2)
            ctx.fillStyle = color
            ctx.fill()
          }
          ctx.restore()
        }}
        linkCanvasObject={(link: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
          const source = typeof link.source === 'object' ? link.source : { x: 0, y: 0 }
          const target = typeof link.target === 'object' ? link.target : { x: 0, y: 0 }
          const sx = source.x; const sy = source.y
          const tx = target.x; const ty = target.y
          const isHier = isHierarchical(link.relation)
          const edgeType = highlightedEdges.get(link.id)
          const highlightColor = edgeType === 'selected' ? '#ffd54f' : edgeType === 'connected' ? '#4fc3f7' : null
          let p0x: number, p0y: number, p3x: number, p3y: number
          let cp1x: number, cp1y: number, cp2x: number, cp2y: number
          if (isHier) {
            const gap = Math.abs(sy - ty) * 0.3
            p0x = sx; p0y = sy + CARD_H / 2
            p3x = tx; p3y = ty - CARD_H / 2
            cp1x = sx; cp1y = sy + CARD_H / 2 + gap
            cp2x = tx; cp2y = ty - CARD_H / 2 - gap
          } else {
            const gap = Math.abs(sx - tx) * 0.3
            p0x = sx + CARD_W / 2; p0y = sy
            p3x = tx - CARD_W / 2; p3y = ty
            cp1x = sx + CARD_W / 2 + gap; cp1y = sy
            cp2x = tx - CARD_W / 2 - gap; cp2y = ty
          }
          ctx.beginPath()
          ctx.moveTo(p0x, p0y)
          ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, p3x, p3y)
          ctx.strokeStyle = highlightColor ?? (isHier ? '#666' : '#444')
          ctx.lineWidth = highlightColor ? 3 : 1.5
          ctx.setLineDash(highlightColor || isHier ? [] : [5, 4])
          ctx.stroke()
          const angle = Math.atan2(p3y - cp2y, p3x - cp2x)
          ctx.save()
          ctx.translate(p3x, p3y)
          ctx.rotate(angle)
          ctx.beginPath()
          ctx.moveTo(6, 0)
          ctx.lineTo(-6, -4)
          ctx.lineTo(-6, 4)
          ctx.closePath()
          ctx.fillStyle = highlightColor ?? (isHier ? '#666' : '#444')
          ctx.fill()
          ctx.restore()
        }}
        linkColor={(link: any) => {
          const edgeType = highlightedEdges.get(link.id)
          if (edgeType === 'selected') return '#ffd54f'
          if (edgeType === 'connected') return '#4fc3f7'
          return isHierarchical(link.relation) ? '#666' : '#444'
        }}
        linkLineDash={(link: any) => {
          return isHierarchical(link.relation) ? null : [5, 4]
        }}
        linkWidth={(link: any) => highlightedEdges.has(link.id) ? 3 : 1.5}
        linkDirectionalArrowLength={6}
        linkDirectionalArrowColor={(link: any) => {
          const edgeType = highlightedEdges.get(link.id)
          if (edgeType === 'selected') return '#ffd54f'
          if (edgeType === 'connected') return '#4fc3f7'
          return isHierarchical(link.relation) ? '#666' : '#444'
        }}
        backgroundColor="#1a1a2e"
        onNodeClick={handleClick}
        onBackgroundClick={handleBackgroundClick}
        onEngineStop={handleEngineStop}
        d3VelocityDecay={0.6}
        d3AlphaDecay={0.005}
        warmupTicks={100}
        cooldownTime={15000}
      />

      {linkMode && (
        <div
          style={{
            position: 'absolute', left: 0, top: 0, right: 0, bottom: 0,
            pointerEvents: 'auto', zIndex: 5,
          }}
          onPointerDown={(e) => {
            const rect = containerRef.current?.getBoundingClientRect()
            if (!rect || !fgRef.current) return
            const x = e.clientX - rect.left
            const y = e.clientY - rect.top
            const graphPos = fgRef.current.screen2GraphCoords(x, y)
            const nodes = graphDataRef.current.nodes
            const zoom = fgRef.current.zoom()
            const tol = 15 / zoom
            for (const n of nodes) {
              const dx = graphPos.x - n.x, dy = graphPos.y - n.y
              const nearTop = Math.abs(dx) <= tol && Math.abs(dy + CARD_H / 2) <= tol
              const nearBottom = Math.abs(dx) <= tol && Math.abs(dy - CARD_H / 2) <= tol
              const nearLeft = Math.abs(dx + CARD_W / 2) <= tol && Math.abs(dy) <= tol
              const nearRight = Math.abs(dx - CARD_W / 2) <= tol && Math.abs(dy) <= tol
              if (nearTop || nearBottom || nearLeft || nearRight) {
                const side = nearTop ? 'top' : nearBottom ? 'bottom' : nearLeft ? 'left' : 'right'
                dragStateRef.current = { dragging: true, sourceNode: n, sourceSide: side }
                setLinkMousePos({ x: graphPos.x, y: graphPos.y })
                onLinkDragStart(n.id, side, n.label || '')
                break
              }
            }
          }}
          onPointerMove={(e) => {
            if (!dragStateRef.current.dragging) return
            const rect = containerRef.current?.getBoundingClientRect()
            if (!rect || !fgRef.current) return
            const x = e.clientX - rect.left
            const y = e.clientY - rect.top
            const graphPos = fgRef.current.screen2GraphCoords(x, y)
            setLinkMousePos({ x: graphPos.x, y: graphPos.y })
          }}
          onPointerUp={(e) => {
            if (!dragStateRef.current.dragging) return
            const rect = containerRef.current?.getBoundingClientRect()
            if (!rect || !fgRef.current) return
            const x = e.clientX - rect.left
            const y = e.clientY - rect.top
            const graphPos = fgRef.current.screen2GraphCoords(x, y)
            const zoom = fgRef.current.zoom()
            const pad = 15 / zoom
            const nodes = graphDataRef.current.nodes
            let targetNode: any = null
            for (const n of nodes) {
              if (n === dragStateRef.current.sourceNode) continue
              if (Math.abs(graphPos.x - n.x) <= CARD_W / 2 + pad && Math.abs(graphPos.y - n.y) <= CARD_H / 2 + pad) {
                targetNode = n
                break
              }
            }
            if (targetNode) {
              onLinkDragEnd(targetNode.id, targetNode.label)
            } else {
              onLinkDragCancel()
            }
            dragStateRef.current = { dragging: false, sourceNode: null, sourceSide: '' }
          }}
        />
      )}

      {phantomNode && (
        <div
          ref={overlayRef}
          style={{
            position: 'absolute', left: 0, top: 0,
            pointerEvents: 'none',
            transform: 'translate(0, 0)',
            zIndex: 80,
          }}
        >
          <div style={{ pointerEvents: 'auto' }}>
            <div className="phantom-node-input">
              <input
                ref={phantomInputRef}
                type="text"
                placeholder={
                  phantomNode.direction === 'child' ? 'Child node name…' :
                  phantomNode.direction === 'parent' ? 'Parent node name…' :
                  'Related node name…'
                }
                value={phantomText}
                onChange={e => setPhantomText(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && phantomText.trim()) {
                    handleConfirmPhantom()
                  }
                  if (e.key === 'Escape') {
                    setPhantomNode(null)
                    setPhantomText('')
                  }
                }}
                disabled={creatingPhantom}
                className="phantom-input"
              />
              <button
                className="phantom-confirm-btn"
                onClick={handleConfirmPhantom}
                disabled={!phantomText.trim() || creatingPhantom}
              >
                {creatingPhantom ? '…' : '✓'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
