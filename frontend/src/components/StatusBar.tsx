import { useEffect, useState } from 'react'
import { callMcp } from '../lib/mcp'
import type { SubgraphResult } from '../types'

interface Props {
  graphData: { nodes: SubgraphResult['nodes']; edges: SubgraphResult['edges'] } | null
}

export default function StatusBar({ graphData }: Props) {
  const [connected, setConnected] = useState(true)

  useEffect(() => {
    const check = async () => {
      try {
        const res = await fetch('/health')
        setConnected(res.ok)
      } catch {
        setConnected(false)
      }
    }
    check()
    const interval = setInterval(check, 10000)
    return () => clearInterval(interval)
  }, [])

  const nodeCount = graphData?.nodes?.length ?? 0
  const edgeCount = graphData?.edges?.length ?? 0

  return (
    <div className="status-bar">
      <div className={`status-dot ${connected ? 'connected' : 'error'}`} />
      <span>{connected ? 'Connected' : 'Disconnected'}</span>
      <span>Nodes: {nodeCount}</span>
      <span>Edges: {edgeCount}</span>
    </div>
  )
}
