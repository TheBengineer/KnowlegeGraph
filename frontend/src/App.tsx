import { useState, useEffect } from 'react'
import SearchBar from './components/SearchBar'
import GraphCanvas from './components/GraphCanvas'
import NodePanel from './components/NodePanel'
import StatusBar from './components/StatusBar'
import { callMcp } from './lib/mcp'
import type { Node, SubgraphResult } from './types'

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

  useEffect(() => {
    const loadInitialGraph = async () => {
      setLoading(true)
      setError(null)
      try {
        const result = await callMcp<{ items: Node[] }>('list_nodes', { limit: 500 })
        if (result.items.length === 0) return

        const startNode = result.items.find(n => n.label === 'Home') ?? result.items[0]
        const subgraph = await callMcp<SubgraphResult>('get_subgraph', { node_id: startNode.id, depth: 2 })
        setGraphData({ nodes: subgraph.nodes, edges: subgraph.edges })
        const node = subgraph.nodes.find(n => n.id === startNode.id)
        if (node) setSelectedNode(node)
      } catch (e) {
        console.warn('Initial graph load:', e instanceof Error ? e.message : e)
      } finally {
        setLoading(false)
      }
    }
    loadInitialGraph()
  }, [])

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

  return (
    <div className="app">
      <header className="app-header">
        <h1>Knowledge Graph</h1>
        <SearchBar onNodeSelect={handleNodeSelect} />
        <button className="create-btn" onClick={() => setShowCreate(true)}>+ New</button>
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

      <div className="app-body">
        <main className="graph-area">
          {error && <div className="error-banner">{error}</div>}
          {loading && <div className="loading-overlay">Loading...</div>}
          <GraphCanvas
            nodes={graphData?.nodes ?? []}
            edges={graphData?.edges ?? []}
            onNodeClick={handleNodeClick}
            onNodeDoubleClick={handleNodeDoubleClick}
          />
        </main>
        <aside className="side-panel">
          <NodePanel node={selectedNode} onNodeDelete={() => setGraphData(prev => prev ? { ...prev, nodes: prev.nodes.filter(n => n.id !== selectedNode?.id) } : null)} />
        </aside>
      </div>
      <StatusBar graphData={graphData} />
    </div>
  )
}

export default App
