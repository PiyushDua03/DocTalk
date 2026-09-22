from azure.identity import InteractiveBrowserCredential, get_bearer_token_provider
from openai import OpenAI


FOUNDRY_ACCOUNT = "doctalk-korea-ai"

EMBEDDING_MODEL = "text-embedding-3-small"
EMBEDDING_DIMENSIONS = 1536


# Deferred instantiation to prevent import-time crashes
_token_provider = None
_openai_client = None

def get_openai_client():
    global _token_provider, _openai_client
    if _openai_client is None:
        _token_provider = get_bearer_token_provider(
            InteractiveBrowserCredential(),
            "https://cognitiveservices.azure.com/.default",
        )
        _openai_client = OpenAI(
            base_url=f"https://{FOUNDRY_ACCOUNT}.services.ai.azure.com/openai/v1",
            api_key="placeholder",
            default_headers={
                "Authorization": f"Bearer {_token_provider()}"
            },
        )
    return _openai_client


def generate_embedding(text: str) -> list[float]:
    """
    Generate a vector embedding for the supplied text.
    """

    if not text.strip():
        raise ValueError("Text cannot be empty.")

    response = get_openai_client().embeddings.create(
        input=text,
        model=EMBEDDING_MODEL,
        dimensions=EMBEDDING_DIMENSIONS,
    )

    embedding = response.data[0].embedding

    if len(embedding) != EMBEDDING_DIMENSIONS:
        raise ValueError(
            f"Expected {EMBEDDING_DIMENSIONS} dimensions, "
            f"but received {len(embedding)}."
        )

    return embedding