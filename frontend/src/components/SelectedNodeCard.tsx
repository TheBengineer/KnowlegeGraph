import type { Node } from '../types'

interface Props {
  node: Pick<Node, 'id' | 'label'>
  onClose: () => void
}

export default function SelectedNodeCard({ node, onClose }: Props) {
  return (
    <div className="selected-node-card">
      <button className="card-close" onClick={onClose} title="Close">&times;</button>
      <div className="card-label">{node.label}</div>
      <div className="card-id">{node.id.slice(0, 12)}</div>
    </div>
  )
}
