"""FastMCP application factory for the Knowledge Graph MCP Server."""

from fastmcp import FastMCP
from starlette.responses import JSONResponse

from kg_mcp.config import settings
from kg_mcp.service.graph_service import GraphService
from kg_mcp.tools.crud import register_crud_tools
from kg_mcp.tools.system import register_system_tools
from kg_mcp.tools.search import register_search_tools
from kg_mcp.tools.analysis import register_analysis_tools


def register_health_route(mcp: FastMCP):
    @mcp.custom_route("/health", methods=["GET"])
    async def health(request):
        return JSONResponse({"status": "ok", "healthy": True})


def create_app(svc: GraphService | None = None) -> FastMCP:
    """Create a FastMCP application with all tools registered."""
    from fastmcp.server.auth import AuthProvider
    auth = AuthProvider(api_key=settings.api_key) if settings.api_key else None
    mcp = FastMCP("knowledge-graph", auth=auth)
    if svc is None:
        svc = GraphService()
    
    register_health_route(mcp)
    register_crud_tools(mcp, svc)
    register_search_tools(mcp, svc)
    register_analysis_tools(mcp, svc)
    register_system_tools(mcp, svc)
    
    return mcp
