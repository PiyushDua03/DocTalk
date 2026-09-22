from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from pypdf import PdfReader
from docx import Document
from pydantic import BaseModel
from typing import Optional

from app.chunking_service import chunk_text
from app.indexing_service import index_chunks
from app.retrieval_service import search_documents
from app.rag_service import generate_rag_answer
from app import chat_store
from app.chat_models import Conversation, Message
from datetime import datetime

import io
import uuid
import logging

from dotenv import load_dotenv
load_dotenv()

from app.document_routes import router as document_router


logger = logging.getLogger(__name__)

app = FastAPI(title="DocTalk API")

# Include document ingestion routes (Team Member 1)
app.include_router(document_router)



# ---------------------------------------------------------
# CORS
# ---------------------------------------------------------

# Allow the frontend to call this backend.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------
# Azure AI Foundry project connection
# ---------------------------------------------------------

from azure.identity import DefaultAzureCredential
from azure.ai.projects import AIProjectClient

endpoint = "https://doctalk-korea.services.ai.azure.com/api/projects/DocTalk"

_openai_client = None

def get_openai_client():
    global _openai_client
    if _openai_client is None:
        credential = DefaultAzureCredential()
        project_client = AIProjectClient(
            endpoint=endpoint,
            credential=credential,
        )
        _openai_client = project_client.get_openai_client()
    return _openai_client

AGENT_NAME = "DocTalk-Agent"
AGENT_VERSION = "1"


# ---------------------------------------------------------
# Currently uploaded document (legacy global state)
#
# NOTE: This is preserved for backward compatibility with
# the legacy /upload and /document endpoints.
# ---------------------------------------------------------

current_document = {
    "filename": None,
    "text": "",
    "pages": []
}


# ---------------------------------------------------------
# Request models
# ---------------------------------------------------------

class SearchRequest(BaseModel):
    query: str
    top_k: int = 5
    mode: str = "hybrid"  # "keyword", "vector", "hybrid"
    document_ids: list[str] = []


class RagChatRequest(BaseModel):
    question: str
    top_k: int = 5


class SessionChatRequest(BaseModel):
    """
    Session-scoped chat request.

    The frontend sends the user's message along with the document IDs
    that belong to the CURRENT session. The backend will use ONLY
    these documents for context — never global or historical documents.

    If document_ids is empty, the chatbot responds as a general AI
    assistant without any document context.
    """
    message: str
    document_ids: list[str] = []
    conversation_id: Optional[str] = None


# ---------------------------------------------------------
# Root endpoint
# ---------------------------------------------------------

@app.get("/")
def root():
    return {
        "app": "DocTalk",
        "status": "running",
        "document": current_document["filename"]
    }


# ---------------------------------------------------------
# Search endpoint
# ---------------------------------------------------------

from app.search_service import keyword_search, vector_search, hybrid_search
from app.embedding_service import generate_embedding

@app.post("/search")
def search(request: SearchRequest):
    try:
        if request.mode == "keyword":
            results = keyword_search(request.query, top=request.top_k, document_ids=request.document_ids)
        elif request.mode == "vector":
            query_vector = generate_embedding(request.query)
            results = vector_search(query_vector, top=request.top_k, document_ids=request.document_ids)
        else: # default to hybrid
            query_vector = generate_embedding(request.query)
            results = hybrid_search(request.query, query_vector, top=request.top_k, document_ids=request.document_ids)

        return {
            "query": request.query,
            "mode": request.mode,
            "results": [
                {
                    "chunk_id": result["chunk_id"],
                    "document_id": result["document_id"],
                    "document_name": result["document_name"],
                    "page_number": result["page_number"],
                    "content": result["content"],
                    "score": result.get("@search.score", 0),
                }
                for result in results
            ],
        }

    except Exception as error:
        raise HTTPException(
            status_code=500,
            detail=f"Search failed: {str(error)}",
        )


# ---------------------------------------------------------
# RAG chat endpoint (unfiltered, for direct API use)
# ---------------------------------------------------------

