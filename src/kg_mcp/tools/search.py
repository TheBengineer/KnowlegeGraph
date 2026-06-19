"""Search and query MCP tools for the Knowledge Graph MCP Server."""

from typing import Optional

from fastmcp import FastMCP

from kg_mcp.models.node import Node
from kg_mcp.models.pagination import CursorPage, SubgraphResult, PathResult
from kg_mcp.service.graph_service import GraphService


def register_search_tools(mcp: FastMCP, svc: GraphService):
    @mcp.tool
    def get_neighbors(
        node_id: str,
        direction: str = "both",
        relation: Optional[str] = None,
        cursor: Optional[str] = None,
        limit: int = 50,
    ) -> CursorPage[dict]:
        """Get neighbors of a node. Direction: 'both', 'outgoing', or 'incoming'.
        If a relation filter is provided, delegates to relation-filtered query."""
        if relation:
            return svc.get_related_neighbors(
                node_id=node_id,
                direction=direction,
                relation=relation,
                cursor=cursor,
                limit=min(limit, 500),
            )
        return svc.get_neighbors(
            node_id=node_id,
            direction=direction,
            cursor=cursor,
            limit=min(limit, 500),
        )

    @mcp.tool
    def get_children(
        node_id: str,
        cursor: Optional[str] = None,
        limit: int = 50,
    ) -> CursorPage[dict]:
        """Get child nodes via hierarchy relations with cursor pagination."""
        return svc.get_children(
            node_id=node_id,
            cursor=cursor,
            limit=min(limit, 500),
        )

    @mcp.tool
    def get_parents(
        node_id: str,
        cursor: Optional[str] = None,
        limit: int = 50,
    ) -> CursorPage[dict]:
        """Get parent nodes via hierarchy relations with cursor pagination."""
        return svc.get_parents(
            node_id=node_id,
            cursor=cursor,
            limit=min(limit, 500),
        )

    @mcp.tool
    def get_descendants(
        node_id: str,
        max_depth: int = 10,
    ) -> list[dict]:
        """Get all descendants up to a max depth via hierarchy relations."""
        return svc.get_descendants(
            node_id=node_id,
            max_depth=max_depth,
        )

    @mcp.tool
    def get_ancestors(
        node_id: str,
        max_depth: int = 10,
    ) -> list[dict]:
        """Get all ancestors up to a max depth via hierarchy relations."""
        return svc.get_ancestors(
            node_id=node_id,
            max_depth=max_depth,
        )

    @mcp.tool
    def search_nodes(
        query: str,
        limit: int = 20,
        cursor: Optional[str] = None,
    ) -> CursorPage[Node]:
        """Search nodes by label."""
        return svc.search_nodes(query=query, limit=limit, cursor=cursor)

    @mcp.tool
    def list_nodes(
        limit: int = 100,
        cursor: Optional[str] = None,
    ) -> CursorPage[Node]:
        """List all nodes with cursor pagination, ordered by label."""
        return svc.list_nodes(limit=limit, cursor=cursor)

    @mcp.tool
    def list_edges(
        limit: int = 100,
        cursor: Optional[str] = None,
    ) -> CursorPage[dict]:
        """List all edges with cursor pagination, ordered by id."""
        return svc.list_edges(limit=limit, cursor=cursor)

    @mcp.tool
    def list_relations() -> list[str]:
        """List all distinct relation types used in the graph."""
        return svc.list_relations()

    @mcp.tool
    def get_subgraph(
        node_id: str,
        depth: int = 2,
        direction: str = "both",
    ) -> SubgraphResult:
        """Get the subgraph around a node up to a given depth."""
        return svc.get_subgraph(node_id=node_id, depth=depth, direction=direction)

    @mcp.tool
    def get_path(
        source: str,
        target: str,
        max_depth: int = 6,
    ) -> PathResult:
        """Find the shortest path between two nodes."""
        return svc.get_path(source=source, target=target, max_depth=max_depth)
