import { useCallback, useEffect, useRef, useState } from 'react'
import ForceGraph2D from 'react-force-graph-2d'
import SelectedNodeCard from './SelectedNodeCard'
import type { Node, Edge } from '../types'

interface Props {
  nodes: Node[]
  edges: Edge[]
  onNodeClick: (nodeId: string) => void
  onNodeDoubleClick: (nodeId: string) => void
}

export default function GraphCanvas({ nodes, edges, onNodeClick, onNodeDoubleClick }: Props) {
  const fgRef = useRef<any>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [dashboardState, setDashboardState] = useState<'simulating' | 'idle'>('simulating')
  const overlayRef = useRef<HTMLDivElement>(null)
  const posRef = useRef({ x: 0, y: 0 })
  const rafRef = useRef<number>()
  const clickTsRef = useRef(0)

  const handleClick = useCallback((node: { id: string }) => {
    const now = Date.now()
    if (now - clickTsRef.current < 300) {
      onNodeDoubleClick(node.id)
      clickTsRef.current = 0
    } else {
      clickTsRef.current = now
      setSelectedId(node.id)
      onNodeClick(node.id)
    }
  }, [onNodeClick, onNodeDoubleClick])

  const handleBackgroundClick = useCallback(() => {
    setSelectedId(null)
  }, [])

  // RAF loop: sync overlay position to node coords when idle
  useEffect(() => {
    if (dashboardState !== 'idle' || !selectedId) return
    const sync = () => {
      const fg = fgRef.current
      if (!fg || !overlayRef.current) return
      const gn = fg.graphData().nodes.find((n: any) => n.id === selectedId)
      if (!gn) return
      const pos = fg.screenCoords(gn.x, gn.y)
      posRef.current = { x: pos.x, y: pos.y }
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

  const graphData = {
    nodes: nodes.map(n => ({ id: n.id, label: n.label })),
    links: edges.map(e => ({ source: e.source, target: e.target, id: e.id, relation: e.relation })),
  }

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <ForceGraph2D
        ref={fgRef}
        graphData={graphData}
        nodeLabel="label"
        nodeColor={() => '#4fc3f7'}
        nodeRelSize={6}
        linkColor={() => '#2a2a4a'}
        linkWidth={1.5}
        linkDirectionalArrowLength={6}
        linkDirectionalArrowColor={() => '#2a2a4a'}
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
              node={{ id: selectedId, label: graphData.nodes.find(n => n.id === selectedId)?.label || '' }}
              onClose={() => setSelectedId(null)}
            />
          </div>
        </div>
      )}
    </div>
  )
}