@app.post("/rag/chat")
def rag_chat(request: RagChatRequest):
    try:
        result = generate_rag_answer(
            request.question,
            top_k=request.top_k,
        )

        return result

    except Exception as error:
        raise HTTPException(
            status_code=500,
            detail=f"RAG chat failed: {str(error)}",
        )


# ---------------------------------------------------------
# Get current document details
# ---------------------------------------------------------

@app.get("/document")
def get_document():
    return {
        "filename": current_document["filename"],
        "uploaded": current_document["filename"] is not None,
        "pages": len(current_document["pages"]),
    }


# ---------------------------------------------------------
# Index uploaded document
# ---------------------------------------------------------

@app.post("/documents/{document_id}/index")
def index_document(document_id: str):
    filename = current_document["filename"]
    pages = current_document["pages"]

    if not filename or not pages:
        raise HTTPException(
            status_code=400,
            detail="No document is currently uploaded.",
        )

    all_chunks = []

    # Create chunks separately for each page.
    # This preserves the actual PDF page number.
    for page_number, page_text in enumerate(pages, start=1):

        page_chunks = chunk_text(
            text=page_text,
            document_id=document_id,
            document_name=filename,
            page_number=page_number,
        )

        all_chunks.extend(page_chunks)

    if not all_chunks:
        raise HTTPException(
            status_code=400,
            detail="Could not create document chunks.",
        )

    try:
        result = index_chunks(all_chunks)

        return {
            "document_id": document_id,
            "document_name": filename,
            "chunks": len(all_chunks),
            "pages": len(pages),
            "indexing": result,
        }

    except Exception as error:
        raise HTTPException(
            status_code=500,
            detail=f"Document indexing failed: {str(error)}",
        )


# ---------------------------------------------------------
# Upload document
#
# Returns a document_id so the frontend can track which
# documents belong to the current session.
# ---------------------------------------------------------

@app.post("/upload")
async def upload_document(file: UploadFile = File(...)):

    filename = file.filename or ""
    extension = filename.lower().split(".")[-1]

    allowed_extensions = ["pdf", "docx", "txt"]

    if extension not in allowed_extensions:
        raise HTTPException(
            status_code=400,
            detail="Only PDF, DOCX, and TXT files are supported."
        )

    file_bytes = await file.read()

    # Generate a unique document ID for session tracking.
    # This ID is used by the frontend to tell the /chat endpoint
    # which documents belong to the current session.
    document_id = str(uuid.uuid4())

    try:

        # -------------------------------------------------
        # TXT
        # -------------------------------------------------

        if extension == "txt":

            text = file_bytes.decode(
                "utf-8",
                errors="ignore"
            )

            # TXT is treated as one page.
            document_pages = [text]


        # -------------------------------------------------
        # PDF
        # -------------------------------------------------

        elif extension == "pdf":

            pdf_file = io.BytesIO(file_bytes)

            reader = PdfReader(pdf_file)

            document_pages = []

            # Keep every PDF page separately.
            for page in reader.pages:

                page_text = page.extract_text() or ""

                document_pages.append(page_text)

            # Keep combined text for compatibility
            # with the existing backend.
            text = "\n\n".join(document_pages)


        # -------------------------------------------------
        # DOCX
        # -------------------------------------------------

        else:

            docx_file = io.BytesIO(file_bytes)

            document = Document(docx_file)

            paragraphs = []

            for paragraph in document.paragraphs:

                paragraphs.append(paragraph.text)

            text = "\n".join(paragraphs)

            # DOCX is currently treated as one page.
            document_pages = [text]


        # -------------------------------------------------
        # Empty document validation
        # -------------------------------------------------

        if not text.strip():

            raise HTTPException(
                status_code=400,
                detail=(
                    "The document appears to be empty or "
                    "text could not be extracted."
                )
            )


        # -------------------------------------------------
        # Store uploaded document in legacy global state
        # -------------------------------------------------

        current_document["filename"] = filename

        current_document["text"] = text

        current_document["pages"] = document_pages


        # -------------------------------------------------
        # Also store in metadata_store for the document
        # library ("My Documents") and session-scoped
        # retrieval via the /chat endpoint.
        # -------------------------------------------------

        from app.document_models import DocumentMetadata, PageInfo
        from app import metadata_store

        pages_info = [
            PageInfo(page_number=i + 1, text=p)
            for i, p in enumerate(document_pages)
        ]

        doc_meta = DocumentMetadata(
            document_id=document_id,
            filename=filename,
            content_type=(
                "application/pdf" if extension == "pdf"
                else "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                if extension == "docx"
                else "text/plain"
            ),
            blob_path=f"local/{document_id}/{filename}",
            status="processed",
            page_count=len(document_pages),
            character_count=len(text),
            pages=pages_info,
        )

        metadata_store.save_document(doc_meta)

        logger.info(
            f"Upload stored in metadata_store: "
            f"{filename} → {document_id}"
        )

        # -------------------------------------------------
        # Auto-index into Azure AI Search for RAG
        # -------------------------------------------------
        try:
            chunks = chunk_text(
                text=text,
                document_id=document_id,
                document_name=filename,
                pages=pages_info,
            )
            index_result = index_chunks(chunks)
            logger.info(
                f"Auto-indexed {filename}: "
                f"{index_result.get('uploaded', 0)} chunks uploaded"
            )
        except Exception as index_err:
            logger.warning(
                f"Auto-indexing failed for {filename}: {index_err}. "
                f"Document uploaded but not searchable via RAG."
            )


        # -------------------------------------------------
        # Upload response — includes document_id so the
        # frontend can track session documents.
        # -------------------------------------------------

        return {
            "message": "Document uploaded successfully.",
            "document_id": document_id,
            "filename": filename,
            "characters": len(text),
            "pages": len(document_pages),
        }


    except HTTPException:

        raise


    except Exception as error:

        raise HTTPException(
            status_code=500,
            detail=f"Could not read the document: {str(error)}"
        )


