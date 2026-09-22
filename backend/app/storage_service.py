"""
DocTalk — Azure Blob Storage service.

Handles uploading, deleting, and listing documents in Azure Blob Storage.
Uses connection string for authentication.
"""

import os
import logging

from azure.storage.blob import BlobServiceClient
from dotenv import load_dotenv


load_dotenv()

logger = logging.getLogger(__name__)


# Configuration from environment
STORAGE_ACCOUNT_URL = os.getenv("AZURE_STORAGE_ACCOUNT_URL")
STORAGE_CONTAINER = os.getenv("AZURE_STORAGE_CONTAINER", "documents")
CONNECTION_STRING = os.getenv("AZURE_STORAGE_CONNECTION_STRING")


def _get_blob_service_client() -> BlobServiceClient:
    """Create a BlobServiceClient using Connection String."""
    if not CONNECTION_STRING:
        raise RuntimeError(
            "AZURE_STORAGE_CONNECTION_STRING is not set. "
            "Check your .env file or environment variables."
        )

    return BlobServiceClient.from_connection_string(CONNECTION_STRING)


def _get_container_client():
    """Get the container client for the documents container."""
    service_client = _get_blob_service_client()
    return service_client.get_container_client(STORAGE_CONTAINER)


async def upload_blob(document_id: str, filename: str, file_bytes: bytes) -> str:
    """
    Upload a file to Azure Blob Storage.

    Blob path: documents/<document_id>/<filename>

    Returns the blob path.
    """
    blob_path = f"{document_id}/{filename}"

    try:
        container_client = _get_container_client()
        blob_client = container_client.get_blob_client(blob_path)

        blob_client.upload_blob(file_bytes, overwrite=True)

        logger.info(f"Uploaded blob: {blob_path}")
        return blob_path

    except Exception as error:
        logger.error(f"Failed to upload blob {blob_path}: {error}")
        raise


async def delete_blob(blob_path: str) -> bool:
    """
    Delete a blob from Azure Blob Storage.

    Returns True if deleted, False if not found.
    """
    try:
        container_client = _get_container_client()
        blob_client = container_client.get_blob_client(blob_path)

        blob_client.delete_blob()

        logger.info(f"Deleted blob: {blob_path}")
        return True

    except Exception as error:
        error_code = getattr(error, "error_code", "")

        if error_code == "BlobNotFound":
            logger.warning(f"Blob not found: {blob_path}")
            return False

        logger.error(f"Failed to delete blob {blob_path}: {error}")
        raise


async def blob_exists(blob_path: str) -> bool:
    """Check if a blob exists in storage."""
    try:
        container_client = _get_container_client()
        blob_client = container_client.get_blob_client(blob_path)
        blob_client.get_blob_properties()
        return True

    except Exception:
        return False
