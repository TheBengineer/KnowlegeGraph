"""
Environment-based configuration for the Knowledge Graph MCP Server.

Uses environment variables with sensible defaults for local development.
"""

import os
from dataclasses import dataclass, field
from typing import Optional


@dataclass
class Settings:
    # Database
    db_path: str = field(default_factory=lambda: os.getenv("KG_DB_PATH", "kg.db"))
    
    # Server
    host: str = field(default_factory=lambda: os.getenv("KG_HOST", "0.0.0.0"))
    port: int = field(default_factory=lambda: int(os.getenv("KG_PORT", "8080")))
    
    # Embedding model
    embedding_model: str = field(
        default_factory=lambda: os.getenv("KG_EMBEDDING_MODEL", "all-MiniLM-L6-v2")
    )
    embedding_dim: int = field(
        default_factory=lambda: int(os.getenv("KG_EMBEDDING_DIM", "384"))
    )
    
    # Pagination defaults
    default_page_size: int = field(
        default_factory=lambda: int(os.getenv("KG_PAGE_SIZE", "50"))
    )
    max_page_size: int = field(
        default_factory=lambda: int(os.getenv("KG_MAX_PAGE_SIZE", "500"))
    )
    
    # Session
    session_timeout_seconds: int = field(
        default_factory=lambda: int(os.getenv("KG_SESSION_TIMEOUT", "300"))
    )
    
    # Logging
    log_level: str = field(
        default_factory=lambda: os.getenv("KG_LOG_LEVEL", "INFO")
    )

    # API Key (optional — empty means no auth)
    api_key: Optional[str] = field(
        default_factory=lambda: os.getenv("KG_API_KEY", None)
    )


settings = Settings()