# ---------------------------------------------------------
# Session-scoped chat endpoint
#
# SESSION-SCOPE ARCHITECTURE:
#   1. Frontend sends document_ids uploaded in THIS session.
#   2. Backend passes document_ids to the existing RAG pipeline.
#   3. retrieval_service.search_documents() applies an OData
#      filter to Azure AI Search:
#        document_id eq 'id1' or document_id eq 'id2'
#   4. Azure AI Search returns ONLY chunks from those documents.
#   5. rag_service builds prompt with filtered chunks.
#   6. AI generates answer using ONLY session documents.
#
#   If document_ids is empty:
#     → Do NOT search Azure AI Search at all.
#     → Respond as a general AI assistant.
#     → Do NOT fall back to searching historical documents.
# ---------------------------------------------------------

@app.get("/conversations")
def list_conversations():
    """List all previous conversations."""
    chats = chat_store.get_all_conversations()
    # Sort by updated_at descending
    chats.sort(key=lambda c: c.updated_at, reverse=True)
    return [
        {
            "conversation_id": c.conversation_id,
            "title": c.title,
            "updated_at": c.updated_at
        }
        for c in chats
    ]

@app.get("/conversations/{conversation_id}")
def get_conversation(conversation_id: str):
    """Get a specific conversation and its messages."""
    conv = chat_store.get_conversation(conversation_id)
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return conv.model_dump()

@app.post("/conversations")
def create_conversation():
    """Create a new blank conversation."""
    conv_id = str(uuid.uuid4())
    now = datetime.utcnow().isoformat()
    conv = Conversation(
        conversation_id=conv_id,
        title="New Conversation",
        created_at=now,
        updated_at=now,
        document_ids=[],
        messages=[]
    )
    chat_store.save_conversation(conv)
    return {"conversation_id": conv_id}

