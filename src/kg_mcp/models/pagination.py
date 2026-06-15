from __future__ import annotations
from typing import Generic, Optional, TypeVar
from pydantic import BaseModel, Field

T = TypeVar("T")


class CursorPage(BaseModel, Generic[T]):
    items: list[T] = Field(default_factory=list, description="Page of items")
    cursor: Optional[str] = Field(default=None, description="Opaque cursor for the next page")
    has_more: bool = Field(default=False, description="Whether more items are available")


class SubgraphResult(BaseModel):
    nodes: list[dict] = Field(default_factory=list, description="Nodes in the subgraph")
    edges: list[dict] = Field(default_factory=list, description="Edges in the subgraph")
    stats: dict = Field(default_factory=dict, description="Subgraph statistics (node_count, edge_count, density)")


class PathResult(BaseModel):
    found: bool = Field(default=False, description="Whether a path was found")
    path: list[str] = Field(default_factory=list, description="Ordered node IDs along the path")
    edges: list[dict] = Field(default_factory=list, description="Edges along the path")
    length: int = Field(default=0, description="Number of hops in the path")
