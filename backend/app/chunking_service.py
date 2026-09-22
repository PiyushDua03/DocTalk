CHUNK_SIZE = 1000
CHUNK_OVERLAP = 200


def chunk_text(
    text: str,
    document_id: str,
    document_name: str,
    page_number: int,
) -> list[dict]:
    """
    Split document text into overlapping chunks.

    Each chunk keeps the document and page metadata so
    Azure AI Search can later return the source information.
    """

    if not text.strip():
        return []

    chunks = []

    start = 0
    chunk_number = 0

    while start < len(text):
        end = min(start + CHUNK_SIZE, len(text))

        chunk_content = text[start:end].strip()

        if chunk_content:
            chunks.append(
                {
                    "chunk_id": (
                        f"{document_id}-page-{page_number}"
                        f"-chunk-{chunk_number}"
                    ),
                    "document_id": document_id,
                    "document_name": document_name,
                    "page_number": page_number,
                    "content": chunk_content,
                }
            )

        chunk_number += 1

        if end >= len(text):
            break

        start = end - CHUNK_OVERLAP

    return chunks