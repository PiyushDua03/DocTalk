"""
DocTalk — Document data models.

Pydantic models for document metadata used across the API.
These models define the contract that Team Member 2 (RAG) and
Team Member 3 (Frontend) will consume.
"""

from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime
import uuid


class PageInfo(BaseModel):
    """Extracted text from a single page of a document."""
    page_number: int
    text: str


class DocumentMetadata(BaseModel):
    """Full document metadata including extracted content."""
    document_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    filename: str
    content_type: str
    blob_path: str
    status: str = "processing"  # processing, processed, failed
    page_count: Optional[int] = None
    character_count: int = 0
    pages: Optional[list[PageInfo]] = None
    error: Optional[str] = None
    uploaded_at: str = Field(default_factory=lambda: datetime.utcnow().isoformat())


class DocumentSummary(BaseModel):
    """Lightweight document info for list responses (no full text)."""
    document_id: str
    filename: str
    content_type: str
    status: str
    page_count: Optional[int] = None
    character_count: int = 0
    uploaded_at: str


class UploadResult(BaseModel):
    """Result for a single file in a multi-file upload."""
    document_id: Optional[str] = None
    filename: str
    status: str  # processed, failed
    error: Optional[str] = None


class UploadResponse(BaseModel):
    """Response for POST /documents/upload."""
    documents: list[UploadResult]


class DocumentForRAG(BaseModel):
    """
    Stable structure for Team Member 2 (RAG/Search).

    Provides document_id, document_name, page_number, and content
    in a flat format suitable for chunking and embedding.
    """
    document_id: str
    document_name: str
    page_number: Optional[int] = None
    content: str
