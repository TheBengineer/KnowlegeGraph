"""Shared test fixtures for the KG MCP Server."""

import pytest
from kg_mcp.db.connection import ConnectionManager
from kg_mcp.service.graph_service import GraphService
from kg_mcp.service.session_manager import SessionManager
from kg_mcp.models.node import NodeCreate
from kg_mcp.models.edge import EdgeCreate


@pytest.fixture
def conn_manager():
    cm = ConnectionManager(':memory:')
    cm.initialize_schema()
    return cm


@pytest.fixture
def svc(conn_manager):
    return GraphService(conn_manager)


@pytest.fixture
def populated_svc(svc):
    """GraphService with 3 nodes and 2 edges."""
    n1 = svc.add_node(NodeCreate(label="Python", properties={"type": "lang"}))
    n2 = svc.add_node(NodeCreate(label="TypeScript", properties={"type": "lang"}))
    n3 = svc.add_node(NodeCreate(label="JavaScript", properties={"type": "lang"}))
    svc.add_edge(EdgeCreate(source=n1.id, target=n2.id, relation="influenced", weight=0.8))
    svc.add_edge(EdgeCreate(source=n2.id, target=n3.id, relation="compiles_to"))
    return svc, n1, n2, n3


@pytest.fixture
def session_manager(conn_manager):
    return SessionManager(conn_manager)
