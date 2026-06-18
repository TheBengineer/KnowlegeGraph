---
name: kg-mcp
description: "Use for codebase understanding, architecture questions, and knowledge graph queries. When a graphify-out/ or scanned data exists, use scan_codebase + get_subgraph/search_nodes to answer queries instead of grepping files. Add scan_codebase to import new codebases."
---

# Knowledge Graph MCP Server

This project is a Knowledge Graph MCP Server — a persistent semantic graph accessible to AI agents over the Model Context Protocol (MCP). It can scan codebases and make their structure queryable.

## MCP Tools Available

When connected to this MCP server, these tools are automatically available:

### Scanning (codebase import)

| Tool | Description |
|------|-------------|
| `scan_codebase(path, max_files?)` | Scan a directory → extract classes, functions, imports via AST → import as graph nodes/edges |
| `scan_status()` | Count of graphify-sourced nodes in the graph |

### CRUD

| Tool | Description |
|------|-------------|
| `add_node(label, properties?, source?, session_id?)` | Add a node to the graph |
| `get_node(node_id)` | Get a node by ID |
| `update_node(node_id, label?, properties?)` | Update a node |
| `delete_node(node_id, cascade?)` | Delete a node |
| `add_edge(source, target, relation, properties?, weight?, session_id?)` | Connect two nodes |

### Search & Query

| Tool | Description |
|------|-------------|
| `search_nodes(query, limit?, cursor?)` | Search nodes by label |
| `get_neighbors(node_id, direction?, relation?, cursor?, limit?)` | Get node neighbors |
| `get_subgraph(node_id, depth?, direction?)` | Extract subgraph around a node |
| `get_path(source, target, max_depth?)` | Find shortest path between nodes |

### Analysis

| Tool | Description |
|------|-------------|
| `graph_stats()` | Get graph statistics |
| `get_communities(min_community_size?)` | Detect communities |
| `kg_status()` | Server health and graph summary |

### Sessions (staged transactions)

| Tool | Description |
|------|-------------|
| `kg_commit(session_id)` | Commit staged operations |
| `kg_rollback(session_id)` | Rollback staged operations |

## How to Use

### Quick start — scan a codebase

When asked about a project's architecture or code structure:

1. **Scan** the codebase: `scan_codebase(path="/path/to/project")`
2. **Explore** the structure: `search_nodes(query="function_name")` or `get_neighbors(node_id="...")`
3. **Understand** relationships: `get_subgraph(node_id="...", depth=2)` or `get_path(source="...", target="...")`
4. **Analyze** the graph: `graph_stats()` or `get_communities()`

### Answering architecture questions

Instead of grepping files, use the graph:

- "How does X and Y connect?" → `get_path(source="X", target="Y")`
- "What depends on module Z?" → `get_subgraph(node_id="Z", depth=2)`
- "Show me the structure" → `graph_stats()` + `get_communities()`
- "Find things related to W" → `search_nodes(query="W")` then `get_neighbors(node_id="...")`

### Scanning a remote repo

```python
# Example workflow
result = await callMcp("scan_codebase", {"path": "/path/to/repo"})
stats = await callMcp("graph_stats")
```

## Architecture

```
MCP Client (Claude/Cline/Cursor)
  │  JSON-RPC over HTTP / SSE
  ▼
FastMCP Server (Python)
  ├── 17 tools (CRUD, search, analysis, scanning)
  ├── GraphService (NetworkX cache + SQLite persistence)
  ├── SessionManager (staged transactions)
  ├── graphify integration (AST extraction for codebase scanning)
  └── CORS middleware / Auth provider
```
