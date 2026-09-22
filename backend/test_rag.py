from app.rag_service import generate_rag_answer


result = generate_rag_answer(
    "What is DocTalk?"
)

print("\nANSWER:")
print(result["answer"])

print("\nSOURCES:")

for source in result["sources"]:
    print(
        f"- {source['document_name']} "
        f"| page {source['page_number']} "
        f"| chunk {source['chunk_id']}"
    )