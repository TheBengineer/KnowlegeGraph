from __future__ import annotations
from datetime import datetime
from typing import Any, Optional
from pydantic import BaseModel, Field


class GraphEvent(BaseModel):
    id: int = Field(..., description="Auto-incrementing event ID")
    entity_type: str = Field(..., description="Type of entity: 'node', 'edge'")
    entity_id: str = Field(..., description="ID of the entity that changed")
    event_type: str = Field(..., description="Type of change: 'created', 'updated', 'deleted'")
    snapshot: dict[str, Any] = Field(default_factory=dict, description="Full entity snapshot at time of event")
    performed_by: Optional[str] = Field(default=None, description="API key or user identifier")
    performed_at: datetime = Field(default_factory=datetime.utcnow, description="When the event occurred")
