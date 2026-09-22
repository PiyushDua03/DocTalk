# DocTalk

DocTalk is an AI-powered document intelligence assistant. Users can upload PDF, DOCX, or TXT documents and ask questions about the uploaded document through a chatbot interface.

## Features

- Upload PDF documents
- Upload DOCX documents
- Upload TXT documents
- Extract text from uploaded documents
- Ask questions about the uploaded document
- Receive AI-generated responses
- Web-based frontend
- FastAPI backend
- Azure AI Foundry agent integration

## Technology Stack

### Frontend

- HTML
- CSS
- JavaScript

### Backend

- Python
- FastAPI
- Uvicorn

### Document Processing

- pypdf
- python-docx

### AI and Cloud

- Azure AI Foundry
- GPT-5-mini model
- Azure AI Projects SDK
- Azure Identity

## Project Structure

```text
DocTalk/
├── backend/
│   ├── app/
│   │   └── main.py
│   ├── requirements.txt
│   └── .gitignore
├── frontend/
│   ├── index.html
│   ├── style.css
│   └── script.js
├── .gitignore
└── README.md
```

## Requirements

Install the following before running the project:

- Python 3.10 or newer
- Git
- Azure CLI, or access to the Azure login browser flow
- An Azure account with access to the DocTalk Azure AI Foundry project

## Installation

Clone the repository:

```powershell
git clone YOUR_GITHUB_REPOSITORY_URL
```

Move into the project folder:

```powershell
cd DocTalk
```

Create a virtual environment:

```powershell
python -m venv .venv
```

Activate the virtual environment:

```powershell
.\.venv\Scripts\Activate.ps1
```

Install backend dependencies:

```powershell
cd backend
pip install -r requirements.txt
```

## Azure Login

The backend uses Azure authentication.

If Azure CLI is installed, run:

```powershell
az login
```

Sign in using the Azure account that has access to the DocTalk Azure AI Foundry project.

Alternatively, the application may open a browser login window automatically when the chat request is made.

## Run the Backend

Open PowerShell and run:

```powershell
cd C:\Users\YOUR_USERNAME\DocTalk\backend
python -m uvicorn app.main:app --reload
```

The backend will run at:

```text
http://127.0.0.1:8000
```

FastAPI documentation is available at:

```text
http://127.0.0.1:8000/docs
```

## Run the Frontend

Open a second PowerShell terminal.

Run:

```powershell
cd C:\Users\YOUR_USERNAME\DocTalk\frontend
python -m http.server 5500
```

Open the frontend in your browser:

```text
http://127.0.0.1:5500
```

## Usage

1. Start the backend.
2. Start the frontend.
3. Open `http://127.0.0.1:5500`.
4. Upload a PDF, DOCX, or TXT document.
5. Ask a question about the document.
6. Read the AI-generated response.

## Backend API Endpoints (Core AI)

### Check server status

```http
GET /
```

### Check uploaded document

```http
GET /document
```

### Upload a document (Legacy - single file)

```http
POST /upload
```

### Ask a question

```http
POST /chat?message=YOUR_QUESTION
```

## Backend API Endpoints (Document Ingestion & Storage)

### Upload Documents (Multi-file)

Uploads one or more files to Azure Blob Storage and extracts text using Azure AI Document Intelligence.

```http
POST /documents/upload
Content-Type: multipart/form-data
```

**Request:** Send files as `files` form field (multiple allowed).

**Supported file types:** PDF, DOCX, TXT

**Example response:**

```json
{
    "documents": [
        {
            "document_id": "550e8400-e29b-41d4-a716-446655440000",
            "filename": "report.pdf",
            "status": "processed",
            "error": null
        },
        {
            "document_id": null,
            "filename": "image.jpg",
            "status": "failed",
            "error": "Unsupported file type: .jpg. Only PDF, DOCX, and TXT are supported."
        }
    ]
}
```

### List All Documents

Returns lightweight summaries (no full text bodies).

```http
GET /documents
```

**Example response:**

```json
[
    {
        "document_id": "550e8400-e29b-41d4-a716-446655440000",
        "filename": "report.pdf",
        "content_type": "application/pdf",
        "status": "processed",
        "page_count": 12,
        "character_count": 22778,
        "uploaded_at": "2026-09-17T22:40:01.548538"
    }
]
```

### Get Document Details

Returns full metadata including extracted page-level content.

```http
GET /documents/{document_id}
```