@app.delete("/conversations/{conversation_id}")
def delete_conversation(conversation_id: str):
    """Delete a conversation."""
    success = chat_store.delete_conversation(conversation_id)
    if not success:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return {"status": "deleted"}

@app.post("/chat")
def chat(request: SessionChatRequest):
    """
    Session-scoped chat endpoint.

    Accepts a JSON body:
    {
        "message": "user's question",
        "document_ids": ["doc-id-1", "doc-id-2"]
    }

    The chatbot uses ONLY the specified documents for context.
    Document isolation is enforced at the Azure AI Search level
    via OData filtering on document_id.
    """

    message = request.message
    document_ids = request.document_ids
    conversation_id = request.conversation_id

    if not message.strip():
        raise HTTPException(
            status_code=400,
            detail="Message cannot be empty."
        )

    # Load or create conversation
    conv = None
    now = datetime.utcnow().isoformat()
    
    if conversation_id:
        conv = chat_store.get_conversation(conversation_id)
        
    if not conv:
        conversation_id = conversation_id or str(uuid.uuid4())
        title = message[:40] + "..." if len(message) > 40 else message
        conv = Conversation(
            conversation_id=conversation_id,
            title=title,
            created_at=now,
            updated_at=now,
            document_ids=document_ids,
            messages=[]
        )
    else:
        # Update document_ids for the conversation
        conv.document_ids = document_ids
        conv.updated_at = now

    # Append user message
    conv.messages.append(Message(
        role="user",
        content=message,
        timestamp=now
    ))


    # ---------------------------------------------------------
    # CASE 1: No documents in session → general AI assistant
    #
    # Do NOT search Azure AI Search. Do NOT fall back to
    # historical documents. Either answer as a general AI
    # or tell the user to upload a document.
    # ---------------------------------------------------------

    if not document_ids:
        prompt = f"""
You are DocTalk, an AI document intelligence assistant.

The user has not uploaded any documents in this conversation.

If the user asks a question that would require document context,
politely tell them:

"No documents have been uploaded in this conversation yet.
Please upload a document first, and I'll be happy to help
you analyze it."

Otherwise, respond helpfully as a general AI assistant.

User message:
{message}
"""

        try:
            response = get_openai_client().responses.create(
                input=prompt,
                extra_body={
                    "agent_reference": {
                        "name": AGENT_NAME,
                        "version": AGENT_VERSION,
                        "type": "agent_reference"
                    }
                },
            )

            response_text = response.output_text
            conv.messages.append(Message(
                role="assistant",
                content=response_text,
                timestamp=datetime.utcnow().isoformat()
            ))
            chat_store.save_conversation(conv)

            return {
                "response": response.output_text,
                "documents": [],
                "document_ids": [],
                "conversation_id": conversation_id,
            }

        except Exception as error:
            print(f"\n========== CHAT ERROR ==========\n{repr(error)}\n================================\n")
            raise HTTPException(
                status_code=500,
                detail=f"Chat request failed: {str(error)}"
            )

    # ---------------------------------------------------------
    # CASE 2: Documents in session → use existing RAG pipeline
    #         with Azure AI Search document_id filtering
    #
    # The document_ids are passed to generate_rag_answer(),
    # which passes them to search_documents(), which applies
    # an OData filter so Azure AI Search only returns chunks
    # from the specified documents.
    # ---------------------------------------------------------

    try:
        result = generate_rag_answer(
            question=message,
            top_k=5,
            document_ids=document_ids,
        )

        response_text = result.get("answer", "No response generated.")
        
        conv.messages.append(Message(
            role="assistant",
            content=response_text,
            timestamp=datetime.utcnow().isoformat()
        ))
        chat_store.save_conversation(conv)

        return {
            "response": response_text,
            "sources": result.get("sources", []),
            "document_ids": document_ids,
            "conversation_id": conversation_id,
        }

    except Exception as error:
        print(f"\n========== CHAT ERROR ==========\n{repr(error)}\n================================\n")
        raise HTTPException(
            status_code=500,
            detail=f"Chat request failed: {str(error)}"
        )