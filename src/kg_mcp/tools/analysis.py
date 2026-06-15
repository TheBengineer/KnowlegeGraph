"""Analysis MCP tools for the Knowledge Graph MCP Server."""

from fastmcp import FastMCP

from kg_mcp.service.graph_service import GraphService


def register_analysis_tools(mcp: FastMCP, svc: GraphService):
    @mcp.tool
    def graph_stats() -> dict:
        """Get graph statistics including node/edge counts, density, most connected nodes, and relation distribution."""
        return svc.graph_stats()

    @mcp.tool
    def get_communities(min_community_size: int = 2) -> list[dict]:
        """Detect communities in the graph using modularity optimization."""
        return svc.get_communities(min_community_size=min_community_size)
