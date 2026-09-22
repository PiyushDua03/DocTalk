import json
import os
import logging
from typing import Optional

from app.chat_models import Conversation

logger = logging.getLogger(__name__)

# Chat metadata file location (next to the backend folder)
CHATS_FILE = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "chats_metadata.json",
)

def _load_chats() -> dict[str, dict]:
    """Load all chats from the JSON file."""
    if not os.path.exists(CHATS_FILE):
        return {}

    try:
        with open(CHATS_FILE, "r", encoding="utf-8") as f:
            return json.load(f)

    except (json.JSONDecodeError, IOError) as error:
        logger.error(f"Failed to load chats: {error}")
        return {}

def _save_chats(chats: dict[str, dict]) -> None:
    """Save all chats to the JSON file."""
    try:
        with open(CHATS_FILE, "w", encoding="utf-8") as f:
            json.dump(chats, f, indent=2, ensure_ascii=False)

    except IOError as error:
        logger.error(f"Failed to save chats: {error}")
        raise

def save_conversation(conv: Conversation) -> None:
    """Save or update a conversation."""
    chats = _load_chats()
    chats[conv.conversation_id] = conv.model_dump()
    _save_chats(chats)

def get_conversation(conversation_id: str) -> Optional[Conversation]:
    """Retrieve a single conversation by ID."""
    chats = _load_chats()
    conv_data = chats.get(conversation_id)

    if conv_data is None:
        return None

    return Conversation(**conv_data)

def get_all_conversations() -> list[Conversation]:
    """Retrieve all conversations."""
    chats = _load_chats()

    return [
        Conversation(**conv_data)
        for conv_data in chats.values()
    ]

def delete_conversation(conversation_id: str) -> bool:
    """Delete a conversation by ID."""
    chats = _load_chats()

    if conversation_id not in chats:
        return False

    del chats[conversation_id]
    _save_chats(chats)
    return True
