"""Test Pydantic model validation."""

import pytest
from pydantic import ValidationError
from kg_mcp.models.node import NodeCreate, Node
from kg_mcp.models.edge import EdgeCreate, Edge
from kg_mcp.models.pagination import CursorPage, SubgraphResult, PathResult


class TestNodeModels:
    def test_create_valid_node(self):
        n = NodeCreate(label="Test", properties={"key": "val"})
        assert n.label == "Test"
        assert n.properties == {"key": "val"}
        assert n.source == "manual"

    def test_create_node_empty_label(self):
        with pytest.raises(ValidationError):
            NodeCreate(label="")

    def test_create_node_long_label(self):
        NodeCreate(label="x" * 255)

    def test_create_node_too_long_label(self):
        with pytest.raises(ValidationError):
            NodeCreate(label="x" * 256)


class TestEdgeModels:
    def test_create_valid_edge(self):
        e = EdgeCreate(source="a", target="b", relation="knows")
        assert e.source == "a"
        assert e.target == "b"
        assert e.relation == "knows"
        assert e.weight == 1.0

    def test_create_edge_empty_relation(self):
        with pytest.raises(ValidationError):
            EdgeCreate(source="a", target="b", relation="")

    def test_create_edge_negative_weight(self):
        with pytest.raises(ValidationError):
            EdgeCreate(source="a", target="b", relation="knows", weight=-1)

    def test_create_edge_high_weight(self):
        EdgeCreate(source="a", target="b", relation="knows", weight=10.0)

    def test_create_edge_too_high_weight(self):
        with pytest.raises(ValidationError):
            EdgeCreate(source="a", target="b", relation="knows", weight=11)


class TestPaginationModels:
    def test_empty_page(self):
        page = CursorPage[int](items=[], cursor=None, has_more=False)
        assert len(page.items) == 0
        assert page.cursor is None
        assert not page.has_more

    def test_page_with_items(self):
        page = CursorPage[int](items=[1, 2, 3], cursor="3", has_more=True)
        assert len(page.items) == 3
        assert page.cursor == "3"
        assert page.has_more

    def test_subgraph_result(self):
        sr = SubgraphResult(nodes=[{"id": "1"}], edges=[], stats={"count": 1})
        assert len(sr.nodes) == 1
        assert sr.stats["count"] == 1

    def test_path_result_found(self):
        pr = PathResult(found=True, path=["a", "b", "c"], edges=[], length=2)
        assert pr.found
        assert pr.length == 2

    def test_path_result_not_found(self):
        pr = PathResult(found=False, path=[], edges=[], length=0)
        assert not pr.found
