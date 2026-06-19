"""Integration test: static file serving from the merged container."""


class TestStaticServing:
    """Verify that create_app() routes coexist with StaticFiles mount."""

    def test_health_route_exists_after_mount(self):
        """After mounting StaticFiles at /, the /health route must still be present."""
        from kg_mcp.server import create_app

        app = create_app()
        http_app = app.http_app()
        routes = [r.path for r in http_app.routes]

        assert "/health" in routes, "/health route is missing — StaticFiles mount may have shadowed it"

    def test_mcp_route_exists(self):
        """The /mcp endpoint (Streamable HTTP transport) must still be present."""
        from kg_mcp.server import create_app

        app = create_app()
        http_app = app.http_app()
        routes = [r.path for r in http_app.routes]

        assert "/mcp" in routes or any(
            "mcp" in str(r) for r in http_app.routes
        ), "/mcp route is missing"
