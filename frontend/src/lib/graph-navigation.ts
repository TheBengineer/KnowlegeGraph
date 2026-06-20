/**
 * Keyboard graph navigation state machine.
 * 
 * Modes:
 *   idle              — normal graph interaction
 *   node_focused      — a node is selected, keys navigate outward
 *   selecting_child   — child edges shown, L/R cycles edges, Down navigates
 *   selecting_parent  — parent edges shown, L/R cycles edges, Up navigates
 *   selecting_related — related nodes shown, U/D cycles, Left enters edge selection
 *   selecting_edge    — edges to the selected related node, U/D cycles, Left confirms and navigates
 */

export type NavMode =
  | 'idle'
  | 'node_focused'
  | 'selecting_child'
  | 'selecting_parent'
  | 'selecting_related'
  | 'selecting_edge'

export interface NavState {
  mode: NavMode
  focusedNodeId: string | null
  /** Index into the current edge list (for selecting_child/parent) */
  edgeIndex: number
  /** Index into the current related node list (for selecting_related) */
  nodeIndex: number
}

export const INITIAL_NAV: NavState = {
  mode: 'idle',
  focusedNodeId: null,
  edgeIndex: 0,
  nodeIndex: 0,
}

export interface EdgeInfo {
  id: string
  source: string
  target: string
  relation: string
}

/** Classify an edge direction based on relation type. */
export type EdgeDirection = 'child' | 'parent' | 'related'

export function classifyEdge(edge: EdgeInfo, fromNodeId: string): EdgeDirection {
  const isOutgoing = edge.source === fromNodeId
  const rel = edge.relation.toLowerCase()
  // Relations that imply hierarchy
  if (['contains', 'extends', 'has_method', 'imports', 'has_library', 'has_framework', 'has_runtime', 'compiles_to'].includes(rel)) {
    return isOutgoing ? 'child' : 'parent'
  }
  // Everything else is related (sibling)
  return 'related'
}

export function getChildEdges(edges: EdgeInfo[], nodeId: string): EdgeInfo[] {
  return edges.filter(e => classifyEdge(e, nodeId) === 'child')
}

export function getParentEdges(edges: EdgeInfo[], nodeId: string): EdgeInfo[] {
  return edges.filter(e => classifyEdge(e, nodeId) === 'parent')
}

export function getRelatedEdges(edges: EdgeInfo[], nodeId: string): EdgeInfo[] {
  return edges.filter(e => classifyEdge(e, nodeId) === 'related')
}

export function getTargetNode(edge: EdgeInfo, fromNodeId: string): string {
  return edge.source === fromNodeId ? edge.target : edge.source
}

/** Process a key press and return the next state + optional action. */
export interface NavAction {
  type: 'select_node' | 'center_node' | 'update_layout' | 'clear_highlight'
  nodeId?: string
}

