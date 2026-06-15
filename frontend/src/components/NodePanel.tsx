import { useState } from 'react'
import { callMcp } from '../lib/mcp'
import type { Node } from '../types'

interface Props {
  node: Node | null
  onNodeDelete?: () => void
}

export default function NodePanel({ node, onNodeDelete }: Props) {
  const [deleting, setDeleting] = useState(false)
  const [deleted, setDeleted] = useState(false)

  if (!node) {
    return (
      <div className="node-panel">
        <div className="empty-state">Select a node to view details</div>
      </div>
    )
  }

  if (deleted) {
    return (
      <div className="node-panel">
        <div className="empty-state">Node deleted</div>
      </div>
    )
  }

  const handleDelete = async () => {
    if (!confirm(`Delete "${node.label}"?`)) return
    setDeleting(true)
    try {
      await callMcp('delete_node', { node_id: node.id, cascade: true })
      setDeleted(true)
      onNodeDelete?.()
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Delete failed')
    } finally {
      setDeleting(false)
    }
  }

  const properties = node.properties ? Object.entries(node.properties).filter(
    ([, v]) => typeof v !== 'object' || v === null
  ) : []

  return (
    <div className="node-panel">
      <h2>{node.label}</h2>

      <div className="field">
        <div className="field-label">ID</div>
        <div className="field-value">{node.id}</div>
      </div>

      <div className="field">
        <div className="field-label">Source</div>
        <div className="field-value">{node.source}</div>
      </div>

      <div className="field">
        <div className="field-label">Version</div>
        <div className="field-value">{node.version}</div>
      </div>

      {properties.length > 0 && (
        <>
          <div className="field-label" style={{ marginTop: 12 }}>Properties</div>
          <table className="properties-table">
            <thead>
              <tr><th>Key</th><th>Value</th></tr>
            </thead>
            <tbody>
              {properties.map(([key, val]) => (
                <tr key={key}>
                  <td>{key}</td>
                  <td>{String(val)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      <button
        className="delete-btn"
        onClick={handleDelete}
        disabled={deleting}
      >
        {deleting ? 'Deleting...' : 'Delete Node'}
      </button>
    </div>
  )
}
