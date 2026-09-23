"""
DocTalk — Document API routes.

Implements the document ingestion and management endpoints:
- POST   /documents/upload    (multi-file upload)
- GET    /documents           (list all documents)
- GET    /documents/{id}      (document details)
- DELETE /documents/{id}      (delete document)
"""

import logging
import uuid
import mimetypes

from fastapi import APIRouter, UploadFile, File, HTTPException

from app.document_models import (
    DocumentMetadata,
    DocumentSummary,
    UploadResult,
    UploadResponse,
)
from app import storage_service
from app import document_service
from app import metadata_store


logger = logging.getLogger(__name__)

router = APIRouter(prefix="/documents", tags=["Documents"])


# Supported file extensions
ALLOWED_EXTENSIONS = {"pdf", "docx", "txt"}

# Extension to MIME type mapping
MIME_TYPES = {
    "pdf": "application/pdf",
    "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "txt": "text/plain",
}


def _get_extension(filename: str) -> str:
    """Extract lowercase file extension from filename."""
    if "." not in filename:
        return ""
    return filename.rsplit(".", 1)[-1].lower()


@router.post("/upload", response_model=UploadResponse)
async def upload_documents(files: list[UploadFile] = File(...)):
    """
    Upload one or multiple documents.

    Supported file types: PDF, DOCX, TXT.

    Each file is:
    1. Validated (extension check)
    2. Uploaded to Azure Blob Storage
    3. Processed for text extraction
    4. Metadata stored persistently

    Individual file failures do not crash the entire request.
    """
    if not files:
        raise HTTPException(
            status_code=400,
            detail="No files provided.",
        )

    results = []

    for file in files:
        filename = file.filename or "unknown"
        extension = _get_extension(filename)

        # Validate extension
        if extension not in ALLOWED_EXTENSIONS:
            results.append(UploadResult(
                filename=filename,
                status="failed",
                error=f"Unsupported file type: .{extension}. "
                      f"Only PDF, DOCX, and TXT are supported.",
            ))
            continue

        try:
            # Read file bytes
            file_bytes = await file.read()

            if not file_bytes:
                results.append(UploadResult(
                    filename=filename,
                    status="failed",
                    error="File is empty.",
                ))
                continue

            # Generate unique document ID
            document_id = str(uuid.uuid4())
            content_type = MIME_TYPES.get(extension, "application/octet-stream")

            # Upload to Blob Storage
            blob_path = await storage_service.upload_blob(
                document_id=document_id,
                filename=filename,
                file_bytes=file_bytes,
            )

            # Extract text
            extraction = await document_service.extract_text(
                file_bytes=file_bytes,
                extension=extension,
            )

            text = extraction["text"]
            pages = extraction["pages"]
            page_count = extraction["page_count"]

            if not text.strip():
                # Document uploaded to blob but no text extracted
                doc = DocumentMetadata(
                    document_id=document_id,
                    filename=filename,
                    content_type=content_type,
                    blob_path=blob_path,
                    status="failed",
                    page_count=page_count,
                    character_count=0,
                    pages=pages,
                    error="The document appears to be empty or "
                          "text could not be extracted.",
                )
                metadata_store.save_document(doc)

                results.append(UploadResult(
                    document_id=document_id,
                    filename=filename,
                    status="failed",
                    error=doc.error,
                ))
                continue

            # Success — save metadata
            doc = DocumentMetadata(
                document_id=document_id,
                filename=filename,
                content_type=content_type,
                blob_path=blob_path,
                status="processed",
                page_count=page_count,
                character_count=len(text),
                pages=pages,
            )
            metadata_store.save_document(doc)

            # -----------------------------------------------
            # Auto-index into Azure AI Search for RAG
            # -----------------------------------------------
            try:
                from app.chunking_service import chunk_text
                from app.indexing_service import index_chunks

                all_chunks = []
                if pages:
                    for page_info in pages:
                        page_chunks = chunk_text(
                            text=page_info.text,
                            document_id=document_id,
                            document_name=filename,
                            page_number=page_info.page_number,
                        )
                        all_chunks.extend(page_chunks)
                else:
                    all_chunks = chunk_text(
                        text=text,
                        document_id=document_id,
                        document_name=filename,
                        page_number=1,
                    )

                if all_chunks:
                    index_result = index_chunks(all_chunks)
                    logger.info(
                        f"Auto-indexed {filename}: "
                        f"{index_result.get('uploaded', 0)} chunks uploaded"
                    )
            except Exception as index_err:
                logger.warning(
                    f"Auto-indexing failed for {filename}: {index_err}. "
                    f"Document uploaded but not searchable via RAG."
                )

            results.append(UploadResult(
                document_id=document_id,
                filename=filename,
                status="processed",
            ))

            logger.info(
                f"Processed document: {filename} → {document_id} "
                f"({len(text)} chars, {page_count or 'N/A'} pages)"
            )

        except Exception as error:
            logger.error(f"Failed to process {filename}: {error}")

            results.append(UploadResult(
                filename=filename,
                status="failed",
                error=str(error),
            ))

    return UploadResponse(documents=results)


@router.get("", response_model=list[DocumentSummary])
async def list_documents():
    """
    List all stored documents.

    Returns lightweight summaries (no full text bodies).
    """
    all_docs = metadata_store.get_all_documents()

    return [
        DocumentSummary(
            document_id=doc.document_id,
            filename=doc.filename,
            content_type=doc.content_type,
            status=doc.status,
            page_count=doc.page_count,
            character_count=doc.character_count,
            uploaded_at=doc.uploaded_at,
        )
        for doc in all_docs
    ]


@router.get("/{document_id}", response_model=DocumentMetadata)
async def get_document(document_id: str):
    """
    Get detailed metadata for a specific document.

    Includes extracted page information and text.
    """
    doc = metadata_store.get_document(document_id)

    if doc is None:
        raise HTTPException(
            status_code=404,
            detail=f"Document not found: {document_id}",
        )

    return doc


@router.delete("/{document_id}")
async def delete_document(document_id: str):
    """
    Delete a document.

    Removes both the blob from Azure Storage and the metadata.
    """
    doc = metadata_store.get_document(document_id)

    if doc is None:
        raise HTTPException(
            status_code=404,
            detail=f"Document not found: {document_id}",
        )

    # Delete blob from Azure Storage
    try:
        await storage_service.delete_blob(doc.blob_path)
    except Exception as error:
        logger.error(
            f"Failed to delete blob for {document_id}: {error}"
        )
        # Continue with metadata deletion even if blob delete fails

    # Delete associated chunks from Azure AI Search
    try:
        from app.search_service import delete_document_chunks
        deleted_chunks = delete_document_chunks(document_id)
        logger.info(
            f"Deleted {deleted_chunks} Search chunks for {document_id}"
        )
    except Exception as error:
        logger.error(
            f"Failed to delete Search chunks for {document_id}: {error}"
        )
        # Continue with metadata deletion even if Search cleanup fails

    # Delete metadata
    metadata_store.delete_document(document_id)

    return {
        "message": "Document deleted successfully.",
        "document_id": document_id,
        "filename": doc.filename,
    }
