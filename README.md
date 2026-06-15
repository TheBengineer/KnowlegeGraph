# Knowledge Graph MCP Server

A knowledge graph server accessible over the **Model Context Protocol (MCP)**, providing tools for AI agents to query and edit a semantic graph.

Built with **Python** (FastMCP + NetworkX + SQLite) and deployable via **Docker Compose**.

## Quickstart — Docker Compose

### Prerequisites
- [Docker](https://docs.docker.com/get-docker/) and [Docker Compose](https://docs.docker.com/compose/install/)

### Run the server

```bash
docker compose up -d
```

The server starts on port **8082** with the MCP endpoint available at `http://localhost:8082/mcp`.

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

Set `KG_API_KEY` in the environment to require Bearer token authentication:

```bash
KG_API_KEY=sk-my-secret-key docker compose up -d
```

Clients then include the key in requests:
```
Authorization: Bearer sk-my-secret-key
```

### Available MCP Tools

| Tool | Description |
|------|-------------|
| `add_node` | Add a node (concept/entity) to the graph |
| `get_node` | Retrieve a node by ID |
| `update_node` | Update a node's label or properties |
| `delete_node` | Remove a node (with optional cascade) |
| `add_edge` | Connect two nodes with a relationship |
| `get_neighbors` | List neighbors with direction/relation filters |
| `search_nodes` | Search nodes by label text |
| `get_subgraph` | Extract a subgraph around a node (BFS to depth) |
| `get_path` | Find the shortest path between two nodes |
| `graph_stats` | Get graph statistics (density, connections, relations) |
| `get_communities` | Detect communities via modularity optimization |
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

> **Tip:** Install `jq` for pretty-printed JSON output. Pipe to `python -m json.tool` as a lighter alternative: `... | python -m json.tool`
>
> **With API key auth:** Add `-H "Authorization: Bearer <your-key>"` to each request.

## Docker Compose

The `docker-compose.yml` starts the MCP server with persistent storage and HTTP transport:

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

volumes:
  kg-data:
```

### Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `KG_DB_PATH` | `kg.db` | SQLite database path |
| `KG_HOST` | `0.0.0.0` | Server bind address |
| `KG_PORT` | `8080` | Server port |
| `KG_API_KEY` | *(unset)* | Enables Bearer token auth (optional) |
| `KG_LOG_LEVEL` | `INFO` | Logging level |
| `KG_SESSION_TIMEOUT` | `300` | Staging session TTL (seconds) |

## Development

### Local setup

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -e .
python -m kg_mcp    # Starts HTTP server on port 8080
```

### Seed demo data

```bash
python scripts/seed.py
```

### Run tests

```bash
pytest tests/ -v
```

### Build and run manually

```bash
docker build -t kg-mcp .
docker run -d --name kg-mcp -p 8082:8082 -v kg-data:/app/data kg-mcp
```

## Project Structure

```
src/kg_mcp/
├── models/         # Pydantic data models
├── db/             # SQLite schema, connection, queries
├── service/        # GraphService + SessionManager
├── tools/          # 14 MCP tool registrations
├── server.py       # FastMCP app factory (health route, auth)
├── __main__.py     # Entry point (HTTP transport)
└── config.py       # Environment configuration
```

## Tech Stack

| Component | Technology |
|-----------|-----------|
| MCP Framework | FastMCP (Python) |
| Transport | HTTP / Streamable HTTP (auto) |
| Graph Engine | NetworkX (in-memory) + SQLite (persistence) |
| Embeddings | sentence-transformers (v0.2+, local CPU) |
| Vector Search | sqlite-vec (v0.2+) |
| Container | Docker + Docker Compose |
| Frontend | React + Cytoscape.js (v0.3+, planned) |
