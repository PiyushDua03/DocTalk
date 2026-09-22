from app.retrieval_service import search_documents


results = search_documents("What is DocTalk?")

print("RESULT COUNT:", len(results))

for i, result in enumerate(results, start=1):
    print(
        f"{i}. "
        f"{result['document_name']} | "
        f"page {result['page_number']} | "
        f"score {result['score']:.4f} | "
        f"{result['content'][:100]}"
    )