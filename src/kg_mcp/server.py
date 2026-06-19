"""FastMCP application factory for the Knowledge Graph MCP Server.

The merged container serves:
  - MCP API at /mcp (JSON-RPC over Streamable HTTP)
  - Health check at /health
  - React frontend static files at /
  - SPA fallback (index.html) for unmatched browser routes
"""

import os

from fastmcp import FastMCP
from starlette.middleware.cors import CORSMiddleware
from starlette.middleware.gzip import GZipMiddleware
from starlette.responses import JSONResponse, FileResponse
from starlette.staticfiles import StaticFiles

from kg_mcp.config import settings
from kg_mcp.service.graph_service import GraphService
from kg_mcp.tools.analysis import register_analysis_tools
from kg_mcp.tools.crud import register_crud_tools
from kg_mcp.tools.scanner import register_scanner_tools
from kg_mcp.tools.search import register_search_tools
from kg_mcp.tools.system import register_system_tools


def register_health_route(mcp: FastMCP):
    @mcp.custom_route("/health", methods=["GET"])
    async def health(request):
        return JSONResponse({"status": "ok", "healthy": True})


class _HybridASGI:
    """ASGI app that routes requests to FastMCP (API) or static files (frontend).

    - /mcp and /health → FastMCP
    - Everything else → static files with SPA fallback
    """

    def __init__(self, fastmcp_app, static_dir):
        self.fastmcp_app = fastmcp_app
        self.static_app = StaticFiles(directory=static_dir, html=True, check_dir=False)
        self.index_path = os.path.join(static_dir, "index.html")
        self._fastmcp_prefixes = ("/mcp", "/health")

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.fastmcp_app(scope, receive, send)
            return

        path = scope["path"]

        if path.startswith(self._fastmcp_prefixes):
            await self.fastmcp_app(scope, receive, send)
            return

        await self._serve_static_or_spa(scope, receive, send)

    async def _serve_static_or_spa(self, scope, receive, send):
        try:
            await self.static_app(scope, receive, send)
        except Exception:
            if os.path.isfile(self.index_path):
                response = FileResponse(self.index_path)
                await response(scope, receive, send)
            else:
                response = JSONResponse({"error": "Not found"}, status_code=404)
                await response(scope, receive, send)


def create_app(svc: GraphService | None = None) -> FastMCP:
    """Create a FastMCP application with all tools registered.

    Returns the FastMCP server object. For the full ASGI app
    (serving both API and frontend), use create_asgi_app().
    """
    from fastmcp.server.auth import AuthProvider
    auth = AuthProvider(api_key=settings.api_key) if settings.api_key else None
    mcp = FastMCP("knowledge-graph", auth=auth)
    if svc is None:
        svc = GraphService()

    register_health_route(mcp)
    register_crud_tools(mcp, svc)
    register_search_tools(mcp, svc)
    register_analysis_tools(mcp, svc)
    register_scanner_tools(mcp, svc)
    register_system_tools(mcp, svc)

    return mcp


def create_asgi_app(svc: GraphService | None = None):
    """Create the full ASGI application with FastMCP + static files + SPA fallback.

    This is the production-ready app that serves both the MCP API (at /mcp)
    and the React frontend (at /) from a single container.
    """
    mcp = create_app(svc)
    fastmcp_app = mcp.http_app()

    hybrid = _HybridASGI(fastmcp_app, settings.static_dir)

    from starlette.applications import Starlette
    from starlette.middleware import Middleware

    app = Starlette(
        lifespan=fastmcp_app.lifespan,
        middleware=[
            Middleware(
                CORSMiddleware,
                allow_origins=[
                    "http://localhost:5173",
                    "http://localhost:8080",
                    "http://127.0.0.1:8080",
                ],
                allow_methods=["*"],
                allow_headers=["*"],
            ),
        ],
    )
    app.add_middleware(GZipMiddleware, minimum_size=1000)
    app.mount("/", app=hybrid)

    return app
