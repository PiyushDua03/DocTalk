from typing import Optional
from app.embedding_service import generate_embedding
from app.search_service import hybrid_search

def search_documents(
    query: str,
    top_k: int = 5,
    document_ids: Optional[list[str]] = None,
) -> list[dict]:
    """
    Run hybrid search using keyword + vector search.

    SESSION-SCOPE FILTERING:
        When document_ids is provided, an OData filter restricts
        Azure AI Search to ONLY return chunks belonging to those
        document IDs.
    """

    if not query.strip():
        raise ValueError("Search query cannot be empty.")

    # Generate an embedding for the user's question.
    query_vector = generate_embedding(query)

    # Hybrid search: keyword + vector search via search_service
    results = hybrid_search(
        query=query,
        query_vector=query_vector,
        top=top_k,
        document_ids=document_ids
    )

    retrieved_chunks = []

    for result in results:
        retrieved_chunks.append(
            {
                "chunk_id": result["chunk_id"],
                "document_id": result["document_id"],
                "document_name": result["document_name"],
                "page_number": result["page_number"],
                "content": result["content"],
                "score": result.get("@search.score", 0),
            }
        )

    return retrieved_chunks