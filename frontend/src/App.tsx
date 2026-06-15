import { useState } from 'react'
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
      // Merge new nodes and edges, deduplicating by ID
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

  return (
    <div className="app">
      <header className="app-header">
        <h1>Knowledge Graph</h1>
        <SearchBar onNodeSelect={handleNodeSelect} />
      </header>
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
          <NodePanel node={selectedNode} />
        </aside>
      </div>
      <StatusBar graphData={graphData} />
    </div>
  )
}

export default App
