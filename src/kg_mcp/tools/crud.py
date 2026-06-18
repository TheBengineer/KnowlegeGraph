"""CRUD MCP tools for the Knowledge Graph MCP Server."""

from typing import Any, Optional

from fastmcp import FastMCP

from kg_mcp.models.node import Node, NodeCreate
from kg_mcp.models.edge import Edge, EdgeCreate
from kg_mcp.models.content import ContentType, NodeContent, NodeContentCreate
from kg_mcp.service.graph_service import GraphService


def register_crud_tools(mcp: FastMCP, svc: GraphService):
    @mcp.tool
    def add_node(
        label: str,
        properties: Optional[dict[str, Any]] = None,
        source: str = "manual",
        session_id: Optional[str] = None,
    ) -> Node:
        """Add a node to the knowledge graph."""
        return svc.add_node(
            NodeCreate(label=label, properties=properties or {}, source=source),
            session_id=session_id,
        )

    @mcp.tool
    def get_node(node_id: str) -> Optional[Node]:
        """Get a node by its ID."""
        return svc.get_node(node_id)

    @mcp.tool
    def update_node(
        node_id: str,
        label: Optional[str] = None,
        properties: Optional[dict[str, Any]] = None,
        source: Optional[str] = None,
    ) -> Optional[Node]:
        """Update a node's label and/or properties."""
        existing = svc.get_node(node_id)
        if existing is None:
            return None
        return svc.update_node(
            node_id,
            NodeCreate(
                label=label or existing.label,
                properties=properties or existing.properties,
                source=source or existing.source,
            ),
        )

    @mcp.tool
    def delete_node(node_id: str, cascade: bool = False) -> bool:
        """Delete a node. If cascade=True, also delete connected edges."""
        return svc.delete_node(node_id, cascade=cascade)

    @mcp.tool
    def add_edge(
        source: str,
        target: str,
        relation: str,
        properties: Optional[dict[str, Any]] = None,
        weight: float = 1.0,
        session_id: Optional[str] = None,
    ) -> Optional[Edge]:
        """Add an edge between two nodes."""
        return svc.add_edge(
            EdgeCreate(
                source=source,
                target=target,
                relation=relation,
                properties=properties or {},
                weight=weight,
            ),
            session_id=session_id,
        )

    @mcp.tool
    def add_node_content(
        node_id: str,
        content_type: ContentType,
        content: str,
    ) -> NodeContent:
        """Add a content entry to a node."""
        return svc.add_node_content(
            NodeContentCreate(
                node_id=node_id,
                content_type=content_type,
                content=content,
            )
        )

    @mcp.tool
    def get_node_contents(node_id: str) -> list[NodeContent]:
        """Get all content entries for a node."""
        return svc.get_node_contents(node_id)

    @mcp.tool
    def delete_node_content(content_id: str) -> bool:
        """Delete a content entry by its ID."""
        return svc.delete_node_content(content_id)
