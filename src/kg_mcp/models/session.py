from __future__ import annotations
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field


class Session(BaseModel):
    session_id: str = Field(..., description="Unique session identifier (UUID)")
    created_at: datetime = Field(default_factory=datetime.utcnow, description="When session was created")
    last_active_at: datetime = Field(default_factory=datetime.utcnow, description="Last activity timestamp")
    status: str = Field(default="active", description="Session status: 'active', 'committed', 'rolled_back'")
