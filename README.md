# Knowledge Graph MCP Server

A knowledge graph server accessible over the **Model Context Protocol (MCP)**, providing tools for AI agents to query and edit a semantic graph — plus a **React web UI** for visual exploration.

Built with **Python** (FastMCP + NetworkX + SQLite) and **React** (Vite + Cytoscape.js). Deployable via **Docker Compose**.

## Quickstart — Docker Compose

### Prerequisites
- [Docker](https://docs.docker.com/get-docker/) and [Docker Compose](https://docs.docker.com/compose/install/)

### Run the server

```bash
docker compose up -d
```

The server starts on port **8082** with the MCP endpoint at `http://localhost:8082/mcp` and health check at `http://localhost:8082/health`.

The **web UI** is available at **http://localhost:8080** — served by nginx, with API requests proxied to the backend automatically.

### Health check

```bash
curl http://localhost:8082/health
# {"status":"ok","healthy":true}
```

### Configure your MCP client

Connect any MCP-compatible client (Claude Desktop, Cursor, VS Code Cline, etc.):

**Claude Desktop** (`claude_desktop_config.json`):
```json
{
  "mcpServers": {
    "knowledge-graph": {
      "url": "http://localhost:8082/mcp"
    }
  }
}
```

**Cline / Cursor / VS Code extensions** — use the same URL: `http://localhost:8082/mcp`

### API Key Auth (optional)

Set `KG_API_KEY` to require Bearer token authentication:

```bash
KG_API_KEY=sk-my-secret-key docker compose up -d
```

Clients then include the key in requests:
```
Authorization: Bearer sk-my-secret-key
```

## Web UI

A React-based graph visualization UI is available for development:

```bash
cd frontend
npm run dev     # Starts at http://localhost:5173 (proxies /mcp to :8082)
```

The UI features search-first exploration: type a query → click a result → graph renders → click nodes for details → double-click to expand.

### Components

| Component | Description |
|-----------|-------------|
| **SearchBar** | Debounced search with keyboard navigation and dropdown results |
| **GraphCanvas** | ForceGraph2D canvas with d3-force layout, click/double-click events |
| **NodePanel** | Node details, properties table, delete button |
| **StatusBar** | Connection status, live node/edge counts |

### Build for production

```bash
cd frontend
npm run build   # Outputs to frontend/dist/
```

## Available MCP Tools (17)

### Scanning (codebase import)

| Tool | Description |
|------|-------------|
| `scan_codebase` | Scan a directory → extract classes, functions, imports via AST → import as graph nodes/edges |
| `scan_status` | Count of graphify-sourced nodes in the graph |

### CRUD

| Tool | Description |
|------|-------------|
| `add_node` | Add a node (concept/entity) to the graph |
| `get_node` | Retrieve a node by ID |
| `update_node` | Update a node's label or properties |
| `delete_node` | Remove a node (with optional cascade) |
| `add_edge` | Connect two nodes with a relationship |

### Search & Analysis

| Tool | Description |
|------|-------------|
| `get_neighbors` | List neighbors with direction/relation filters |
| `search_nodes` | Search nodes by label text |
| `get_subgraph` | Extract a subgraph around a node (BFS to depth) |
| `get_path` | Find the shortest path between two nodes |
| `graph_stats` | Get graph statistics (density, connections, relations) |
| `get_communities` | Detect communities via modularity optimization |

### System

| Tool | Description |
|------|-------------|
| `kg_status` | Server health and graph summary |
| `kg_commit` | Commit staged session operations |
| `kg_rollback` | Rollback staged session operations |

### Query from the CLI

Interact with the graph directly from the terminal using `curl`. The MCP server uses JSON-RPC 2.0 over HTTP POST at `/mcp`.

**Add a node:**

```bash
curl -s -X POST http://localhost:8082/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
      "name": "add_node",
      "arguments": {"label": "Python", "properties": {"type": "language"}}
    }
  }' | jq
```

**Get a node by ID** (replace `<node-id>` with the ID returned above):

```bash
curl -s -X POST http://localhost:8082/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 2,
    "method": "tools/call",
    "params": {
      "name": "get_node",
      "arguments": {"node_id": "<node-id>"}
    }
  }' | jq
```

**Search nodes by label:**

```bash
curl -s -X POST http://localhost:8082/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 3,
    "method": "tools/call",
    "params": {
      "name": "search_nodes",
      "arguments": {"query": "Python"}
    }
  }' | jq
```

**Add an edge between two nodes:**

```bash
curl -s -X POST http://localhost:8082/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 4,
    "method": "tools/call",
    "params": {
      "name": "add_edge",
      "arguments": {"source": "<source-id>", "target": "<target-id>", "relation": "influenced"}
    }
  }' | jq
```

**Get graph statistics:**

```bash
curl -s -X POST http://localhost:8082/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 5,
    "method": "tools/call",
    "params": {
      "name": "graph_stats",
      "arguments": {}
    }
  }' | jq
```

> **Tip:** Install `jq` for pretty-printed JSON. Lighter alternative: `... | python -m json.tool`
>
> **With API key auth:** Add `-H "Authorization: Bearer <your-key>"` to each request.

### Scan a codebase

```bash
curl -s -X POST http://localhost:8082/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 10,
    "method": "tools/call",
    "params": {
      "name": "scan_codebase",
      "arguments": {"path": "/path/to/project"}
    }
  }' | jq
```

This uses graphify's AST extraction to parse 30+ languages and import classes, functions, imports, and file relationships into the knowledge graph.

## Codebase Scanning

The server can scan any directory of code and documentation files, extract entities and relationships using AST parsing, and import them into the knowledge graph for querying.

```bash
# Scan a local project — imports functions, classes, imports as nodes/edges
scan_codebase(path="/path/to/project")

# Check what was imported
scan_status()
```

Once scanned, use the standard search and query tools to explore:
- `search_nodes(query)` — find imported functions and classes
- `get_neighbors(node_id)` — see what a module depends on
- `get_subgraph(node_id, depth=2)` — explore a module's dependency tree
- `get_path(source, target)` — trace call chains across files

## Architecture

```
┌──────────────────────┐    ┌──────────────────────┐
│  MCP Client          │    │  React Web UI        │
│  (Claude/Cline/etc)  │    │  (Vite + Cytoscape)  │
└──────┬───────────────┘    └──────────┬───────────┘
       │ JSON-RPC (HTTP)              │ fetch() + CORS
       ▼                              ▼
┌──────────────────────────────────────────────────┐
│  FastMCP Server (Python, Starlette/Uvicorn)      │
│                                                   │
│  ┌──────────┐  ┌──────────────────────────────┐  │
│  │ 14 Tools  │  │ GraphService                 │  │
│  │ (CRUD,    │  │  ├─ NetworkX (in-memory)     │  │
│  │  search,  │  │  ├─ SQLite (persistence)     │  │
│  │  analysis)│  │  └─ threading.Lock (safety)  │  │
│  └──────────┘  └──────┬───────────────────────┘  │
│                       │                         │
│  ┌────────────────────┴──────────────────────┐   │
│  │ SessionManager (staged transactions)      │   │
│  │ Health endpoint (/health)                 │   │
│  │ Auth provider (optional API key)          │   │
│  │ CORS middleware (dev server)              │   │
│  └───────────────────────────────────────────┘   │
└──────────────────────────────────────────────────┘
```

## Development

### Local setup

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -e .
python -m kg_mcp    # Starts HTTP server on port 8082
```

### Frontend dev server

```bash
cd frontend
npm install
npm run dev          # Starts at http://localhost:5173
```

Vite proxies `/mcp` and `/health` to the Python backend at `http://localhost:8082`.

### Seed demo data

```bash
source .venv/bin/activate
python scripts/seed.py
```

### Run tests

```bash
# Backend tests (Python)
source .venv/bin/activate
pytest tests/ -v

# Frontend tests (TypeScript)
cd frontend
npm test
```

### Build Docker image

```bash
docker build -t kg-mcp .
docker run -d --name kg-mcp -p 8082:8082 -v kg-data:/app/data kg-mcp
```

## Docker Compose

```yaml
services:
  kg-mcp:
    build: .
    container_name: kg-mcp-server
    ports:
      - "8082:8082"
    volumes:
      - kg-data:/app/data
    environment:
      - KG_DB_PATH=/app/data/kg.db
      - KG_HOST=0.0.0.0
      - KG_PORT=8082
      - KG_LOG_LEVEL=INFO
      - FASTMCP_STATELESS_HTTP=true
      - FASTMCP_SESSION_IDLE_TIMEOUT=1800
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "python", "-c", "import urllib.request; urllib.request.urlopen('http://localhost:8082/health')"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 10s

volumes:
  kg-data:
```

### Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `KG_DB_PATH` | `kg.db` | SQLite database path |
| `KG_HOST` | `0.0.0.0` | Server bind address |
| `KG_PORT` | `8082` | Server port |
| `KG_API_KEY` | *(unset)* | Enables Bearer token auth (optional) |
| `KG_LOG_LEVEL` | `INFO` | Logging level |
| `KG_SESSION_TIMEOUT` | `300` | Staging session TTL (seconds) |

## Project Structure

```
├── src/kg_mcp/              # Python backend
│   ├── models/              # Pydantic data models
│   ├── db/                  # SQLite schema, connection, queries
│   ├── service/             # GraphService + SessionManager
│   ├── tools/               # 14 MCP tool registrations
│   ├── server.py            # FastMCP app factory (health, auth, CORS)
│   ├── __main__.py          # Entry point (HTTP transport)
│   └── config.py            # Environment configuration
├── frontend/                # React web UI
│   ├── src/
│   │   ├── components/      # SearchBar, GraphCanvas, NodePanel, StatusBar
│   │   ├── lib/             # callMcp() JSON-RPC wrapper
│   │   ├── types.ts         # TypeScript interfaces
│   │   ├── App.tsx          # Main app with search→graph→panel flow
│   │   └── App.css          # Dark theme styling
│   └── vite.config.ts       # Dev server proxy to :8082
├── tests/                   # 43 Python tests
├── scripts/seed.py          # Demo data populator
├── docker-compose.yml       # Production deployment
└── Dockerfile               # Container build
```

## Tech Stack

| Component | Technology |
|-----------|-----------|
| MCP Framework | FastMCP (Python) |
| Transport | HTTP / Streamable HTTP |
| Graph Engine | NetworkX (in-memory cache) + SQLite (persistence) |
| Concurrency | `threading.Lock` (thread-pool safe) |
| Embeddings | sentence-transformers (v0.2+, local CPU) |
| Vector Search | sqlite-vec (v0.2+) |
| Frontend | React + Vite + TypeScript + Cytoscape.js |
| Container | Docker + Docker Compose |
