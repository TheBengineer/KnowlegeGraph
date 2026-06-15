"""Entry point for the Knowledge Graph MCP Server."""

import sys

from kg_mcp.server import create_app


def main():
    """Start the MCP server on stdio transport."""
    app = create_app()
    app.run(transport="stdio")


if __name__ == "__main__":
    main()
