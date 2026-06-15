"""Seed script: populate the knowledge graph with sample data."""

import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from kg_mcp.db.connection import ConnectionManager
from kg_mcp.service.graph_service import GraphService
from kg_mcp.models.node import NodeCreate
from kg_mcp.models.edge import EdgeCreate


def seed(svc: GraphService):
    """Populate the graph with sample knowledge."""
    concepts = {
        "python": NodeCreate(label="Python", properties={"type": "language", "paradigm": "multi-paradigm"}),
        "typescript": NodeCreate(label="TypeScript", properties={"type": "language", "paradigm": "static"}),
        "javascript": NodeCreate(label="JavaScript", properties={"type": "language", "paradigm": "dynamic"}),
        "fastapi": NodeCreate(label="FastAPI", properties={"type": "framework", "language": "python"}),
        "react": NodeCreate(label="React", properties={"type": "library", "language": "javascript"}),
        "nodejs": NodeCreate(label="Node.js", properties={"type": "runtime", "language": "javascript"}),
        "docker": NodeCreate(label="Docker", properties={"type": "tool", "category": "containerization"}),
        "sqlite": NodeCreate(label="SQLite", properties={"type": "database", "category": "embedded"}),
        "networkx": NodeCreate(label="NetworkX", properties={"type": "library", "language": "python"}),
        "mcp": NodeCreate(label="MCP Protocol", properties={"type": "protocol", "category": "ai"}),
    }
    
    nodes = {}
    for name, node_data in concepts.items():
        nodes[name] = svc.add_node(node_data)
    
    relationships = [
        ("python", "typescript", "influenced", 0.8),
        ("typescript", "javascript", "compiles_to", 0.9),
        ("python", "fastapi", "has_framework"),
        ("javascript", "react", "has_library"),
        ("javascript", "nodejs", "has_runtime"),
        ("python", "networkx", "has_library"),
        ("fastapi", "mcp", "supports", 0.7),
        ("nodejs", "docker", "deployed_with"),
        ("sqlite", "python", "used_by"),
        ("docker", "mcp", "deploys", 0.6),
    ]
    
    for src, tgt, rel, *rest in relationships:
        weight = rest[0] if rest else 1.0
        svc.add_edge(EdgeCreate(
            source=nodes[src].id,
            target=nodes[tgt].id,
            relation=rel,
            weight=weight,
        ))
    
    status = svc.status()
    print(f"Seed complete: {status['node_count']} nodes, {status['edge_count']} edges")
    return svc


if __name__ == "__main__":
    svc = GraphService()
    seed(svc)
