from __future__ import annotations
from datetime import datetime
from typing import Any, Optional
from pydantic import BaseModel, Field


class EdgeCreate(BaseModel):
    source: str = Field(..., description="Source node ID")
    target: str = Field(..., description="Target node ID")
    relation: str = Field(..., min_length=1, max_length=255, description="Relationship type label")
    properties: dict[str, Any] = Field(default_factory=dict, description="Arbitrary key-value properties")
    weight: float = Field(default=1.0, ge=0.0, le=10.0, description="Edge weight for graph algorithms")


class Edge(EdgeCreate):
    id: str = Field(..., description="Unique edge identifier (UUID)")
    created_at: datetime = Field(default_factory=datetime.utcnow, description="Creation timestamp")
    updated_at: datetime = Field(default_factory=datetime.utcnow, description="Last update timestamp")
