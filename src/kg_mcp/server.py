"""FastMCP application factory for the Knowledge Graph MCP Server."""

from fastmcp import FastMCP

from kg_mcp.service.graph_service import GraphService
from kg_mcp.tools.crud import register_crud_tools
from kg_mcp.tools.system import register_system_tools
from kg_mcp.tools.search import register_search_tools
from kg_mcp.tools.analysis import register_analysis_tools


def create_app(svc: GraphService | None = None) -> FastMCP:
    """Create a FastMCP application with all tools registered."""
    mcp = FastMCP("knowledge-graph")
    if svc is None:
        svc = GraphService()
    
    register_crud_tools(mcp, svc)
    register_search_tools(mcp, svc)
    register_analysis_tools(mcp, svc)
    register_system_tools(mcp, svc)
    
    return mcp
