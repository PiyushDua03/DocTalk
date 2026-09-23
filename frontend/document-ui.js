/**
 * DocTalk — Document UI Manager
 *
 * Manages the persistent "My Documents" section,
 * document deletion, and refresh after upload.
 *
 * Depends on: script.js globals (API_URL, escapeHtml, etc.)
 */

/* =========================================================
   LOAD PERSISTENT DOCUMENTS FROM BACKEND
   ========================================================= */

async function loadMyDocuments() {
    try {
        var response = await fetch(API_URL + "/documents");
        if (!response.ok) return;

        var docs = await response.json();
        renderMyDocuments(docs);
    } catch (e) {
        console.error("Failed to load My Documents:", e);
    }
}


/* =========================================================
   RENDER MY DOCUMENTS LIST
   ========================================================= */

function renderMyDocuments(docs) {
    var container = document.getElementById("my-documents-list");
    if (!container) return;

    var countEl = document.getElementById("my-documents-count");

    if (!docs || docs.length === 0) {
        container.innerHTML = '<p class="empty-state">No documents in your library.</p>';
        if (countEl) countEl.textContent = "0 documents";
        return;
    }

    if (countEl) countEl.textContent = docs.length + " document" + (docs.length === 1 ? "" : "s");

    container.innerHTML = "";

    for (var i = 0; i < docs.length; i++) {
        var doc = docs[i];
        var card = document.createElement("div");
        card.className = "my-doc-card";

        // Checkbox for selection
        var label = document.createElement("label");
        label.className = "my-doc-label";

        var cb = document.createElement("input");
        cb.type = "checkbox";
        cb.dataset.docId = doc.document_id;
        if (selectedDocumentIds.has(doc.document_id)) {
            cb.checked = true;
        }

        cb.addEventListener("change", (function(docId, docData) {
            return function(e) {
                if (e.target.checked) {
                    selectedDocumentIds.add(docId);
                    // Add to uploadedDocuments if not already there
                    if (!uploadedDocuments.find(function(d) { return d.id === docId; })) {
                        uploadedDocuments.push({
                            id: docId,
                            document_id: docId,
                            filename: docData.filename,
                            page_count: docData.page_count,
                            characters: docData.character_count
                        });
                    }
                } else {
                    selectedDocumentIds.delete(docId);
                }
                updateCompareButton();
                renderDocuments();
            };
        })(doc.document_id, doc));

        var nameSpan = document.createElement("strong");
        nameSpan.textContent = doc.filename || "Unknown";

        label.appendChild(cb);
        label.appendChild(nameSpan);
        card.appendChild(label);

        // Meta info
        var meta = document.createElement("small");
        meta.className = "my-doc-meta";
        var parts = [];
        if (doc.file_type) parts.push(doc.file_type.toUpperCase());
        if (doc.page_count) parts.push(doc.page_count + " pages");
        if (doc.character_count) parts.push(Number(doc.character_count).toLocaleString() + " chars");
        meta.textContent = parts.join(" \u00B7 ") || "Document";
        card.appendChild(meta);

        // Delete button
        var delBtn = document.createElement("button");
        delBtn.className = "my-doc-delete";
        delBtn.textContent = "\uD83D\uDDD1";
        delBtn.title = "Delete permanently";
        delBtn.addEventListener("click", (function(docId, filename) {
            return function() { confirmDeleteDocument(docId, filename); };
        })(doc.document_id, doc.filename));

        card.appendChild(delBtn);
        container.appendChild(card);
    }
}


/* =========================================================
   DELETE DOCUMENT
   ========================================================= */

async function confirmDeleteDocument(docId, filename) {
    var confirmed = confirm("Permanently delete \"" + filename + "\"?\n\nThis will remove the document from Azure Storage and the search index. This cannot be undone.");
    if (!confirmed) return;

    try {
        var response = await fetch(API_URL + "/documents/" + docId, {
            method: "DELETE"
        });

        if (!response.ok) {
            var data = await response.json().catch(function() { return {}; });
            throw new Error(data.detail || "Delete failed (" + response.status + ")");
        }

        // Remove from local state
        selectedDocumentIds.delete(docId);
        uploadedDocuments = uploadedDocuments.filter(function(d) {
            return d.id !== docId && d.document_id !== docId;
        });

        renderDocuments();
        updateCompareButton();
        loadMyDocuments();

        setStatus("Deleted: " + filename);

    } catch (e) {
        console.error("Delete failed:", e);
        alert("Failed to delete document: " + e.message);
    }
}


/* =========================================================
   COMPARE BUTTON STATE
   ========================================================= */

function updateCompareButton() {
    var btn = document.getElementById("compare-selected-btn");
    if (btn) {
        btn.disabled = selectedDocumentIds.size < 2;
    }
}


/* =========================================================
   INITIAL LOAD
   ========================================================= */

document.addEventListener("DOMContentLoaded", function() {
    loadMyDocuments();

    // Wire up the My Documents panel upload input
    var libUpload = document.getElementById("document-upload-library");
    if (libUpload) {
        libUpload.addEventListener("change", async function() {
            var files = Array.from(libUpload.files);
            if (!files.length) return;

            setStatus("Uploading " + files.length + " file" + (files.length > 1 ? "s" : "") + "\u2026");

            for (var i = 0; i < files.length; i++) {
                try {
                    var doc = await uploadFile(files[i]);
                    uploadedDocuments.push(doc);
                    if (doc.id) selectedDocumentIds.add(doc.id);
                } catch (e) {
                    alert("Failed to upload " + files[i].name + ": " + e.message);
                }
            }

            renderDocuments();
            loadMyDocuments();
            setStatus("Upload complete.");
            libUpload.value = "";
        });
    }
});
