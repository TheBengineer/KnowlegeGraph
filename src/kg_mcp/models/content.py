from __future__ import annotations
from datetime import datetime
from enum import Enum
from typing import Optional
from pydantic import BaseModel, Field


class ContentType(str, Enum):
    TEXT = "TEXT"
    FILE_LINK = "FILE_LINK"
    CODE = "CODE"
    MARKDOWN = "MARKDOWN"
    NOTE = "NOTE"


class NodeContentCreate(BaseModel):
    node_id: str = Field(..., description="ID of the node this content belongs to")
    content_type: ContentType = Field(..., description="Type of content")
    content: str = Field(..., description="The content text/body")


class NodeContent(NodeContentCreate):
    id: str = Field(..., description="Unique content identifier (UUID)")
    created_at: datetime = Field(default_factory=datetime.utcnow, description="Creation timestamp")
    updated_at: datetime = Field(default_factory=datetime.utcnow, description="Last update timestamp")
