import { useState, useEffect, useRef, useCallback } from 'react'
import { callMcp } from '../lib/mcp'
import type { Node } from '../types'

interface Props {
  onNodeSelect: (nodeId: string) => void
}

export default function SearchBar({ onNodeSelect }: Props) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Node[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(-1)
  const [showResults, setShowResults] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout>>()
  const inputRef = useRef<HTMLInputElement>(null)

  const doSearch = useCallback(async (q: string) => {
    if (!q.trim()) {
      setResults([])
      setShowResults(false)
      return
    }
    setLoading(true)
    try {
      const res = await callMcp<{ items: Node[] }>('search_nodes', { query: q, limit: 20 })
      const nodes = res.items ?? []
      setResults(nodes)
      setShowResults(nodes.length > 0 || q.trim().length > 0)
      setSelectedIndex(-1)
    } catch {
      setResults([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => doSearch(query), 250)
    return () => clearTimeout(timerRef.current)
  }, [query, doSearch])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex(i => Math.min(i + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex(i => Math.max(i - 1, 0))
    } else if (e.key === 'Enter' && selectedIndex >= 0 && results[selectedIndex]) {
      onNodeSelect(results[selectedIndex].id)
      setShowResults(false)
      inputRef.current?.blur()
    } else if (e.key === 'Escape') {
      setShowResults(false)
    }
  }

  return (
    <div className="search-bar">
      <input
        ref={inputRef}
        className="search-input"
        type="text"
        placeholder="Search nodes..."
        value={query}
        onChange={e => setQuery(e.target.value)}
        onKeyDown={handleKeyDown}
        onFocus={() => results.length > 0 && setShowResults(true)}
        onBlur={() => setTimeout(() => setShowResults(false), 200)}
      />
      {showResults && (
        <div className="search-results">
          {loading && <div className="search-result-item">Searching...</div>}
          {!loading && results.length === 0 && (
            <div className="search-result-item" style={{ color: 'var(--text-secondary)' }}>No results</div>
          )}
          {results.map((node, i) => (
            <div
              key={node.id}
              className={`search-result-item ${i === selectedIndex ? 'selected' : ''}`}
              onMouseDown={() => {
                onNodeSelect(node.id)
                setShowResults(false)
              }}
            >
              <span className="result-label">{node.label}</span>
              <span className="result-id">{node.id.slice(0, 8)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
