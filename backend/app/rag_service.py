from app.retrieval_service import search_documents
from app.chat_service import generate_chat_completion

from typing import Optional

def generate_rag_answer(
    question: str,
    top_k: int = 5,
    document_ids: Optional[list[str]] = None,
) -> dict:
    """
    Retrieve relevant document chunks and generate an
    answer using GPT-5-mini.

    When document_ids is provided, retrieval is restricted
    to only those documents (session-scoped filtering).
    """

    if not question.strip():
        raise ValueError("Question cannot be empty.")

    # Retrieve relevant chunks from Azure AI Search.
    retrieved_chunks = search_documents(
        question,
        top_k=top_k,
        document_ids=document_ids,
    )

    # If nothing relevant was retrieved, don't ask the model
    # to invent an answer.
    if not retrieved_chunks:
        return {
            "answer": (
                "I could not find that information "
                "in the uploaded documents."
            ),
            "sources": [],
        }

    # Build the context that will be given to the model.
    context_parts = []

    for chunk in retrieved_chunks:
        context_parts.append(
            f"""
Document: {chunk['document_name']}
Page: {chunk['page_number']}

Content:
{chunk['content']}
"""
        )

    context = "\n---\n".join(context_parts)

    prompt = f"""
You are DocTalk, an AI document intelligence assistant.

Answer the user's question using ONLY the retrieved
document context below.

If the answer is not supported by the context, say:

"I could not find that information in the uploaded documents."

Do not invent facts or information.

Retrieved document context:
============================
{context}
============================

User question:
{question}
"""

    answer = generate_chat_completion(prompt)

    sources = [
        {
            "document_name": chunk["document_name"],
            "page_number": chunk["page_number"],
            "chunk_id": chunk["chunk_id"],
        }
        for chunk in retrieved_chunks
    ]

    return {
        "answer": answer,
        "sources": sources,
    }