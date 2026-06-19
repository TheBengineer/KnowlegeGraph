import { useState } from 'react'

interface LinkModalProps {
  sourceLabel: string
  targetLabel: string
  existingRelations: string[]
  defaultRelation: string
  onConfirm: (relation: string, properties: Record<string, unknown>) => void
  onCancel: () => void
}

export default function LinkModal({
  sourceLabel,
  targetLabel,
  existingRelations,
  defaultRelation,
  onConfirm,
  onCancel,
}: LinkModalProps) {
  const [relation, setRelation] = useState(defaultRelation)
  const [propertiesText, setPropertiesText] = useState('')

  const handleConfirm = () => {
    const trimmed = relation.trim()
    if (!trimmed) return

    let properties: Record<string, unknown> = {}
    if (propertiesText.trim()) {
      try {
        properties = JSON.parse(propertiesText.trim())
      } catch {
        // invalid JSON — use empty object
      }
    }

    onConfirm(trimmed, properties)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleConfirm()
    if (e.key === 'Escape') onCancel()
  }

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal" onClick={e => e.stopPropagation()} onKeyDown={handleKeyDown}>
        <h2>Link: {sourceLabel} → {targetLabel}</h2>

        <label className="modal-field-label">Relation</label>
        <input
          className="modal-input"
          type="text"
          placeholder="e.g. contains, links_to, extends"
          value={relation}
          onChange={e => setRelation(e.target.value)}
          list="relation-suggestions"
          autoFocus
        />
        <datalist id="relation-suggestions">
          {existingRelations.map(r => (
            <option key={r} value={r} />
          ))}
        </datalist>

        <label className="modal-field-label">Properties (optional JSON)</label>
        <input
          className="modal-input"
          type="text"
          placeholder='{"key": "value"}'
          value={propertiesText}
          onChange={e => setPropertiesText(e.target.value)}
        />

        <div className="modal-actions">
          <button className="modal-btn cancel" onClick={onCancel}>Cancel</button>
          <button
            className="modal-btn confirm"
            onClick={handleConfirm}
            disabled={!relation.trim()}
          >
            Create Link
          </button>
        </div>
      </div>
    </div>
  )
}
