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
        """Get neighbors of a node. Direction: 'both', 'outgoing', or 'incoming'."""
        return svc.get_neighbors(
            node_id=node_id,
            direction=direction,
            relation=relation,
            cursor=cursor,
            limit=min(limit, 500),
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
