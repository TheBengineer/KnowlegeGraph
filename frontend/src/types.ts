export interface Node {
  id: string
  label: string
  properties: Record<string, unknown>
  source: string
  created_at: string
  updated_at: string
  version: number
  embedding?: number[]
}

export interface Edge {
  id: string
  source: string
  target: string
  relation: string
  properties: Record<string, unknown>
  weight: number
  created_at: string
  updated_at: string
}

export interface SubgraphResult {
  nodes: Node[]
  edges: Edge[]
  stats: {
    node_count: number
    edge_count: number
    density: number
  }
}

export interface GraphStats {
  node_count: number
  edge_count: number
  density: number
  most_connected: Array<{ id: string; label: string; connections: number }>
  relation_distribution: Array<{ relation: string; count: number }>
}

export interface CursorPage<T> {
  items: T[]
  cursor: string | null
  has_more: boolean
}

export interface PathResult {
  found: boolean
  path: string[]
  edges: Edge[]
  length: number
}

export interface StatusResult {
  status: string
  node_count: number
  edge_count: number
  cache_size: number
}

export interface NodeContent {
  id: string
  node_id: string
  content_type: string
  content: string
  created_at: string
  updated_at: string
}
