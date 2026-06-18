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
}

const CARD_W = 120
const CARD_H = 50
const SPACING_Y = 80
const SPACING_X = 160

export default function GraphCanvas({ nodes, edges, onNodeClick, onNodeDoubleClick }: Props) {
  const fgRef = useRef<any>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [dashboardState, setDashboardState] = useState<'simulating' | 'idle'>('simulating')
  const overlayRef = useRef<HTMLDivElement>(null)
  const rafRef = useRef<number>()
  const clickTsRef = useRef(0)
  const [navState, setNavState] = useState<NavState>(INITIAL_NAV)
  const containerRef = useRef<HTMLDivElement>(null)

  const edgeInfos = useMemo<EdgeInfo[]>(() =>
    edges.map(e => ({ id: e.id, source: e.source, target: e.target, relation: e.relation })),
    [edges],
  )

  const handleClick = useCallback((node: { id: string }) => {
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
  }, [onNodeClick, onNodeDoubleClick])

  const handleBackgroundClick = useCallback(() => {
    setSelectedId(null)
    setNavState(INITIAL_NAV)
  }, [])

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
        // Release all fixed positions
        fg.graphData().nodes.forEach((n: any) => { n.fx = undefined; n.fy = undefined })
        fg.d3ReheatSimulation()
        setTimeout(() => fg.zoomToFit(400, 50), 100)
      }
    }
    el.addEventListener('keydown', handler)
    el.setAttribute('tabindex', '0')
    el.focus()
    return () => el.removeEventListener('keydown', handler)
  }, [navState, edgeInfos, onNodeClick])

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

  // Zoom-to-fit on first load
  useEffect(() => {
    if (nodes.length > 0 && fgRef.current) {
      setTimeout(() => fgRef.current?.zoomToFit(400, 50), 100)
    }
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
        nodeColor={(node: any) => {
          if (navState.focusedNodeId === node.id) return '#ffd54f'
          return '#4fc3f7'
        }}
        nodeRelSize={6}
        linkColor={(link: any) => {
          if (highlightedEdges.has(link.id)) return '#ffd54f'
          return '#2a2a4a'
        }}
        linkWidth={(link: any) => highlightedEdges.has(link.id) ? 3 : 1.5}
        linkDirectionalArrowLength={6}
        linkDirectionalArrowColor={(link: any) => highlightedEdges.has(link.id) ? '#ffd54f' : '#2a2a4a'}
        backgroundColor="#1a1a2e"
        onNodeClick={handleClick}
        onBackgroundClick={handleBackgroundClick}
        onEngineStop={() => setDashboardState('idle')}
        d3VelocityDecay={0.6}
        d3AlphaDecay={0.005}
        warmupTicks={100}
        cooldownTime={15000}
      />

      {selectedId && dashboardState === 'idle' && (
        <div
          ref={overlayRef}
          style={{
            position: 'absolute', left: 0, top: 0,
            pointerEvents: 'none', zIndex: 10,
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
