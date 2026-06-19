import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ForceGraph2D from 'react-force-graph-2d'
import SelectedNodeCard from './SelectedNodeCard'
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
}

const CARD_W = 120
const CARD_H = 50
const SPACING_Y = 80
const SPACING_X = 160

const HIERARCHICAL_RELATIONS = new Set([
  'contains', 'extends', 'has_method', 'imports',
  'has_library', 'has_framework', 'has_runtime', 'compiles_to',
])

function isHierarchical(relation: string): boolean {
  return HIERARCHICAL_RELATIONS.has(relation?.toLowerCase())
}

export default function GraphCanvas({ nodes, edges, onNodeClick, onNodeDoubleClick, onNodeDeselect, linkMode, linkingState, onLinkDragStart, onLinkDragEnd, onLinkDragCancel }: Props) {
  const fgRef = useRef<any>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [dashboardState, setDashboardState] = useState<'simulating' | 'idle'>('simulating')
  const overlayRef = useRef<HTMLDivElement>(null)
  const rafRef = useRef<number>()
  const clickTsRef = useRef(0)
  const [navState, setNavState] = useState<NavState>(INITIAL_NAV)
  const containerRef = useRef<HTMLDivElement>(null)
  const initialZoomRef = useRef(false)
  const initialFocusRef = useRef(false)
  const dragStateRef = useRef<{
    dragging: boolean
    sourceNode: any
    sourceSide: string
    mouseX: number
    mouseY: number
  }>({ dragging: false, sourceNode: null, sourceSide: '', mouseX: 0, mouseY: 0 })

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
  }, [onNodeDeselect])

  // Keyboard navigation handler
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const handler = (e: KeyboardEvent) => {
      if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Escape'].includes(e.key)) return
      e.preventDefault()
      const { next, action } = processKey(navState, e.key, edgeInfos)
      setNavState(next)

      const fg = fgRef.current
      if (!fg) return

      if (action?.type === 'select_node' && action.nodeId) {
        // Navigate to target node
        setSelectedId(action.nodeId)
        onNodeClick(action.nodeId)
        const gn = fg.graphData().nodes.find((n: any) => n.id === action.nodeId)
        if (gn) fg.centerAt(gn.x, gn.y, 400)
      }

      if (action?.type === 'update_layout' && next.focusedNodeId) {
        applyNavLayout(fg, next, edgeInfos)
      }

      if (action?.type === 'clear_highlight') {
        setSelectedId(null)
        onNodeDeselect?.()
        // Release all fixed positions
        fg.graphData().nodes.forEach((n: any) => { n.fx = undefined; n.fy = undefined })
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
  }, [navState, edgeInfos, onNodeClick, onNodeDeselect])

  // Apply nav layout: arrange nodes around focused node
  const applyNavLayout = (fg: any, state: NavState, infos: EdgeInfo[]) => {
    if (!state.focusedNodeId) return
    const gd = fg.graphData()
    // First, release all positions
    gd.nodes.forEach((n: any) => { n.fx = undefined; n.fy = undefined })

    const focused = gd.nodes.find((n: any) => n.id === state.focusedNodeId)
    if (!focused) return
    focused.fx = 0
    focused.fy = 0

    const childEdges = getChildEdges(infos, state.focusedNodeId)
    const parentEdges = getParentEdges(infos, state.focusedNodeId)
    const relatedEdges = getRelatedEdges(infos, state.focusedNodeId)

    // Children below, spread horizontally
    childEdges.forEach((ce, i) => {
      const tid = getTargetNode(ce, state.focusedNodeId!)
      const n = gd.nodes.find((n: any) => n.id === tid)
      if (n) {
        n.fx = (i - (childEdges.length - 1) / 2) * SPACING_X
        n.fy = CARD_H + SPACING_Y
      }
    })

    // Parents above, spread horizontally
    parentEdges.forEach((pe, i) => {
      const tid = getTargetNode(pe, state.focusedNodeId!)
      const n = gd.nodes.find((n: any) => n.id === tid)
      if (n) {
        n.fx = (i - (parentEdges.length - 1) / 2) * SPACING_X
        n.fy = -(CARD_H + SPACING_Y)
      }
    })

    // Related to the right, spread vertically
    relatedEdges.forEach((re, i) => {
      const tid = getTargetNode(re, state.focusedNodeId!)
      const n = gd.nodes.find((n: any) => n.id === tid)
      if (n) {
        n.fx = CARD_W + SPACING_X
        n.fy = (i - (relatedEdges.length - 1) / 2) * (CARD_H + SPACING_Y)
      }
    })

    fg.d3ReheatSimulation()
  }

  // RAF overlay sync for selected node card
  useEffect(() => {
    if (dashboardState !== 'idle' || !selectedId) return
    const sync = () => {
      const fg = fgRef.current
      if (!fg || !overlayRef.current) return
      const gn = fg.graphData().nodes.find((n: any) => n.id === selectedId)
      if (!gn) return
      const pos = fg.screenCoords(gn.x, gn.y)
      overlayRef.current.style.transform = `translate(${pos.x}px, ${pos.y}px)`
      rafRef.current = requestAnimationFrame(sync)
    }
    rafRef.current = requestAnimationFrame(sync)
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current!) }
  }, [dashboardState, selectedId])

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

  // Build highlighted edge/direction sets for visual feedback
  const highlightedEdges = useMemo(() => {
    const set = new Set<string>()
    const dirs = new Map<string, EdgeDirection>()
    if (navState.mode === 'selecting_child' && navState.focusedNodeId) {
      const childEdges = getChildEdges(edgeInfos, navState.focusedNodeId)
      childEdges.forEach((e, i) => {
        set.add(e.id)
        dirs.set(e.id, 'child')
      })
      if (childEdges[navState.edgeIndex]) set.add(childEdges[navState.edgeIndex].id)
    }
    if (navState.mode === 'selecting_parent' && navState.focusedNodeId) {
      const parentEdges = getParentEdges(edgeInfos, navState.focusedNodeId)
      parentEdges.forEach((e, i) => {
        set.add(e.id)
        dirs.set(e.id, 'parent')
      })
    }
    if (navState.mode === 'selecting_related' && navState.focusedNodeId) {
      const relatedEdges = getRelatedEdges(edgeInfos, navState.focusedNodeId)
      const relatedNodeIds = [...new Set(relatedEdges.map(e => getTargetNode(e, navState.focusedNodeId!)))]
      relatedEdges.forEach(e => set.add(e.id))
      if (relatedNodeIds[navState.nodeIndex]) {
        const nid = relatedNodeIds[navState.nodeIndex]
        relatedEdges.filter(e => getTargetNode(e, navState.focusedNodeId!) === nid).forEach(e => set.add(e.id))
      }
    }
    if (navState.mode === 'node_focused' && navState.focusedNodeId) {
      getChildEdges(edgeInfos, navState.focusedNodeId).forEach(e => set.add(e.id))
      getParentEdges(edgeInfos, navState.focusedNodeId).forEach(e => set.add(e.id))
      getRelatedEdges(edgeInfos, navState.focusedNodeId).forEach(e => set.add(e.id))
    }
    return set
  }, [navState, edgeInfos])

  const graphData = useMemo(() => ({
    nodes: nodes.map(n => ({ id: n.id, label: n.label })),
    links: edges.map(e => ({ source: e.source, target: e.target, id: e.id, relation: e.relation })),
  }), [nodes, edges])

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
            ctx.lineTo(dragStateRef.current.mouseX, dragStateRef.current.mouseY)
            ctx.stroke()
            ctx.restore()
          }
          const label = String(node.label || '')
          const truncated = label.length > 25 ? label.slice(0, 25) + '…' : label
          const isFocused = navState.focusedNodeId === node.id
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
          ctx.fillStyle = isFocused ? '#0f3460' : '#1a1a2e'
          ctx.fill()
          ctx.strokeStyle = isFocused ? '#4fc3f7' : '#2a2a4a'
          ctx.lineWidth = isFocused ? 2 : 1
          ctx.stroke()
          ctx.fillStyle = '#e0e0e0'
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'
          ctx.font = `${13 / globalScale}px sans-serif`
          ctx.fillText(truncated, 0, 0)
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
        nodePointerAreaPaint={(node: any, color: string, ctx: CanvasRenderingContext2D) => {
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
          const isHighlighted = highlightedEdges.has(link.id)
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
          ctx.strokeStyle = isHighlighted ? '#ffd54f' : (isHier ? '#666' : '#444')
          ctx.lineWidth = isHighlighted ? 3 : 1.5
          ctx.setLineDash(isHighlighted || isHier ? [] : [5, 4])
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
          ctx.fillStyle = isHighlighted ? '#ffd54f' : (isHier ? '#666' : '#444')
          ctx.fill()
          ctx.restore()
        }}
        linkColor={(link: any) => {
          if (highlightedEdges.has(link.id)) return '#ffd54f'
          return isHierarchical(link.relation) ? '#666' : '#444'
        }}
        linkLineDash={(link: any) => {
          return isHierarchical(link.relation) ? null : [5, 4]
        }}
        linkWidth={(link: any) => highlightedEdges.has(link.id) ? 3 : 1.5}
        linkDirectionalArrowLength={6}
        linkDirectionalArrowColor={(link: any) => {
          if (highlightedEdges.has(link.id)) return '#ffd54f'
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
            const nodes = fgRef.current.graphData().nodes
            for (const n of nodes) {
              const dx = graphPos.x - n.x, dy = graphPos.y - n.y
              const nearTop = Math.abs(dx) <= 10 && Math.abs(dy + CARD_H / 2) <= 10
              const nearBottom = Math.abs(dx) <= 10 && Math.abs(dy - CARD_H / 2) <= 10
              const nearLeft = Math.abs(dx + CARD_W / 2) <= 10 && Math.abs(dy) <= 10
              const nearRight = Math.abs(dx - CARD_W / 2) <= 10 && Math.abs(dy) <= 10
              if (nearTop || nearBottom || nearLeft || nearRight) {
                const side = nearTop ? 'top' : nearBottom ? 'bottom' : nearLeft ? 'left' : 'right'
                dragStateRef.current = { dragging: true, sourceNode: n, sourceSide: side, mouseX: graphPos.x, mouseY: graphPos.y }
                onLinkDragStart(n.id, side, nearTop ? 'hierarchy-in' : nearBottom ? 'hierarchy-out' : 'related')
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
            dragStateRef.current.mouseX = graphPos.x
            dragStateRef.current.mouseY = graphPos.y
          }}
          onPointerUp={(e) => {
            if (!dragStateRef.current.dragging) return
            const rect = containerRef.current?.getBoundingClientRect()
            if (!rect || !fgRef.current) return
            const x = e.clientX - rect.left
            const y = e.clientY - rect.top
            const graphPos = fgRef.current.screen2GraphCoords(x, y)
            const nodes = fgRef.current.graphData().nodes
            let targetNode: any = null
            for (const n of nodes) {
              if (n === dragStateRef.current.sourceNode) continue
              if (Math.abs(graphPos.x - n.x) <= CARD_W / 2 && Math.abs(graphPos.y - n.y) <= CARD_H / 2) {
                targetNode = n
                break
              }
            }
            if (targetNode) {
              onLinkDragEnd(targetNode.id, targetNode.label)
            } else {
              onLinkDragCancel()
            }
            dragStateRef.current = { dragging: false, sourceNode: null, sourceSide: '', mouseX: 0, mouseY: 0 }
          }}
        />
      )}

      {selectedId && dashboardState === 'idle' && (
        <div
          ref={overlayRef}
          style={{
            position: 'absolute', left: 0, top: 0,
            pointerEvents: 'none', zIndex: 70,
            transform: 'translate(0, 0)',
          }}
        >
          <div style={{ pointerEvents: 'auto' }}>
            <SelectedNodeCard
              node={{ id: selectedId, label: graphData.nodes.find((n: any) => n.id === selectedId)?.label || '' }}
              onClose={() => setSelectedId(null)}
            />
          </div>
        </div>
      )}
    </div>
  )
}
