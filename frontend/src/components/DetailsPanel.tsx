interface Props {
  node: { id: string; label: string } | null
  onClose: () => void
}

export default function DetailsPanel({ node, onClose }: Props) {
  return (
    <div className={`details-panel ${node ? 'open' : 'closed'}`}>
      {node && (
        <div className="details-panel-header">
          <span className="details-panel-label">{node.label}</span>
          <button className="details-panel-close" onClick={onClose}>×</button>
        </div>
      )}
    </div>
  )
}
