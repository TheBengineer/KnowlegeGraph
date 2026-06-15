import { useEffect, useRef } from 'react'
import cytoscape from 'cytoscape'
import type { Node, Edge } from '../types'

interface Props {
  nodes: Node[]
  edges: Edge[]
  onNodeClick: (nodeId: string) => void
  onNodeDoubleClick: (nodeId: string) => void
}

export default function GraphCanvas({ nodes, edges, onNodeClick, onNodeDoubleClick }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const cyRef = useRef<cytoscape.Core | null>(null)

  useEffect(() => {
    if (!containerRef.current) return

    const cy = cytoscape({
      container: containerRef.current,
      style: [
        {
          selector: 'node',
          style: {
            'background-color': '#4fc3f7',
            label: 'data(label)',
            'font-size': '12px',
            color: '#e0e0e0',
            'text-valign': 'bottom',
            'text-halign': 'center',
            'text-margin-y': 4,
            width: 30,
            height: 30,
          },
        },
        {
          selector: 'edge',
          style: {
            width: 1.5,
            'line-color': '#2a2a4a',
            'target-arrow-color': '#2a2a4a',
            'target-arrow-shape': 'triangle',
            'curve-style': 'bezier',
            label: 'data(relation)',
            'font-size': '10px',
            color: '#a0a0b0',
            'text-rotation': 'autorotate',
            'text-margin-x': 4,
          },
        },
        {
          selector: 'node:selected',
          style: {
            'background-color': '#ff7043',
            'border-color': '#ff5722',
            'border-width': 2,
          },
        },
        {
          selector: 'node.highlighted',
          style: {
            'background-color': '#66bb6a',
          },
        },
        {
          selector: 'node.dimmed',
          style: {
            opacity: 0.3,
          },
        },
        {
          selector: 'edge.dimmed',
          style: {
            opacity: 0.1,
          },
        },
      ],
      layout: { name: 'preset' },
      wheelSensitivity: 0.3,
    })

    cyRef.current = cy

    cy.on('tap', 'node', (evt) => {
      const node = evt.target
      onNodeClick(node.id())
    })

    cy.on('tap', (evt) => {
      if (evt.target === cy) {
        cy.elements().removeClass('highlighted dimmed')
      }
    })

    return () => {
      cy.destroy()
      cyRef.current = null
    }
  }, []) // mount once

  // Update graph data
  useEffect(() => {
    const cy = cyRef.current
    if (!cy) return

    const existingNodes = new Set(cy.nodes().map(n => n.id()))
    const existingEdges = new Set(cy.edges().map(e => e.id()))

    // Remove elements not in new data
    cy.nodes().filter(n => !nodes.some(newN => newN.id === n.id())).remove()
    cy.edges().filter(e => !edges.some(newE => newE.id === e.id())).remove()

    // Add new nodes
    nodes.filter(n => !existingNodes.has(n.id)).forEach(n => {
      cy.add({
        group: 'nodes',
        data: { id: n.id, label: n.label },
      })
    })

    // Add new edges
    edges.filter(e => !existingEdges.has(e.id)).forEach(e => {
      cy.add({
        group: 'edges',
        data: { id: e.id, source: e.source, target: e.target, relation: e.relation },
      })
    })

    // Run layout on first load (when elements exist and none were removed)
    if (nodes.length > 0 && cy.nodes().length > 0) {
      const layout = cy.layout({
        name: 'cose',
        animate: true,
        animationDuration: 500,
        fit: true,
        padding: 50,
      })
      layout.run()
    }
  }, [nodes, edges])

  // Handle node click highlight
  const handleNodeClick = (nodeId: string) => {
    const cy = cyRef.current
    if (!cy) return

    cy.elements().removeClass('highlighted dimmed')

    const node = cy.getElementById(nodeId)
    if (!node || node.length === 0) return

    node.addClass('highlighted')
    const neighbors = node.neighborhood()
    neighbors.filter(n => n.isNode()).addClass('highlighted')
    cy.elements().not(node).not(neighbors).addClass('dimmed')
  }

  // Re-wire events when callbacks change
  useEffect(() => {
    const cy = cyRef.current
    if (!cy) return

    const tapHandler: cytoscape.EventHandler = (evt) => {
      const n = evt.target
      if (n.isNode?.()) {
        handleNodeClick(n.id())
        onNodeClick(n.id())
      }
    }
    const backgroundHandler: cytoscape.EventHandler = (evt) => {
      if (evt.target === cy) {
        cy.elements().removeClass('highlighted dimmed')
      }
    }
    const doubleTapHandler: cytoscape.EventHandler = (evt) => {
      const n = evt.target
      if (n.isNode?.()) {
        onNodeDoubleClick(n.id())
      }
    }

    cy.removeListener('tap', 'node')
    cy.removeListener('tap')
    cy.removeListener('taphold')

    cy.on('tap', 'node', tapHandler)
    cy.on('tap', backgroundHandler)
    cy.on('taphold', 'node', doubleTapHandler)

    return () => {
      cy.removeListener('tap', 'node')
      cy.removeListener('tap')
      cy.removeListener('taphold')
    }
  }, [onNodeClick, onNodeDoubleClick])

  return (
    <div
      ref={containerRef}
      style={{ width: '100%', height: '100%' }}
    />
  )
}
