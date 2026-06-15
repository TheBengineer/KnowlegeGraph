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

The server starts and listens for MCP connections.

### Configure your MCP client

Connect any MCP-compatible client (Claude Desktop, Cursor, VS Code Cline, etc.):

**Claude Desktop** (`claude_desktop_config.json`):
```json
{
  "mcpServers": {
    "knowledge-graph": {
      "command": "docker",
      "args": ["compose", "exec", "-T", "kg-mcp", "python", "-m", "kg_mcp"]
    }
  }
}
```

**For HTTP/Streamable HTTP transport** (when configured):
```
http://localhost:8080/mcp
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

## Development

### Local setup

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -e .
python -m kg_mcp
```

### Seed demo data

```bash
python scripts/seed.py
```

### Run tests

```bash
pytest tests/ -v
```

## Docker Compose

The `docker-compose.yml` starts the MCP server with persistent storage:

```yaml
services:
  kg-mcp:
    build: .
    container_name: kg-mcp-server
    ports:
      - "8080:8080"
    volumes:
      - kg-data:/app/data
    environment:
      - KG_DB_PATH=/app/data/kg.db
      - KG_HOST=0.0.0.0
      - KG_PORT=8080
      - KG_LOG_LEVEL=INFO
    restart: unless-stopped

volumes:
  kg-data:
```

### Build and run manually

```bash
docker build -t kg-mcp .
docker run -d --name kg-mcp -p 8080:8080 -v kg-data:/app/data kg-mcp
```

## Project Structure

```
src/kg_mcp/
├── models/         # Pydantic data models
├── db/             # SQLite schema, connection, queries
├── service/        # GraphService + SessionManager
├── tools/          # 14 MCP tool registrations
├── server.py       # FastMCP app factory
├── __main__.py     # Entry point
└── config.py       # Environment configuration
```

## Tech Stack

| Component | Technology |
|-----------|-----------|
| MCP Framework | FastMCP (Python) |
| Graph Engine | NetworkX (in-memory) + SQLite (persistence) |
| Embeddings | sentence-transformers (v0.2+, local CPU) |
| Vector Search | sqlite-vec (v0.2+) |
| Container | Docker + Docker Compose |
| Frontend | React + Cytoscape.js (v0.3+, planned) |
