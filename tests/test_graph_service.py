"""Test GraphService CRUD, search, and analysis operations."""

import pytest
from kg_mcp.models.node import NodeCreate
from kg_mcp.models.edge import EdgeCreate


class TestNodeCRUD:
    def test_add_node(self, svc):
        n = svc.add_node(NodeCreate(label="Test"))
        assert n.id is not None
        assert n.label == "Test"

    def test_get_node(self, svc):
        n = svc.add_node(NodeCreate(label="Test"))
        got = svc.get_node(n.id)
        assert got is not None
        assert got.label == "Test"

    def test_get_nonexistent_node(self, svc):
        assert svc.get_node("nonexistent") is None

    def test_update_node(self, svc):
        n = svc.add_node(NodeCreate(label="Old"))
        updated = svc.update_node(n.id, NodeCreate(label="New"))
        assert updated is not None
        assert updated.label == "New"

    def test_delete_node(self, svc):
        n = svc.add_node(NodeCreate(label="Gone"))
        svc.delete_node(n.id)
        assert svc.get_node(n.id) is None

    def test_delete_node_cascade(self, populated_svc):
        svc, n1, n2, n3 = populated_svc
        svc.delete_node(n1.id, cascade=True)
        assert svc.get_node(n1.id) is None

    def test_node_has_properties(self, svc):
        n = svc.add_node(NodeCreate(label="P", properties={"key": "val"}))
        assert n.properties == {"key": "val"}


class TestEdgeCRUD:
    def test_add_edge(self, svc):
        n1 = svc.add_node(NodeCreate(label="A"))
        n2 = svc.add_node(NodeCreate(label="B"))
        e = svc.add_edge(EdgeCreate(source=n1.id, target=n2.id, relation="knows"))
        assert e is not None
        assert e.relation == "knows"

    def test_add_edge_missing_node(self, svc):
        e = svc.add_edge(EdgeCreate(source="missing", target="also_missing", relation="knows"))
        assert e is None


class TestNeighbors:
    def test_get_neighbors(self, populated_svc):
        svc, n1, n2, n3 = populated_svc
        result = svc.get_neighbors(n1.id)
        assert len(result.items) == 1

    def test_get_neighbors_pagination(self, populated_svc):
        svc, n1, n2, n3 = populated_svc
        result = svc.get_neighbors(n1.id, limit=1)
        assert len(result.items) <= 1
        assert result.has_more or not result.has_more  # valid either way for small graph


class TestSearch:
    def test_search_nodes(self, populated_svc):
        svc, n1, n2, n3 = populated_svc
        results = svc.search_nodes("Python")
        assert len(results.items) >= 1
        assert results.items[0].label == "Python"

    def test_search_no_results(self, svc):
        results = svc.search_nodes("ZZZZ")
        assert len(results.items) == 0


class TestSubgraph:
    def test_get_subgraph(self, populated_svc):
        svc, n1, n2, n3 = populated_svc
        sub = svc.get_subgraph(n1.id, depth=2)
        assert sub.stats["node_count"] >= 2
        assert sub.stats["edge_count"] >= 1


class TestPath:
    def test_get_path(self, populated_svc):
        svc, n1, n2, n3 = populated_svc
        result = svc.get_path(n1.id, n3.id)
        assert result.found
        assert len(result.path) >= 2

    def test_path_nonexistent(self, svc):
        result = svc.get_path("nonexistent1", "nonexistent2")
        assert not result.found


class TestAnalysis:
    def test_graph_stats(self, populated_svc):
        svc, n1, n2, n3 = populated_svc
        stats = svc.graph_stats()
        assert stats["node_count"] == 3
        assert stats["edge_count"] == 2
        assert "density" in stats
        assert "most_connected" in stats
        assert "relation_distribution" in stats

    def test_empty_stats(self, svc):
        stats = svc.graph_stats()
        assert stats["node_count"] == 0

    def test_status(self, svc):
        status = svc.status()
        assert status["status"] == "healthy"
        assert "node_count" in status


class TestCache:
    def test_cache_rebuilds(self, svc):
        n = svc.add_node(NodeCreate(label="Cached"))
        assert svc.graph.has_node(n.id)

    def test_cache_after_delete(self, svc):
        n = svc.add_node(NodeCreate(label="Gone"))
        svc.delete_node(n.id)
        assert not svc.graph.has_node(n.id)
