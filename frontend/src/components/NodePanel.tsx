import { useState, useEffect, useCallback } from 'react'
import { callMcp } from '../lib/mcp'
import type { Node, NodeContent } from '../types'

interface Props {
  node: Node | null
  onNodeDelete?: () => void
  onClose?: () => void
}

export default function NodePanel({ node, onNodeDelete, onClose }: Props) {
  const [deleting, setDeleting] = useState(false)
  const [deleted, setDeleted] = useState(false)
  const [contents, setContents] = useState<NodeContent[]>([])

  const [messageText, setMessageText] = useState('')

  const loadContents = useCallback(() => {
    if (!node) { setContents([]); return }
    callMcp<{items: NodeContent[]}>('get_node_contents', { node_id: node.id })
      .then(res => setContents(res.items ?? []))
      .catch(() => setContents([]))
  }, [node])

  useEffect(() => {
    let cancelled = false
    if (!node) { setContents([]); return }
    setContents([])
    loadContents()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [node?.id])

  const handleSendMessage = async () => {
    const text = messageText.trim()
    if (!text || !node) return
    try {
      await callMcp('add_node_content', {
        node_id: node.id,
        content_type: 'NOTE',
        content: text,
      })
      setMessageText('')
      await loadContents()
    } catch (e) {
      console.warn('Failed to send message:', e instanceof Error ? e.message : e)
    }
  }

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
      <div className="node-panel-header">
        <h2>{node.label}</h2>
        {onClose && (
          <button className="node-panel-close" onClick={onClose}>×</button>
        )}
      </div>

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

      {contents.length > 0 && (
        <div className="node-contents">
          <h3>Notes</h3>
          {contents.map(item => (
            <div key={item.id} className="node-content-item">
              <span className="node-content-type-badge">{item.content_type}</span>
              <div className="node-content-text">
                {item.content.length > 200
                  ? item.content.slice(0, 200) + '…'
                  : item.content}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="message-input-row">
        <input
          className="message-input"
          type="text"
          placeholder="Add a note..."
          value={messageText}
          onChange={e => setMessageText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleSendMessage() }}
        />
        <button
          className="message-send-btn"
          onClick={handleSendMessage}
          disabled={!messageText.trim()}
        >
          Send
        </button>
      </div>

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
