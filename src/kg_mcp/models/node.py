from __future__ import annotations
from datetime import datetime
from typing import Any, Optional
from pydantic import BaseModel, Field


class NodeCreate(BaseModel):
    label: str = Field(..., min_length=1, max_length=255, description="Node label/name")
    properties: dict[str, Any] = Field(default_factory=dict, description="Arbitrary key-value properties")
    source: str = Field(default="manual", description="Source of this node (manual, ai, import, etc.)")


class Node(NodeCreate):
    id: str = Field(..., description="Unique node identifier (UUID)")
    created_at: datetime = Field(default_factory=datetime.utcnow, description="Creation timestamp")
    updated_at: datetime = Field(default_factory=datetime.utcnow, description="Last update timestamp")
    version: int = Field(default=1, description="Version counter for optimistic concurrency")
    embedding: Optional[list[float]] = Field(default=None, description="Vector embedding for semantic search")


class NodeUpdate(BaseModel):
    label: Optional[str] = Field(default=None, min_length=1, max_length=255)
    properties: Optional[dict[str, Any]] = None
    source: Optional[str] = None
