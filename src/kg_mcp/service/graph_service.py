"""
GraphService — business logic for the Knowledge Graph MCP Server.

Uses NetworkX as an in-memory read cache for O(1) traversals and SQLite
as the durable source of truth. Supports session-scoped staging for
multi-step LLM operations.
"""

import json
import threading
import uuid
from typing import Any, Optional

import networkx as nx

from kg_mcp.config import settings
from kg_mcp.db.connection import ConnectionManager
from kg_mcp.db import queries as q
from kg_mcp.models.node import Node, NodeCreate
from kg_mcp.models.edge import Edge, EdgeCreate
from kg_mcp.models.pagination import CursorPage, SubgraphResult, PathResult
from kg_mcp.service.session_manager import SessionManager


class GraphService:
    """Central business logic for graph operations.
    
    NetworkX in-memory cache provides O(1) adjacency lookups, traversals,
    and graph algorithms. SQLite provides durable persistence. The cache
    is rebuilt from SQLite on startup and kept consistent on writes.
    
    All mutation methods accept an optional ``session_id`` parameter.
    When provided, operations are staged via SessionManager and not
    written to the main graph until commit(). Without it, operations
    write directly to SQLite + NetworkX cache.
    """
    
    def __init__(self, conn_manager: Optional[ConnectionManager] = None):
        self.conn_manager = conn_manager or ConnectionManager()
        self.conn_manager.initialize_schema()
        self.session_manager = SessionManager(self.conn_manager)
        self.graph: nx.Graph = nx.Graph()
        self._lock = threading.Lock()
        self._rebuild_cache()
        self._ensure_home_node()
    
    def _rebuild_cache(self) -> None:
        """Rebuild the NetworkX cache from SQLite."""
        with self._lock:
            self.graph.clear()
        conn = self.conn_manager.get_connection()
        
        nodes = conn.execute("SELECT id, label, properties, source FROM nodes").fetchall()
        for n in nodes:
            props = json.loads(n["properties"]) if isinstance(n["properties"], str) else (n["properties"] or {})
            self.graph.add_node(n["id"], label=n["label"], properties=props, source=n["source"])
        
        edges = conn.execute("SELECT id, source, target, relation, weight, properties FROM edges").fetchall()
        for e in edges:
            props = json.loads(e["properties"]) if isinstance(e["properties"], str) else (e["properties"] or {})
            self.graph.add_edge(
                e["source"], e["target"],
                id=e["id"], relation=e["relation"], weight=e["weight"],
                properties=props,
            )
    
    HOME_NODE_ID = "home"
    HOME_NODE_LABEL = "Home"
    QUICK_START_ID = "quick-start"
    QUICK_START_LABEL = "Quick Start"
    
    def _ensure_home_node(self) -> None:
        """Ensure default nodes exist. Called on startup."""
        conn = self.conn_manager.get_connection()
        existing = conn.execute(q.GET_NODE, {"id": self.HOME_NODE_ID}).fetchone()
        if existing:
            return
        
        # Create Home node
        properties_json = json.dumps({"type": "root", "description": "Default starting node"})
        conn.execute(q.INSERT_NODE, {
            "id": self.HOME_NODE_ID,
            "label": self.HOME_NODE_LABEL,
            "properties": properties_json,
            "source": "system",
        })
        
        quick_start_guide = (
            "## Quick Start\n\n"
            "Run `scan_codebase` to import a codebase,\n"
            "then use `search_nodes` and `get_subgraph` to explore."
        )
        qs_properties = json.dumps({"type": "guide", "content": quick_start_guide})
        conn.execute(q.INSERT_NODE, {
            "id": self.QUICK_START_ID,
            "label": self.QUICK_START_LABEL,
            "properties": qs_properties,
            "source": "system",
        })
        
        # Edge: Home → Quick Start
        conn.execute(q.INSERT_EDGE, {
            "id": "home-to-quickstart",
            "source": self.HOME_NODE_ID,
            "target": self.QUICK_START_ID,
            "relation": "links_to",
            "properties": '{}',
            "weight": 1.0,
        })
        
        conn.commit()
        
        with self._lock:
            self.graph.add_node(
                self.HOME_NODE_ID,
                label=self.HOME_NODE_LABEL,
                properties={"type": "root", "description": "Default starting node"},
                source="system",
            )
            self.graph.add_node(
                self.QUICK_START_ID,
                label=self.QUICK_START_LABEL,
                properties={"type": "guide", "content": quick_start_guide},
                source="system",
            )
            self.graph.add_edge(
                self.HOME_NODE_ID, self.QUICK_START_ID,
                id="home-to-quickstart", relation="links_to",
                weight=1.0, properties={},
            )
    
    def _row_to_node(self, row) -> Node:
        """Convert a sqlite3.Row to a Node model."""
        props = json.loads(row["properties"]) if isinstance(row["properties"], str) else (row["properties"] or {})
        return Node(
            id=row["id"],
            label=row["label"],
            properties=props,
            source=row["source"],
            created_at=row["created_at"],
            updated_at=row["updated_at"],
            version=row["version"],
        )
    
    def _row_to_edge(self, row) -> Edge:
        """Convert a sqlite3.Row to an Edge model."""
        props = json.loads(row["properties"]) if isinstance(row["properties"], str) else (row["properties"] or {})
        return Edge(
            id=row["id"],
            source=row["source"],
            target=row["target"],
            relation=row["relation"],
            properties=props,
            weight=row["weight"],
            created_at=row["created_at"],
            updated_at=row["updated_at"],
        )
    
    # ── CRUD: Nodes ───────────────────────────────────────────────
    
    def add_node(self, data: NodeCreate, session_id: Optional[str] = None) -> Node:
        """Add a node. Returns the created Node."""
        node_id = str(uuid.uuid4())
        properties_json = json.dumps(data.properties)
        
        if session_id:
            self.session_manager.stage_node(
                session_id, node_id, data.label, properties_json, data.source
            )
            return Node(id=node_id, label=data.label, properties=data.properties, source=data.source,
                       created_at=None, updated_at=None, version=1)
        
        conn = self.conn_manager.get_connection()
        row = conn.execute(q.INSERT_NODE, {
            "id": node_id, "label": data.label,
            "properties": properties_json, "source": data.source,
        }).fetchone()
        conn.commit()
        
        # Update cache
        with self._lock:
            self.graph.add_node(node_id, label=data.label, properties=data.properties, source=data.source)
        
        return self._row_to_node(row)
    
    def get_node(self, node_id: str) -> Optional[Node]:
        """Get a node by ID. Returns None if not found."""
        conn = self.conn_manager.get_connection()
        row = conn.execute(q.GET_NODE, {"id": node_id}).fetchone()
        if row is None:
            return None
        return self._row_to_node(row)
    
    def update_node(self, node_id: str, data: NodeCreate) -> Optional[Node]:
        """Update a node's label and/or properties."""
        properties_json = json.dumps(data.properties)
        conn = self.conn_manager.get_connection()
        row = conn.execute(q.UPDATE_NODE, {
            "id": node_id, "label": data.label,
            "properties": properties_json, "source": data.source,
        }).fetchone()
        if row is None:
            return None
        conn.commit()
        
        # Update cache
        with self._lock:
            if self.graph.has_node(node_id):
                self.graph.nodes[node_id].update(label=data.label, properties=data.properties, source=data.source)
        
        return self._row_to_node(row)
    
    def delete_node(self, node_id: str, cascade: bool = False) -> bool:
        """Delete a node. If cascade=True, also delete connected edges."""
        conn = self.conn_manager.get_connection()
        if cascade:
            conn.execute(q.DELETE_EDGES_BY_NODE, {"node_id": node_id})
        conn.execute(q.DELETE_NODE, {"id": node_id})
        conn.commit()
        
        # Update cache
        with self._lock:
            if self.graph.has_node(node_id):
                self.graph.remove_node(node_id)
        
        return True
    
    # ── CRUD: Edges ───────────────────────────────────────────────
    
    def add_edge(self, data: EdgeCreate, session_id: Optional[str] = None) -> Optional[Edge]:
        """Add an edge between two nodes. Returns None if either node doesn't exist."""
        conn = self.conn_manager.get_connection()
        source_exists = conn.execute(q.GET_NODE, {"id": data.source}).fetchone()
        target_exists = conn.execute(q.GET_NODE, {"id": data.target}).fetchone()
        if not source_exists or not target_exists:
            return None
        
        edge_id = str(uuid.uuid4())
        properties_json = json.dumps(data.properties)
        
        if session_id:
            self.session_manager.stage_edge(
                session_id, edge_id, data.source, data.target,
                data.relation, properties_json, data.weight
            )
            return Edge(id=edge_id, source=data.source, target=data.target,
                       relation=data.relation, properties=data.properties,
                       weight=data.weight, created_at=None, updated_at=None)
        
        row = conn.execute(q.INSERT_EDGE, {
            "id": edge_id, "source": data.source, "target": data.target,
            "relation": data.relation, "properties": properties_json,
            "weight": data.weight,
        }).fetchone()
        conn.commit()
        
        # Update cache
        with self._lock:
            self.graph.add_edge(data.source, data.target,
                           id=edge_id, relation=data.relation,
                           weight=data.weight, properties=data.properties)
        
        return self._row_to_edge(row)
    
    def get_neighbors(
        self,
        node_id: str,
        direction: str = "both",
        relation: Optional[str] = None,
        cursor: Optional[str] = None,
        limit: int = 50,
    ) -> CursorPage[dict]:
        """Get neighbors of a node with optional filtering and pagination."""
        conn = self.conn_manager.get_connection()
        params = {"node_id": node_id, "direction": direction,
                  "relation": relation, "limit": limit + 1}
        
        rows = conn.execute(q.GET_NEIGHBORS, params).fetchall()
        
        has_more = len(rows) > limit
        items = rows[:limit]
        
        return CursorPage(
            items=[dict(r) for r in items],
            cursor=items[-1]["neighbor_id"] if items else None,
            has_more=has_more,
        )
    
    # ── Search / Query ────────────────────────────────────────────
    
    def search_nodes(
        self,
        query: str,
        limit: int = 20,
        cursor: Optional[str] = None,
    ) -> CursorPage[Node]:
        """Search nodes by label substring with cursor pagination."""
        conn = self.conn_manager.get_connection()
        
        if cursor:
            rows = conn.execute(q.SEARCH_NODES_PAGED, {"cursor": cursor, "limit": limit + 1}).fetchall()
        else:
            rows = conn.execute(q.SEARCH_NODES_LABEL, {"query": query, "limit": limit + 1}).fetchall()
        
        has_more = len(rows) > limit
        items = [self._row_to_node(r) for r in rows[:limit]]
        
        return CursorPage(
            items=items,
            cursor=items[-1].id if items else None,
            has_more=has_more,
        )
    
    def list_nodes(
        self,
        limit: int = 100,
        cursor: Optional[str] = None,
    ) -> CursorPage[Node]:
        """List all nodes with cursor pagination, ordered by label."""
        conn = self.conn_manager.get_connection()
        rows = conn.execute(q.LIST_NODES, {"cursor": cursor, "limit": limit + 1}).fetchall()
        has_more = len(rows) > limit
        items = [self._row_to_node(r) for r in rows[:limit]]
        return CursorPage(
            items=items,
            cursor=items[-1].id if items else None,
            has_more=has_more,
        )
    
    def get_subgraph(self, node_id: str, depth: int = 2, direction: str = "both") -> SubgraphResult:
        """Get the subgraph around a node up to a given depth."""
        conn = self.conn_manager.get_connection()
        
        nodes = conn.execute(q.GET_SUBGRAPH_NODES, {"root_id": node_id, "max_depth": depth}).fetchall()
        edges = conn.execute(q.GET_SUBGRAPH_EDGES, {"root_id": node_id, "max_depth": depth}).fetchall()
        
        node_count = len(nodes)
        edge_count = len(edges)
        density = round((2 * edge_count) / max(node_count * (node_count - 1), 1), 6) if node_count > 1 else 0
        
        return SubgraphResult(
            nodes=[dict(r) for r in nodes],
            edges=[dict(r) for r in edges],
            stats={"node_count": node_count, "edge_count": edge_count, "density": density},
        )
    
    def get_path(self, source: str, target: str, max_depth: int = 6) -> PathResult:
        """Find the shortest path between two nodes using NetworkX BFS."""
        # Try NetworkX first (fast, in-memory)
        if self.graph.has_node(source) and self.graph.has_node(target):
            try:
                path = nx.shortest_path(self.graph, source=source, target=target)
                path_edges = []
                for i in range(len(path) - 1):
                    edge_data = self.graph.get_edge_data(path[i], path[i + 1])
                    if edge_data:
                        path_edges.append({
                            "source": path[i], "target": path[i + 1],
                            "relation": edge_data.get("relation", ""),
                            "weight": edge_data.get("weight", 1.0),
                        })
                return PathResult(
                    found=True,
                    path=path,
                    edges=path_edges,
                    length=len(path) - 1,
                )
            except (nx.NetworkXNoPath, nx.NodeNotFound):
                pass
        
        # Fallback to SQLite recursive CTE
        conn = self.conn_manager.get_connection()
        row = conn.execute(q.FIND_PATH, {
            "source_id": source, "target_id": target, "max_depth": max_depth,
        }).fetchone()
        
        if row is None:
            return PathResult(found=False, path=[], edges=[], length=0)
        
        path_ids = row["path_nodes"].split(",")
        return PathResult(
            found=True,
            path=path_ids,
            edges=[],
            length=row["depth"],
        )
    
    # ── Analysis ──────────────────────────────────────────────────
    
    def graph_stats(self) -> dict:
        """Get graph statistics."""
        conn = self.conn_manager.get_connection()
        row = conn.execute(q.GRAPH_DENSITY).fetchone()
        top_nodes = conn.execute(q.MOST_CONNECTED_NODES, {"limit": 10}).fetchall()
        relations = conn.execute(q.RELATION_STATS).fetchall()
        
        return {
            "node_count": row["node_count"],
            "edge_count": row["edge_count"],
            "density": row["density"],
            "most_connected": [{"id": n["id"], "label": n["label"], "connections": n["connection_count"]} for n in top_nodes],
            "relation_distribution": [{"relation": r["relation"], "count": r["count"]} for r in relations],
        }
    
    def get_communities(self, min_community_size: int = 2) -> list[dict]:
        """Detect communities using NetworkX's greedy modularity algorithm."""
        if self.graph.number_of_nodes() < 3:
            return []
        
        try:
            from networkx.algorithms.community import greedy_modularity_communities
            communities = greedy_modularity_communities(self.graph)
            result = []
            for i, comm in enumerate(communities):
                comm_list = list(comm)
                if len(comm_list) >= min_community_size:
                    result.append({
                        "community_id": i,
                        "size": len(comm_list),
                        "nodes": comm_list,
                    })
            return result
        except Exception:
            return []
    
    # ── System ────────────────────────────────────────────────────
    
    def status(self) -> dict:
        """Get server status with graph stats."""
        conn = self.conn_manager.get_connection()
        node_count = conn.execute(q.COUNT_NODES).fetchone()[0]
        edge_count = conn.execute(q.COUNT_EDGES).fetchone()[0]
        return {
            "status": "healthy",
            "node_count": node_count,
            "edge_count": edge_count,
            "cache_size": self.graph.number_of_nodes(),
        }
    
    def close(self):
        """Close the database connection."""
        self.conn_manager.close()
