import { useState, useEffect, useCallback } from 'react'
import SearchBar from './components/SearchBar'
import GraphCanvas from './components/GraphCanvas'
import NodePanel from './components/NodePanel'
import StatusBar from './components/StatusBar'
import LinkModal from './components/LinkModal'
import { callMcp } from './lib/mcp'
import type { Edge, Node, SubgraphResult } from './types'

interface GraphData {
  nodes: Node[]
  edges: SubgraphResult['edges']
}

function App() {
  const [graphData, setGraphData] = useState<GraphData | null>(null)
  const [selectedNode, setSelectedNode] = useState<Node | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [createLabel, setCreateLabel] = useState('')
  const [linkMode, setLinkMode] = useState(false)
  const [linkingState, setLinkingState] = useState<{
    sourceNodeId: string
    sourceSide: string
    sourceLabel: string
  } | null>(null)
  const [linkModalInfo, setLinkModalInfo] = useState<{
    sourceId: string
    sourceLabel: string
    targetId: string
    targetLabel: string
    defaultSide: string
  } | null>(null)
  const [existingRelations, setExistingRelations] = useState<string[]>([])

  useEffect(() => {
    const loadInitialGraph = async () => {
      setLoading(true)
      setError(null)
      try {
        const [nodeResult, edgeResult] = await Promise.all([
          callMcp<{ items: Node[] }>('list_nodes', { limit: 5000 }),
          callMcp<{ items: Edge[] }>('list_edges', { limit: 5000 }),
        ])
        if (nodeResult.items.length === 0) return

        setGraphData({ nodes: nodeResult.items, edges: edgeResult.items })
        const homeNode = nodeResult.items.find(n => n.label === 'Home')
        if (homeNode) setSelectedNode(homeNode)
      } catch (e) {
        console.warn('Initial graph load:', e instanceof Error ? e.message : e)
      } finally {
        setLoading(false)
      }
    }
    loadInitialGraph()
    loadRelations()
  }, [])

  const loadRelations = async () => {
    try {
      const relations = await callMcp<string[]>('list_relations', {})
      setExistingRelations(relations)
    } catch {
      // backend may not have list_relations yet
    }
  }

  const getDefaultRelation = (side: string): string => {
    switch (side) {
      case 'bottom': return 'contains'
      case 'top': return 'extends'
      default: return 'links_to'
    }
  }

  const handleLinkCreated = useCallback(async (
    sourceId: string,
    targetId: string,
    sourceSide: string,
  ) => {
    setLinkModalInfo({
      sourceId,
      sourceLabel: graphData?.nodes.find(n => n.id === sourceId)?.label || sourceId,
      targetId,
      targetLabel: graphData?.nodes.find(n => n.id === targetId)?.label || targetId,
      defaultSide: sourceSide,
    })
  }, [graphData])

  const handleLinkDragStart = useCallback((sourceNodeId: string, side: string, sourceLabel: string) => {
    setLinkingState({ sourceNodeId, sourceSide: side, sourceLabel })
  }, [])

  const handleLinkDragEnd = useCallback((targetNodeId: string, targetLabel: string) => {
    if (!linkingState) return
    handleLinkCreated(linkingState.sourceNodeId, targetNodeId, linkingState.sourceSide)
    setLinkingState(null)
  }, [linkingState, handleLinkCreated])

  const handleLinkDragCancel = useCallback(() => {
    setLinkingState(null)
  }, [])

  const handleLinkConfirm = async (relation: string, properties: Record<string, unknown>) => {
    if (!linkModalInfo) return
    setLoading(true)
    try {
      const newEdge = await callMcp<Edge>('add_edge', {
        source: linkModalInfo.sourceId,
        target: linkModalInfo.targetId,
        relation,
        properties,
        weight: 1.0,
      })
      setGraphData(prev => prev ? {
        ...prev,
        edges: [...prev.edges, { ...newEdge, id: newEdge.id || crypto.randomUUID() }],
      } : prev)
      setLinkModalInfo(null)
      setLinkMode(false)
      // refresh relation list
      loadRelations()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create edge')
    } finally {
      setLoading(false)
    }
  }

  const handleNodeSelect = async (nodeId: string) => {
    setLoading(true)
    setError(null)
    try {
      const subgraph = await callMcp<SubgraphResult>('get_subgraph', { node_id: nodeId, depth: 2 })
      setGraphData({ nodes: subgraph.nodes, edges: subgraph.edges })
      const node = subgraph.nodes.find(n => n.id === nodeId)
      if (node) setSelectedNode(node)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load subgraph')
    } finally {
      setLoading(false)
    }
  }

  const handleNodeClick = async (nodeId: string) => {
    try {
      const node = await callMcp<Node>('get_node', { node_id: nodeId })
      setSelectedNode(node)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load node')
    }
  }

  const handleNodeDoubleClick = async (nodeId: string) => {
    if (!graphData) return
    setLoading(true)
    try {
      const subgraph = await callMcp<SubgraphResult>('get_subgraph', { node_id: nodeId, depth: 2 })
      const existingIds = new Set(graphData.nodes.map(n => n.id))
      const newNodes = subgraph.nodes.filter(n => !existingIds.has(n.id))
      const existingEdgeIds = new Set(graphData.edges.map(e => e.id))
      const newEdges = subgraph.edges.filter(e => !existingEdgeIds.has(e.id))
      setGraphData(prev => prev ? {
        nodes: [...prev.nodes, ...newNodes],
        edges: [...prev.edges, ...newEdges],
      } : { nodes: subgraph.nodes, edges: subgraph.edges })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to expand graph')
    } finally {
      setLoading(false)
    }
  }

  const handleCreateNode = async () => {
    const label = createLabel.trim()
    if (!label) return
    setLoading(true)
    setError(null)
    try {
      const node = await callMcp<Node>('add_node', { label, properties: {} })
      setShowCreate(false)
      setCreateLabel('')
      await handleNodeSelect(node.id)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create node')
    } finally {
      setLoading(false)
    }
  }

  const handleLinkModeToggle = () => {
    setLinkMode(prev => !prev)
  }

  const handleCreatePhantomNode = useCallback(async (
    label: string,
    parentId: string,
    direction: 'child' | 'parent' | 'related',
  ) => {
    setLoading(true)
    setError(null)
    try {
      const node = await callMcp<Node>('add_node', { label, properties: {} })
      const relation =
        direction === 'child' ? 'contains' :
        direction === 'parent' ? 'extends' :
        'links_to'
      const edge = await callMcp<Edge>('add_edge', {
        source: direction === 'parent' ? node.id : parentId,
        target: direction === 'parent' ? parentId : node.id,
        relation,
        properties: {},
        weight: 1.0,
      })
      setGraphData(prev => prev ? {
        ...prev,
        nodes: [...prev.nodes, node],
        edges: [...prev.edges, { ...edge, id: edge.id || crypto.randomUUID() }],
      } : prev)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create node')
    } finally {
      setLoading(false)
    }
  }, [])

  return (
    <div className={`app${linkMode ? ' link-mode-cursor' : ''}`}>
      <header className="app-header">
        <h1>Knowledge Graph</h1>
        <SearchBar onNodeSelect={handleNodeSelect} />
        <button className="create-btn" onClick={() => setShowCreate(true)}>+ New</button>
        <button
          className={`link-btn${linkMode ? ' active' : ''}`}
          onClick={handleLinkModeToggle}
        >
          {linkMode ? 'Cancel Link' : 'Link'}
        </button>
      </header>

      {showCreate && (
        <div className="modal-overlay" onClick={() => setShowCreate(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2>Create Node</h2>
            <input
              className="modal-input"
              type="text"
              placeholder="Node label"
              value={createLabel}
              onChange={e => setCreateLabel(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleCreateNode()}
              autoFocus
            />
            <div className="modal-actions">
              <button className="modal-btn cancel" onClick={() => setShowCreate(false)}>Cancel</button>
              <button className="modal-btn confirm" onClick={handleCreateNode} disabled={!createLabel.trim()}>Create</button>
            </div>
          </div>
        </div>
      )}

      {linkModalInfo && (
        <LinkModal
          sourceLabel={linkModalInfo.sourceLabel}
          targetLabel={linkModalInfo.targetLabel}
          existingRelations={existingRelations}
          defaultRelation={getDefaultRelation(linkModalInfo.defaultSide)}
          onConfirm={handleLinkConfirm}
          onCancel={() => setLinkModalInfo(null)}
        />
      )}

      <div className="app-body">
        <main className="graph-area">
          {error && <div className="error-banner">{error}</div>}
          {loading && <div className="loading-overlay">Loading...</div>}
          <GraphCanvas
            nodes={graphData?.nodes ?? []}
            edges={graphData?.edges ?? []}
            onNodeClick={handleNodeClick}
            onNodeDoubleClick={handleNodeDoubleClick}
            onNodeDeselect={() => setSelectedNode(null)}
            linkMode={linkMode}
            linkingState={linkingState}
            onLinkDragStart={handleLinkDragStart}
            onLinkDragEnd={handleLinkDragEnd}
            onLinkDragCancel={handleLinkDragCancel}
            onCreateNode={handleCreatePhantomNode}
          />
        </main>
        <aside className="side-panel">
          <NodePanel node={selectedNode} onNodeDelete={() => setGraphData(prev => prev ? { ...prev, nodes: prev.nodes.filter(n => n.id !== selectedNode?.id) } : null)} onClose={() => setSelectedNode(null)} />
        </aside>
      </div>
      <StatusBar graphData={graphData} />
    </div>
  )
}

export default App
