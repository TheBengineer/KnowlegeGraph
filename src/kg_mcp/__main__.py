"""Entry point for the Knowledge Graph MCP Server."""

import uvicorn

from kg_mcp.config import settings
from kg_mcp.server import create_asgi_app


def main():
    """Start the MCP server with HTTP transport, static files, and SPA fallback."""
    app = create_asgi_app()
    uvicorn.run(app, host=settings.host, port=settings.port, lifespan="on")


if __name__ == "__main__":
    main()
