from azure.identity import DefaultAzureCredential, get_bearer_token_provider
from openai import OpenAI


FOUNDRY_ACCOUNT = "doctalk-korea"

EMBEDDING_MODEL = "text-embedding-3-small"
EMBEDDING_DIMENSIONS = 1536


# Cache the token provider (it handles refresh internally),
# but always create a fresh OpenAI client so the Authorization
# header carries a current token.
_token_provider = None

def _get_token_provider():
    global _token_provider
    if _token_provider is None:
        _token_provider = get_bearer_token_provider(
            DefaultAzureCredential(),
            "https://cognitiveservices.azure.com/.default",
        )
    return _token_provider

def get_openai_client():
    """
    Return an OpenAI client with a FRESH bearer token every time.
    Azure AD tokens expire after ~1 hour; creating a new client
    on each call guarantees the Authorization header is never stale.
    """
    token = _get_token_provider()()
    return OpenAI(
        base_url=f"https://{FOUNDRY_ACCOUNT}.services.ai.azure.com/openai/v1",
        api_key="placeholder",
        default_headers={
            "Authorization": f"Bearer {token}"
        },
    )


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