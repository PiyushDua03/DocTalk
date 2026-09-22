from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime

class Message(BaseModel):
    role: str  # "user" or "assistant"
    content: str
    timestamp: str

class Conversation(BaseModel):
    conversation_id: str
    title: str
    created_at: str
    updated_at: str
    document_ids: List[str]
    messages: List[Message]

class ChatSummary(BaseModel):
    conversation_id: str
    title: str
    updated_at: str
