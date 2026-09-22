import os

from azure.core.credentials import AzureKeyCredential
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


SEARCH_ENDPOINT = os.getenv(
    "AZURE_SEARCH_ENDPOINT",
    "https://doctalk-search.search.windows.net",
)

SEARCH_API_KEY = os.getenv("AZURE_SEARCH_API_KEY")

INDEX_NAME = os.getenv(
    "AZURE_SEARCH_INDEX_NAME",
    "doctalk-documents",
)

EMBEDDING_DIMENSIONS = 1536


def get_index_client() -> SearchIndexClient:
    if not SEARCH_API_KEY:
        raise RuntimeError(
            "AZURE_SEARCH_API_KEY environment variable is not set."
        )

    credential = AzureKeyCredential(SEARCH_API_KEY)

    return SearchIndexClient(
        endpoint=SEARCH_ENDPOINT,
        credential=credential,
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
            type=SearchFieldDataType.Collection(
                SearchFieldDataType.Single
            ),
            searchable=True,
            vector_search_dimensions=EMBEDDING_DIMENSIONS,
            vector_search_profile_name="doc-vector-profile",
        ),
    ]

    vector_search = VectorSearch(
        algorithms=[
            HnswAlgorithmConfiguration(
                name="doc-hnsw"
            )
        ],
        profiles=[
            VectorSearchProfile(
                name="doc-vector-profile",
                algorithm_configuration_name="doc-hnsw",
            )
        ],
    )

    index = SearchIndex(
        name=INDEX_NAME,
        fields=fields,
        vector_search=vector_search,
    )

    return index_client.create_or_update_index(index)