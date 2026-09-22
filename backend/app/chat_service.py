import os
from azure.identity import DefaultAzureCredential, get_bearer_token_provider
from openai import OpenAI

FOUNDRY_ACCOUNT = "doctalk-korea"
CHAT_MODEL = "gpt-5-mini"

_token_provider = None
_openai_client = None

def get_openai_client() -> OpenAI:
    global _token_provider, _openai_client
    if _openai_client is None:
        _token_provider = get_bearer_token_provider(
            DefaultAzureCredential(),
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

def generate_chat_completion(prompt: str) -> str:
    """
    Sends a prompt to GPT-5-mini and returns the generated text.
    """
    response = get_openai_client().chat.completions.create(
        model=CHAT_MODEL,
        messages=[
            {
                "role": "user",
                "content": prompt,
            }
        ],
    )
    return response.choices[0].message.content
