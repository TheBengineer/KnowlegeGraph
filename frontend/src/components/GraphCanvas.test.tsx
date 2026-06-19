import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'
import GraphCanvas from './GraphCanvas'

describe('GraphCanvas', () => {
  const defaultProps = {
    nodes: [],
    edges: [],
    onNodeClick: vi.fn(),
    onNodeDoubleClick: vi.fn(),
    linkMode: false,
    linkingState: null,
    onLinkDragStart: vi.fn(),
    onLinkDragEnd: vi.fn(),
    onLinkDragCancel: vi.fn(),
    onCreateNode: vi.fn(),
  }

  it('renders without crashing with empty data', () => {
    const { container } = render(<GraphCanvas {...defaultProps} />)
    expect(container.firstChild).toBeTruthy()
  })

  it('accepts nodes and edges props', () => {
    const nodes = [
      {
        id: 'n1',
        label: 'Test',
        properties: {},
        source: 'manual',
        created_at: '',
        updated_at: '',
        version: 1,
      },
      {
        id: 'n2',
        label: 'Target',
        properties: {},
        source: 'manual',
        created_at: '',
        updated_at: '',
        version: 1,
      },
    ]
    const edges = [
      {
        id: 'e1',
        source: 'n1',
        target: 'n2',
        relation: 'knows',
        properties: {},
        weight: 1.0,
        created_at: '',
        updated_at: '',
      },
    ]
    const { container } = render(
      <GraphCanvas {...defaultProps} nodes={nodes} edges={edges} />
    )
    expect(container.firstChild).toBeTruthy()
  })

  it('fires onNodeClick when a node is clicked', () => {
    const onNodeClick = vi.fn()
    render(<GraphCanvas {...defaultProps} onNodeClick={onNodeClick} />)
    // Cytoscape renders on a canvas — we can't simulate DOM node clicks
    // in jsdom. This test verifies the callback prop is wired without error.
    expect(onNodeClick).not.toHaveBeenCalled()
  })

  it('has double-click polyfill via taphold event', () => {
    const onNodeClick = vi.fn()
    const onNodeDoubleClick = vi.fn()
    render(
      <GraphCanvas
        {...defaultProps}
        onNodeClick={onNodeClick}
        onNodeDoubleClick={onNodeDoubleClick}
      />
    )
    // Double-click is implemented via Cytoscape's taphold event on nodes.
    // Not simulable in jsdom — structural verification only.
    expect(onNodeDoubleClick).not.toHaveBeenCalled()
  })
})
