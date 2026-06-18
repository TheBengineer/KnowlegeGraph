"""Entry point for the Knowledge Graph MCP Server."""

from kg_mcp.config import settings
from kg_mcp.server import create_app


def main():
    """Start the MCP server on HTTP transport."""
    app = create_app()
    app.run(transport="http", host=settings.host, port=settings.port)


if __name__ == "__main__":
    main()
