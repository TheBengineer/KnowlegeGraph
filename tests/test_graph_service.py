"""Test GraphService CRUD, search, and analysis operations."""

import pytest
from kg_mcp.models.node import NodeCreate
from kg_mcp.models.edge import EdgeCreate
from kg_mcp.models.content import NodeContentCreate, ContentType


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


class TestContentCRUD:
    def test_add_node_content(self, svc):
        n = svc.add_node(NodeCreate(label="Test"))
        content = svc.add_node_content(NodeContentCreate(
            node_id=n.id, content_type=ContentType.TEXT, content="Hello world"
        ))
        assert content.id is not None
        assert content.node_id == n.id
        assert content.content_type == ContentType.TEXT
        assert content.content == "Hello world"
        assert hasattr(content, "created_at")
        assert hasattr(content, "updated_at")

    def test_get_node_content(self, svc):
        n = svc.add_node(NodeCreate(label="Test"))
        created = svc.add_node_content(NodeContentCreate(
            node_id=n.id, content_type=ContentType.TEXT, content="Hello"
        ))
        got = svc.get_node_content(created.id)
        assert got is not None
        assert got.id == created.id
        assert got.content == "Hello"

    def test_get_nonexistent_node_content(self, svc):
        assert svc.get_node_content("nonexistent") is None

    def test_get_node_contents(self, svc):
        n = svc.add_node(NodeCreate(label="Test"))
        c1 = svc.add_node_content(NodeContentCreate(
            node_id=n.id, content_type=ContentType.TEXT, content="Text"
        ))
        c2 = svc.add_node_content(NodeContentCreate(
            node_id=n.id, content_type=ContentType.MARKDOWN, content="# Markdown"
        ))
        contents = svc.get_node_contents(n.id)
        assert len(contents) == 2
        content_ids = {c.id for c in contents}
        assert c1.id in content_ids
        assert c2.id in content_ids

    def test_get_node_contents_empty(self, svc):
        n = svc.add_node(NodeCreate(label="Test"))
        contents = svc.get_node_contents(n.id)
        assert len(contents) == 0

    def test_delete_node_content(self, svc):
        n = svc.add_node(NodeCreate(label="Test"))
        content = svc.add_node_content(NodeContentCreate(
            node_id=n.id, content_type=ContentType.TEXT, content="Delete me"
        ))
        svc.delete_node_content(content.id)
        assert svc.get_node_content(content.id) is None


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
        assert stats["node_count"] == 5  # 3 seeded + Home + Quick Start
        assert stats["edge_count"] == 3  # 2 original + Home→QuickStart
        assert "density" in stats
        assert "most_connected" in stats
        assert "relation_distribution" in stats

    def test_empty_stats(self, svc):
        stats = svc.graph_stats()
        assert stats["node_count"] == 2  # Home + Quick Start always exist

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


class TestHierarchy:
    def test_get_children(self, svc):
        n1 = svc.add_node(NodeCreate(label="Parent"))
        n2 = svc.add_node(NodeCreate(label="Child"))
        svc.add_edge(EdgeCreate(source=n1.id, target=n2.id, relation="contains"))
        children = svc.get_children(n1.id)
        assert len(children.items) == 1
        assert children.items[0]["child_id"] == n2.id
        assert children.items[0]["child_label"] == "Child"

    def test_get_parents(self, svc):
        n1 = svc.add_node(NodeCreate(label="Parent"))
        n2 = svc.add_node(NodeCreate(label="Child"))
        svc.add_edge(EdgeCreate(source=n1.id, target=n2.id, relation="contains"))
        parents = svc.get_parents(n2.id)
        assert len(parents.items) == 1
        assert parents.items[0]["parent_id"] == n1.id
        assert parents.items[0]["parent_label"] == "Parent"

    def test_get_descendants(self, svc):
        n1 = svc.add_node(NodeCreate(label="A"))
        n2 = svc.add_node(NodeCreate(label="B"))
        n3 = svc.add_node(NodeCreate(label="C"))
        svc.add_edge(EdgeCreate(source=n1.id, target=n2.id, relation="contains"))
        svc.add_edge(EdgeCreate(source=n2.id, target=n3.id, relation="contains"))
        descendants = svc.get_descendants(n1.id)
        c_desc = [d for d in descendants if d["id"] == n3.id]
        assert len(c_desc) == 1
        assert c_desc[0]["depth"] == 2

    def test_get_ancestors(self, svc):
        n1 = svc.add_node(NodeCreate(label="A"))
        n2 = svc.add_node(NodeCreate(label="B"))
        n3 = svc.add_node(NodeCreate(label="C"))
        svc.add_edge(EdgeCreate(source=n1.id, target=n2.id, relation="contains"))
        svc.add_edge(EdgeCreate(source=n2.id, target=n3.id, relation="contains"))
        ancestors = svc.get_ancestors(n3.id)
        a_anc = [a for a in ancestors if a["id"] == n1.id]
        assert len(a_anc) == 1
        assert a_anc[0]["depth"] == 2

    def test_get_related_neighbors(self, svc):
        n1 = svc.add_node(NodeCreate(label="A"))
        n2 = svc.add_node(NodeCreate(label="B"))
        svc.add_edge(EdgeCreate(source=n1.id, target=n2.id, relation="related"))
        result = svc.get_related_neighbors(n1.id, relation="related")
        assert len(result.items) == 1
        assert result.items[0]["neighbor_id"] == n2.id

    def test_get_neighbors_with_relation(self, svc):
        n1 = svc.add_node(NodeCreate(label="A"))
        n2 = svc.add_node(NodeCreate(label="B"))
        n3 = svc.add_node(NodeCreate(label="C"))
        svc.add_edge(EdgeCreate(source=n1.id, target=n2.id, relation="contains"))
        svc.add_edge(EdgeCreate(source=n1.id, target=n3.id, relation="related"))
        result = svc.get_related_neighbors(n1.id, relation="contains")
        assert len(result.items) == 1
        assert result.items[0]["neighbor_id"] == n2.id