export function processKey(
  state: NavState,
  key: string,
  edges: EdgeInfo[],
): { next: NavState; action?: NavAction } {
  const { mode, focusedNodeId, edgeIndex, nodeIndex } = state
  if (!focusedNodeId) return { next: state }

  switch (mode) {
    case 'idle':
      return { next: state }

    case 'node_focused':
      if (key === 'ArrowDown') {
        const childEdges = getChildEdges(edges, focusedNodeId)
        if (childEdges.length > 0) {
          return {
            next: { ...state, mode: 'selecting_child', edgeIndex: 0 },
            action: { type: 'update_layout' },
          }
        }
      }
      if (key === 'ArrowUp') {
        const parentEdges = getParentEdges(edges, focusedNodeId)
        if (parentEdges.length > 0) {
          return {
            next: { ...state, mode: 'selecting_parent', edgeIndex: 0 },
            action: { type: 'update_layout' },
          }
        }
      }
      if (key === 'ArrowRight') {
        const relatedEdges = getRelatedEdges(edges, focusedNodeId)
        if (relatedEdges.length > 0) {
          return {
            next: { ...state, mode: 'selecting_related', nodeIndex: 0 },
            action: { type: 'update_layout' },
          }
        }
      }
      if (key === 'Escape') {
        return {
          next: INITIAL_NAV,
          action: { type: 'clear_highlight' },
        }
      }
      return { next: state }

    case 'selecting_child': {
      const childEdges = getChildEdges(edges, focusedNodeId)
      if (key === 'ArrowRight') {
        return {
          next: { ...state, edgeIndex: Math.min(edgeIndex + 1, childEdges.length - 1) },
          action: { type: 'update_layout' },
        }
      }
      if (key === 'ArrowLeft') {
        return {
          next: { ...state, edgeIndex: Math.max(edgeIndex - 1, 0) },
          action: { type: 'update_layout' },
        }
      }
      if (key === 'ArrowDown' && childEdges[edgeIndex]) {
        const targetId = getTargetNode(childEdges[edgeIndex], focusedNodeId)
        return {
          next: { mode: 'node_focused', focusedNodeId: targetId, edgeIndex: 0, nodeIndex: 0 },
          action: { type: 'select_node', nodeId: targetId },
        }
      }
      if (key === 'Escape') {
        return { next: { ...state, mode: 'node_focused' }, action: { type: 'update_layout' } }
      }
      return { next: state }
    }

    case 'selecting_parent': {
      const parentEdges = getParentEdges(edges, focusedNodeId)
      if (key === 'ArrowRight') {
        return {
          next: { ...state, edgeIndex: Math.min(edgeIndex + 1, parentEdges.length - 1) },
          action: { type: 'update_layout' },
        }
      }
      if (key === 'ArrowLeft') {
        return {
          next: { ...state, edgeIndex: Math.max(edgeIndex - 1, 0) },
          action: { type: 'update_layout' },
        }
      }
      if (key === 'ArrowUp' && parentEdges[edgeIndex]) {
        const targetId = getTargetNode(parentEdges[edgeIndex], focusedNodeId)
        return {
          next: { mode: 'node_focused', focusedNodeId: targetId, edgeIndex: 0, nodeIndex: 0 },
          action: { type: 'select_node', nodeId: targetId },
        }
      }
      if (key === 'Escape') {
        return { next: { ...state, mode: 'node_focused' }, action: { type: 'update_layout' } }
      }
      return { next: state }
    }

    case 'selecting_related': {
      const relatedEdges = getRelatedEdges(edges, focusedNodeId)
      const relatedNodeIds = [...new Set(relatedEdges.map(e => e.source === focusedNodeId ? e.target : e.source))]
      if (key === 'ArrowDown') {
        return {
          next: { ...state, nodeIndex: Math.min(nodeIndex + 1, relatedNodeIds.length - 1) },
          action: { type: 'update_layout' },
        }
      }
      if (key === 'ArrowUp') {
        return {
          next: { ...state, nodeIndex: Math.max(nodeIndex - 1, 0) },
          action: { type: 'update_layout' },
        }
      }
      if (key === 'ArrowLeft' && relatedNodeIds[nodeIndex]) {
        // Enter edge selection mode instead of navigating directly
        return {
          next: { ...state, mode: 'selecting_edge', edgeIndex: 0 },
          action: { type: 'update_layout' },
        }
      }
      if (key === 'ArrowRight' && relatedNodeIds[nodeIndex]) {
        // Skip edge selection and navigate directly
        return {
          next: { mode: 'node_focused', focusedNodeId: relatedNodeIds[nodeIndex], edgeIndex: 0, nodeIndex: 0 },
          action: { type: 'select_node', nodeId: relatedNodeIds[nodeIndex] },
        }
      }
      if (key === 'Escape') {
        return { next: { ...state, mode: 'node_focused' }, action: { type: 'update_layout' } }
      }
      return { next: state }
    }

    case 'selecting_edge': {
      const relatedEdges2 = getRelatedEdges(edges, focusedNodeId)
      const relatedNodeIds2 = [...new Set(relatedEdges2.map(e => getTargetNode(e, focusedNodeId)))]
      const selNodeId = relatedNodeIds2[nodeIndex]
      if (!selNodeId) return { next: state }
      const selNodeEdges = relatedEdges2.filter(e => getTargetNode(e, focusedNodeId) === selNodeId)
      if (key === 'ArrowUp') {
        return {
          next: { ...state, edgeIndex: Math.max(edgeIndex - 1, 0) },
        }
      }
      if (key === 'ArrowDown') {
        return {
          next: { ...state, edgeIndex: Math.min(edgeIndex + 1, selNodeEdges.length - 1) },
        }
      }
      if (key === 'ArrowLeft' && selNodeEdges[edgeIndex]) {
        return {
          next: { mode: 'node_focused', focusedNodeId: selNodeId, edgeIndex: 0, nodeIndex: 0 },
          action: { type: 'select_node', nodeId: selNodeId },
        }
      }
      if (key === 'Escape') {
        return { next: { ...state, mode: 'selecting_related' } }
      }
      return { next: state }
    }

    default:
      return { next: state }
  }
}
