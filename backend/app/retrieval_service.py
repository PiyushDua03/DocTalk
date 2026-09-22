import os

from azure.identity import InteractiveBrowserCredential
from azure.search.documents import SearchClient
from azure.search.documents.models import VectorizedQuery

from app.embedding_service import generate_embedding


SEARCH_ENDPOINT = os.getenv(
    "AZURE_SEARCH_ENDPOINT",
    "https://doctalk-search.search.windows.net",
)

INDEX_NAME = os.getenv(
    "AZURE_SEARCH_INDEX_NAME",
    "doctalk-documents",
)


def get_search_client() -> SearchClient:
    """Create an Azure AI Search client."""

    return SearchClient(
        endpoint=SEARCH_ENDPOINT,
        index_name=INDEX_NAME,
        credential=InteractiveBrowserCredential(),
    )


from typing import Optional

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
        document IDs. This is how session isolation works — the
        filter is applied at the search engine level, not after
        retrieval.

        When document_ids is None, no filter is applied (used by
        the /search and /rag/chat endpoints for global search).
    """

    if not query.strip():
        raise ValueError("Search query cannot be empty.")

    search_client = get_search_client()

    # Generate an embedding for the user's question.
    query_vector = generate_embedding(query)

    # Search the content_vector field.
    vector_query = VectorizedQuery(
        vector=query_vector,
        k_nearest_neighbors=top_k,
        fields="content_vector",
        exhaustive=True,
    )

    # Build OData filter for session-scoped document restriction.
    # The document_id field is already filterable=True in the index
    # schema (see search_service.py).
    odata_filter = None

    if document_ids:
        # OData filter syntax for Azure AI Search:
        # document_id eq 'id1' or document_id eq 'id2'
        filter_clauses = [
            f"document_id eq '{doc_id}'"
            for doc_id in document_ids
        ]
        odata_filter = " or ".join(filter_clauses)

    # Hybrid search: keyword + vector search.
    # When odata_filter is set, only chunks from the specified
    # documents are searched — no cross-session leakage.
    results = search_client.search(
        search_text=query,
        vector_queries=[vector_query],
        filter=odata_filter,
        select=[
            "chunk_id",
            "document_id",
            "document_name",
            "page_number",
            "content",
        ],
        top=top_k,
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
                "score": result["@search.score"],
            }
        )

    return retrieved_chunks