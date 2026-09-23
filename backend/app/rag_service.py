from app.retrieval_service import search_documents
from app.chat_service import generate_chat_completion

import re
from typing import Optional

CHART_KEYWORDS = re.compile(
    r'\b(chart|graph|diagram|visual|visuali[sz]e|plot|radar|'
    r'bar chart|pie chart|line chart|comparison|compare|'
    r'flow diagram|timeline|infographic|image chart)\b',
    re.IGNORECASE,
)

CHART_SYSTEM_PROMPT = """You are DocTalk, an AI document intelligence assistant that can generate visual charts.

When the user asks for charts, graphs, visuals, diagrams, or comparisons, you MUST respond with JSON chart data wrapped in ```json code fences. The frontend will render these as actual visual charts.

Available chart types and their JSON formats:

1. Bar chart:
```json
{"type":"bar","title":"Chart Title","labels":["Label1","Label2","Label3"],"values":[10,20,30]}
```

2. Pie chart:
```json
{"type":"pie","title":"Distribution","labels":["A","B","C"],"values":[40,35,25]}
```

3. Line chart:
```json
{"type":"line","title":"Trend","labels":["Jan","Feb","Mar"],"values":[10,25,18]}
```

4. Radar chart (for multi-attribute comparisons):
```json
{"type":"radar","title":"Edge vs Cloud","labels":["Latency","Bandwidth","Privacy","Scalability","Reliability"],"datasets":[{"label":"Edge Computing","values":[9,8,9,7,8],"max":10},{"label":"Cloud Computing","values":[4,3,5,9,6],"max":10}]}
```

5. Comparison cards:
```json
{"type":"comparison","title":"Edge vs Cloud","cards":[{"title":"Edge Computing","bullets":["Ultra-low latency (1-10ms)","Low bandwidth","High privacy"]},{"title":"Cloud Computing","bullets":["High latency (50-250ms)","High bandwidth","Moderate privacy"]}]}
```

6. Table:
```json
{"type":"table","title":"Comparison Table","headers":["Attribute","Edge","Cloud"],"rows":[["Latency","1-10ms","50-250ms"],["Privacy","High","Moderate"]]}
```

7. Process/Flow:
```json
{"type":"process","title":"Data Flow","steps":["IoT Devices","Edge Server (Local ML)","Core Network","Data Center"]}
```

8. Timeline:
```json
{"type":"timeline","title":"Timeline","events":[{"date":"Phase 1","description":"Description here"}]}
```

CRITICAL RULES:
- You MUST include ```json code fences around each chart JSON block.
- You can include MULTIPLE chart blocks in one response.
- Add brief text explanations between charts.
- Use REAL data from the document context, not placeholder data.
- Convert qualitative values to numeric scores (1-10) for bar/radar charts.
- DO NOT just describe charts in text. You MUST include the JSON data.
"""

NORMAL_SYSTEM_PROMPT = """You are DocTalk, an AI document intelligence assistant.
Answer the user's question using ONLY the retrieved document context.
If the answer is not supported by the context, say:
"I could not find that information in the uploaded documents."
Do not invent facts or information."""


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

    # ── Multi-document comparison: retrieve PER DOCUMENT ──
    # When comparing 2+ documents a single hybrid search often
    # returns chunks from only the most relevant document,
    # starving the others.  Fix: search each document separately
    # so every document is guaranteed to contribute context.
    if document_ids and len(document_ids) >= 2:
        per_doc_k = max(top_k, 5)          # at least 5 chunks each
        retrieved_chunks = []
        for did in document_ids:
            doc_chunks = search_documents(
                question,
                top_k=per_doc_k,
                document_ids=[did],
            )
            retrieved_chunks.extend(doc_chunks)
    else:
        # Single-document or no-filter retrieval
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
    # When comparing, group chunks by document so the model
    # clearly sees both documents' content.
    is_comparison = document_ids and len(document_ids) >= 2

    if is_comparison:
        from collections import defaultdict
        doc_groups = defaultdict(list)
        for chunk in retrieved_chunks:
            doc_groups[chunk['document_name']].append(chunk)

        context_parts = []
        for doc_name, chunks in doc_groups.items():
            doc_section = f"\n========== DOCUMENT: {doc_name} ==========\n"
            for chunk in chunks:
                doc_section += f"\n[Page {chunk['page_number']}]\n{chunk['content']}\n"
            context_parts.append(doc_section)
        context = "\n".join(context_parts)
    else:
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

    # Detect if the user wants charts/visuals
    is_chart_request = bool(CHART_KEYWORDS.search(question))

    prompt = f"""
Retrieved document context:
============================
{context}
============================

User question:
{question}
"""

    if is_chart_request:
        system_msg = CHART_SYSTEM_PROMPT
    elif is_comparison:
        system_msg = (
            "You are DocTalk, an AI document intelligence assistant.\n"
            "The user is comparing multiple documents. You MUST analyze content from "
            "EVERY document listed above. For each point of comparison, explicitly "
            "reference which document it comes from by name.\n"
            "Structure your response with clear sections: Similarities, Differences, "
            "and Summary.\n"
            "Do not invent facts. Use ONLY the retrieved context."
        )
    else:
        system_msg = NORMAL_SYSTEM_PROMPT
    answer = generate_chat_completion(prompt, system_msg=system_msg)

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