**Example response:**

```json
{
    "document_id": "550e8400-e29b-41d4-a716-446655440000",
    "filename": "report.pdf",
    "content_type": "application/pdf",
    "blob_path": "550e8400-e29b-41d4-a716-446655440000/report.pdf",
    "status": "processed",
    "page_count": 12,
    "character_count": 22778,
    "pages": [
        {
            "page_number": 1,
            "text": "Text extracted from page 1..."
        }
    ],
    "error": null,
    "uploaded_at": "2026-09-17T22:40:01.548538"
}
```

### Delete Document

Removes the blob from Azure Storage and deletes metadata.

```http
DELETE /documents/{document_id}
```

Returns HTTP 404 if the document does not exist.

---

## Document Ingestion Module — Setup Guide

### Azure Resources Required

| Resource | Name | Purpose |
|----------|------|---------|
| Storage Account | `stdoctalkapp` | Persistent blob storage for uploaded documents |
| Blob Container | `documents` | Container holding all document blobs |
| Document Intelligence | `doctalk-docintell` | OCR and text extraction from PDFs |

### Environment Variables

Copy `.env.example` to `.env` and fill in your Azure values:

```bash
cp backend/.env.example backend/.env
```

| Variable | Description |
|----------|-------------|
| `AZURE_STORAGE_ACCOUNT_URL` | Storage account URL (e.g., `https://stdoctalkapp.blob.core.windows.net`) |
| `AZURE_STORAGE_CONTAINER` | Blob container name (default: `documents`) |
| `AZURE_STORAGE_CONNECTION_STRING` | Storage account connection string (from Azure Portal → Storage Account → Access keys) |
| `AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT` | Document Intelligence endpoint URL |
| `AZURE_DOCUMENT_INTELLIGENCE_KEY` | Document Intelligence API key (from Azure Portal → Resource → Keys and Endpoint) |

**Security:** Never commit `.env` to Git. It is excluded via `.gitignore`.

### Authentication

- **Blob Storage:** Uses connection string (from `.env`)
- **Document Intelligence:** Uses API key (from `.env`)
- **Azure AI Foundry (chat):** Uses `InteractiveBrowserCredential` (existing, unchanged)

### Backend Project Structure

```text
backend/
├── app/
│   ├── main.py               # FastAPI app, router registration, existing AI chat
│   ├── document_routes.py     # Document ingestion API routes
│   ├── document_service.py    # Text extraction (Document Intelligence + fallbacks)
│   ├── storage_service.py     # Azure Blob Storage operations
│   ├── metadata_store.py      # JSON-based persistent metadata storage
│   └── document_models.py     # Pydantic models and contracts
├── requirements.txt
├── .env                       # Local secrets (NOT committed)
└── .env.example               # Template with placeholder values
```

### Blob Storage Structure

```text
documents/                     # Azure Blob container
├── <document_id>/
│   └── <original_filename>    # e.g., report.pdf
├── <document_id>/
│   └── <original_filename>
```

### Team Contract (for Team Member 2 — RAG)

Documents are available via `GET /documents/{id}` in the following structure for downstream consumption:

```json
{
    "document_id": "unique-uuid",
    "document_name": "report.pdf",
    "page_number": 3,
    "content": "Text from this page..."
}
```

The `DocumentForRAG` Pydantic model in `document_models.py` provides this contract.

### Testing

Start the backend:

```bash
cd backend
pip install -r requirements.txt
python -m uvicorn app.main:app --reload
```

Open Swagger UI at `http://127.0.0.1:8000/docs` to test all endpoints interactively.

### Troubleshooting

| Issue | Solution |
|-------|----------|
| `AZURE_STORAGE_CONNECTION_STRING is not set` | Create `.env` from `.env.example` and fill in your Azure values |
| `Document Intelligence failed, falling back to pypdf` | Check `AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT` and `KEY` in `.env` |
| Upload returns 500 | Check Azure Portal → Storage Account → Access keys for correct connection string |
| PDF text is empty | The PDF may be scanned — Document Intelligence handles OCR automatically |

---

## Current Limitations

- Large documents may exceed the model context limit.
- The current version does not yet use a vector database or retrieval-augmented generation.
- Each team member needs access to the Azure AI Foundry project.

## Future Improvements

- Vector database integration (Azure AI Search)
- Retrieval-augmented generation
- Better chunking for large documents
- User authentication
- Chat history
- Image generation support
- Deployment to Azure