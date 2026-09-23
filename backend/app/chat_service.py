import os
from azure.identity import DefaultAzureCredential, get_bearer_token_provider
from openai import OpenAI

FOUNDRY_ACCOUNT = "doctalk-korea"
CHAT_MODEL = "gpt-5-mini"

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

def get_openai_client() -> OpenAI:
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

def generate_chat_completion(prompt: str, system_msg: str = None) -> str:
    """
    Sends a prompt to GPT-5-mini and returns the generated text.
    Optionally accepts a system message for specialized behavior.
    """
    messages = []
    if system_msg:
        messages.append({"role": "system", "content": system_msg})
    messages.append({"role": "user", "content": prompt})

    response = get_openai_client().chat.completions.create(
        model=CHAT_MODEL,
        messages=messages,
    )
    return response.choices[0].message.content
