"""System MCP tools for the Knowledge Graph MCP Server."""

from fastmcp import FastMCP

from kg_mcp.service.graph_service import GraphService


def register_system_tools(mcp: FastMCP, svc: GraphService):
    @mcp.tool
    def kg_status() -> dict:
        """Get the knowledge graph server status and statistics."""
        return svc.status()

    @mcp.tool
    def kg_commit(session_id: str) -> int:
        """Commit all staged operations in a session. Returns the number of operations committed."""
        return svc.session_manager.commit(session_id)

    @mcp.tool
    def kg_rollback(session_id: str) -> bool:
        """Rollback all staged operations in a session."""
        return svc.session_manager.rollback(session_id)
