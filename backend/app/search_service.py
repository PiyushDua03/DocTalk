import os

from azure.identity import DefaultAzureCredential
from azure.search.documents import SearchClient
from azure.search.documents.indexes import SearchIndexClient
from azure.search.documents.indexes.models import (
    SearchField,
    SearchFieldDataType,
    SearchIndex,
    SearchableField,
    SimpleField,
    VectorSearch,
    VectorSearchProfile,
    HnswAlgorithmConfiguration,
)
from azure.search.documents.models import VectorizedQuery

SEARCH_ENDPOINT = os.getenv(
    "AZURE_SEARCH_ENDPOINT",
    "https://doctalk-search-rag.search.windows.net",
)

INDEX_NAME = os.getenv(
    "AZURE_SEARCH_INDEX_NAME",
    "doctalk-documents",
)

EMBEDDING_DIMENSIONS = 1536

def get_credential():
    return DefaultAzureCredential()

def get_index_client() -> SearchIndexClient:
    return SearchIndexClient(
        endpoint=SEARCH_ENDPOINT,
        credential=get_credential(),
    )

def get_search_client() -> SearchClient:
    return SearchClient(
        endpoint=SEARCH_ENDPOINT,
        index_name=INDEX_NAME,
        credential=get_credential(),
    )

def create_search_index() -> SearchIndex:
    index_client = get_index_client()

    fields = [
        SimpleField(
            name="chunk_id",
            type=SearchFieldDataType.String,
            key=True,
            filterable=True,
        ),
        SimpleField(
            name="document_id",
            type=SearchFieldDataType.String,
            filterable=True,
        ),
        SearchableField(
            name="document_name",
            type=SearchFieldDataType.String,
            filterable=True,
        ),
        SimpleField(
            name="page_number",
            type=SearchFieldDataType.Int32,
            filterable=True,
            sortable=True,
        ),
        SearchableField(
            name="content",
            type=SearchFieldDataType.String,
        ),
        SearchField(
            name="content_vector",
            type=SearchFieldDataType.Collection(SearchFieldDataType.Single),
            searchable=True,
            vector_search_dimensions=EMBEDDING_DIMENSIONS,
            vector_search_profile_name="doc-vector-profile",
        ),
    ]

    vector_search = VectorSearch(
        algorithms=[HnswAlgorithmConfiguration(name="doc-hnsw")],
        profiles=[VectorSearchProfile(name="doc-vector-profile", algorithm_configuration_name="doc-hnsw")],
    )

    index = SearchIndex(
        name=INDEX_NAME,
        fields=fields,
        vector_search=vector_search,
    )

    return index_client.create_or_update_index(index)

def keyword_search(query: str, top: int = 5, document_ids: list[str] = None):
    client = get_search_client()
    filter_expr = f"search.in(document_id, '{','.join(document_ids)}')" if document_ids else None
    
    results = client.search(
        search_text=query,
        select=["chunk_id", "document_id", "document_name", "page_number", "content"],
        filter=filter_expr,
        top=top
    )
    return list(results)

def vector_search(query_vector: list[float], top: int = 5, document_ids: list[str] = None):
    client = get_search_client()
    filter_expr = f"search.in(document_id, '{','.join(document_ids)}')" if document_ids else None
    
    vector_query = VectorizedQuery(
        vector=query_vector,
        k_nearest_neighbors=top,
        fields="content_vector"
    )
    
    results = client.search(
        search_text=None,
        vector_queries=[vector_query],
        select=["chunk_id", "document_id", "document_name", "page_number", "content"],
        filter=filter_expr,
        top=top
    )
    return list(results)

def hybrid_search(query: str, query_vector: list[float], top: int = 5, document_ids: list[str] = None):
    client = get_search_client()
    filter_expr = f"search.in(document_id, '{','.join(document_ids)}')" if document_ids else None
    
    vector_query = VectorizedQuery(
        vector=query_vector,
        k_nearest_neighbors=top,
        fields="content_vector"
    )
    
    results = client.search(
        search_text=query,
        vector_queries=[vector_query],
        select=["chunk_id", "document_id", "document_name", "page_number", "content"],
        filter=filter_expr,
        top=top
    )
    return list(results)