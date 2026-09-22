import os
import time
import requests

BASE_URL = "http://127.0.0.1:8000"

def run_tests():
    print("========================================")
    print("Starting Acceptance Tests")
    print("========================================")

    # Note: Make sure the server is running on port 8000
    
    # ---------------------------------------------------------
    # TEST 1 - INDEX TWO DOCUMENTS
    # ---------------------------------------------------------
    print("\n[TEST 1] Indexing Document A...")
    with open("doc_a.txt", "w") as f:
        f.write("Document A. The total revenue for the year 2023 was $1.5 million. The main focus is AI adoption.")
    
    with open("doc_a.txt", "rb") as f:
        resp = requests.post(f"{BASE_URL}/upload", files={"file": f})
    
    if resp.status_code != 200:
        print("Upload A failed:", resp.text)
        return
        
    doc_a_id = resp.json()["document_id"]
    
    # Index Document A
    resp = requests.post(f"{BASE_URL}/documents/{doc_a_id}/index")
    print("Index A response:", resp.json())
    
    print("\n[TEST 1] Indexing Document B...")
    with open("doc_b.txt", "w") as f:
        f.write("Document B. The total revenue for the year 2023 was $800,000. The main focus is cloud infrastructure.")
        
    with open("doc_b.txt", "rb") as f:
        resp = requests.post(f"{BASE_URL}/upload", files={"file": f})
        
    doc_b_id = resp.json()["document_id"]
    
    # Index Document B
    resp = requests.post(f"{BASE_URL}/documents/{doc_b_id}/index")
    print("Index B response:", resp.json())
    
    # Wait for Azure AI Search to index
    time.sleep(3)
    
    # ---------------------------------------------------------
    # TEST 7 - SEARCH MODES
    # ---------------------------------------------------------
    print("\n[TEST 7] Testing Search Modes (Keyword, Vector, Hybrid)...")
    modes = ["keyword", "vector", "hybrid"]
    for mode in modes:
        resp = requests.post(f"{BASE_URL}/search", json={
            "query": "revenue",
            "mode": mode,
            "top_k": 2
        })
        print(f"Mode: {mode}, Results Count: {len(resp.json().get('results', []))}")

    # ---------------------------------------------------------
    # TEST 2 - QUESTION ABOUT DOCUMENT A (Session Filtered)
    # ---------------------------------------------------------
    print("\n[TEST 2] Question isolated to Document A...")
    resp = requests.post(f"{BASE_URL}/chat", json={
        "message": "What is the revenue?",
        "document_ids": [doc_a_id]
    })
    res_json = resp.json()
    print("Answer:", res_json.get("response"))
    print("Sources:", [s["document_name"] for s in res_json.get("sources", [])])
    
    # ---------------------------------------------------------
    # TEST 3 - COMPARISON BETWEEN A AND B
    # ---------------------------------------------------------
    print("\n[TEST 3] Comparison between A and B...")
    resp = requests.post(f"{BASE_URL}/chat", json={
        "message": "Compare the revenue and focus between the two documents.",
        "document_ids": [doc_a_id, doc_b_id]
    })
    res_json = resp.json()
    print("Answer:", res_json.get("response"))
    print("Sources:", list(set([s["document_name"] for s in res_json.get("sources", [])])))
    
    # ---------------------------------------------------------
    # TEST 6 - UNSUPPORTED QUESTION
    # ---------------------------------------------------------
    print("\n[TEST 6] Unsupported Question...")
    resp = requests.post(f"{BASE_URL}/chat", json={
        "message": "What is the capital of France?",
        "document_ids": [doc_a_id, doc_b_id]
    })
    print("Answer:", resp.json().get("response"))
    
    # ---------------------------------------------------------
    # TEST 4 & 5 - Verified implicitly via above results
    # ---------------------------------------------------------
    print("\nTests complete. Note: Test 4 (Retrieval instead of full doc) and Test 5 (Source info) are verified if the above sources list correctly isolates the chunks.")

if __name__ == "__main__":
    run_tests()
