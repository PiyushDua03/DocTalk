import os

from azure.identity import InteractiveBrowserCredential
from azure.search.documents import SearchClient

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


def index_chunks(chunks: list[dict]) -> dict:
    """
    Generate embeddings for document chunks and upload them
    to Azure AI Search.
    """

    if not chunks:
        return {
            "uploaded": 0,
            "message": "No chunks provided.",
        }

    search_client = get_search_client()

    documents = []

    for chunk in chunks:
        content = chunk["content"]

        embedding = generate_embedding(content)

        document = {
            "chunk_id": chunk["chunk_id"],
            "document_id": chunk["document_id"],
            "document_name": chunk["document_name"],
            "page_number": chunk["page_number"],
            "content": content,
            "content_vector": embedding,
        }

        documents.append(document)

    results = search_client.upload_documents(documents=documents)

    successful = sum(
        1 for result in results if result.succeeded
    )

    failed = len(results) - successful

    return {
        "uploaded": successful,
        "failed": failed,
        "total": len(results),
    }