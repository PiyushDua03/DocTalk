var API_URL = "http://127.0.0.1:8000";

var uploadedDocuments = [];
var selectedDocumentIds = new Set();
var busy = false;
var currentConversationId = null;
var conversations = [];

function $(id) { return document.getElementById(id); }

var messages = $("messages");
var welcomeScreen = $("welcomeScreen");
var messageInput = $("messageInput");
var sendBtn = $("sendBtn");
var uploadInput = $("document-upload");
var uploadStatus = $("upload-status");
var progress = $("document-upload-progress");
var list = $("uploaded-documents-list");
var count = $("document-count");
var compareBtn = $("compare-selected-btn");
var comparisonPanel = $("comparisonPanel");
var chatArea = $("chatArea");
var insightsPanel = $("insightsPanel");
var conversationList = $("conversationList");


/* =========================
   HELPER FUNCTIONS
========================= */

function escapeHtml(value) {
    return String(value != null ? value : "").replace(
        /[&<>"']/g,
        function(c) {
            return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[c];
        }
    );
}


function setStatus(text, error) {
    if (uploadStatus) {
        uploadStatus.textContent = text;
        uploadStatus.classList.toggle("error", !!error);
    }
}


/**
 * Render simple markdown: **bold**, *italic*, bullet lists, numbered lists.
 * Returns safe HTML string (all content is escaped first).
 */
function renderMarkdown(text) {
    var escaped = escapeHtml(text);
    // Bold
    escaped = escaped.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    // Italic
    escaped = escaped.replace(/\*(.+?)\*/g, "<em>$1</em>");
    // Bullet lists
    escaped = escaped.replace(/^[-•]\s+(.+)$/gm, "<li>$1</li>");
    // Numbered lists
    escaped = escaped.replace(/^\d+\.\s+(.+)$/gm, "<li>$1</li>");
    // Wrap consecutive <li> in <ul>
    escaped = escaped.replace(/((?:<li>.*?<\/li>\s*)+)/g, "<ul>$1</ul>");
    // Paragraphs
    escaped = escaped.replace(/\n\n/g, "<br><br>");
    return escaped;
}


function addMessage(text, role, sources) {
    if (!messages) return;

    if (welcomeScreen) {
        welcomeScreen.style.display = "none";
    }

    messages.style.display = "flex";

    var el = document.createElement("div");
    el.className = "message " + (role || "assistant");

    if (role === "assistant" || !role) {
        var avatar = document.createElement("div");
        avatar.className = "avatar";
        avatar.textContent = "\u2726";
        el.appendChild(avatar);
    }

    var content = document.createElement("div");
    content.className = "message-content";

    // Try to detect visualization data
    var vizData = (typeof tryParseVisualization === "function") ? tryParseVisualization(text) : null;

    if (vizData) {
        // Remove JSON from display text
        var cleanText = text.replace(/```json[\s\S]*?```/g, "").replace(/\{[\s\S]*"type"[\s\S]*\}/g, "").trim();
        if (cleanText) {
            var textP = document.createElement("div");
            textP.innerHTML = renderMarkdown(cleanText);
            content.appendChild(textP);
        }
        if (typeof renderVisualization === "function") {
            renderVisualization(vizData, content);
        }
    } else {
        content.innerHTML = renderMarkdown(text);
    }

    // Display sources if available
    if (sources && sources.length > 0) {
        var srcDiv = document.createElement("div");
        srcDiv.className = "message-sources";

        var srcLabel = document.createElement("span");
        srcLabel.className = "sources-label";
        srcLabel.textContent = "Sources";
        srcDiv.appendChild(srcLabel);

        for (var i = 0; i < sources.length; i++) {
            var s = sources[i];
            var srcItem = document.createElement("span");
            srcItem.className = "source-item";
            var docName = s.document_name || "Document";
            var pageNum = s.page_number != null ? " \u2014 Page " + s.page_number : "";
            srcItem.textContent = "\uD83D\uDCC4 " + docName + pageNum;
            srcDiv.appendChild(srcItem);
        }
        content.appendChild(srcDiv);
    }

    el.appendChild(content);
    messages.appendChild(el);

    el.scrollIntoView({
        behavior: "smooth",
        block: "end"
    });
}


/* =========================
   WORKSPACE / SIDEBAR
========================= */

function showWorkspace(id) {

    document
        .querySelectorAll(".sidebar-item[data-target]")
        .forEach(function(x) {
            x.classList.toggle("active", x.dataset.target === id);
        });

    if (chatArea) {
        chatArea.style.display =
            (id === "comparisonPanel" || id === "myDocumentsPanel") ? "none" : "block";
    }

    if (comparisonPanel) {
        comparisonPanel.classList.toggle(
            "active",
            id === "comparisonPanel"
        );
    }

    if (insightsPanel) {
        insightsPanel.classList.toggle(
            "active",
            id === "insightsPanel"
        );
    }

    var myDocsPanel = document.getElementById("myDocumentsPanel");
    if (myDocsPanel) {
        myDocsPanel.classList.toggle(
            "active",
            id === "myDocumentsPanel"
        );
        if (id === "myDocumentsPanel" && typeof loadMyDocuments === "function") {
            loadMyDocuments();
        }
    }

    if (welcomeScreen) {
        welcomeScreen.style.display =
            id === "chatArea" ? "block" : "none";
    }
}


document
    .querySelectorAll(".sidebar-item[data-target]")
    .forEach(function(x) {
        x.addEventListener("click", function() {
            showWorkspace(x.dataset.target);
        });
    });


/* =========================
   CHAT HISTORY
========================= */

async function loadConversations() {
    try {
        var response = await fetch(API_URL + "/conversations");
        if (response.ok) {
            conversations = await response.json();
            renderConversations();
        }
    } catch (e) {
        console.error("Failed to load conversations:", e);
    }
}

function renderConversations() {
    if (!conversationList) return;

    conversationList.innerHTML = conversations.map(function(c) {
        return '<li class="conversation-item ' + (c.conversation_id === currentConversationId ? "active" : "") + '" data-id="' + escapeHtml(c.conversation_id) + '" title="' + escapeHtml(c.title) + '">' + escapeHtml(c.title) + '</li>';
    }).join("");

    conversationList.querySelectorAll(".conversation-item").forEach(function(item) {
        item.addEventListener("click", function() {
            loadConversation(item.dataset.id);
        });
    });
}

async function loadConversation(id) {
    if (busy) return;
    busy = true;

    try {
        var response = await fetch(API_URL + "/conversations/" + id);
        if (!response.ok) throw new Error("Failed to load chat");

        var data = await response.json();

        currentConversationId = data.conversation_id;
        messages.innerHTML = "";
        welcomeScreen.style.display = "none";
        messages.style.display = "flex";
        showWorkspace("chatArea");

        // Restore messages
        data.messages.forEach(function(msg) {
            var el = document.createElement("div");
            el.className = "message " + msg.role;
            if (msg.role === "assistant") {
                var av = document.createElement("div");
                av.className = "avatar";
                av.textContent = "\u2726";
                el.appendChild(av);
            }
            var ct = document.createElement("div");
            ct.className = "message-content";
            ct.textContent = msg.content;
            el.appendChild(ct);
            messages.appendChild(el);
        });

        // Scroll to bottom
        var lastEl = messages.lastElementChild;
        if (lastEl) lastEl.scrollIntoView({ behavior: "smooth", block: "end" });

        // Restore document IDs
        uploadedDocuments = [];
        selectedDocumentIds = new Set();

        for (var di = 0; di < (data.document_ids || []).length; di++) {
            var docId = data.document_ids[di];
            try {
                var docRes = await fetch(API_URL + "/documents/" + docId);
                if (docRes.ok) {
                    var docData = await docRes.json();
                    uploadedDocuments.push({
                        id: docData.document_id,
                        filename: docData.filename,
                        page_count: docData.page_count,
                        characters: docData.character_count
                    });
                }
            } catch (e2) {
                console.error("Failed to restore document:", docId, e2);
            }
        }

        renderDocuments();
        renderConversations();

    } catch (e) {
        console.error(e);
        addMessage("Failed to load conversation.", "assistant");
    } finally {
        busy = false;
    }
}


/* =========================
   DOCUMENT LIST
========================= */

function renderDocuments() {

    if (!list) return;

    var docArea = document.getElementById("uploaded-documents-area");
    if (docArea) {
        docArea.style.display = uploadedDocuments.length ? "block" : "none";
    }

    if (count) {
        count.textContent =
            uploadedDocuments.length + " document" +
            (uploadedDocuments.length === 1 ? "" : "s") +
            " in session";
    }

    if (compareBtn) {
        compareBtn.disabled = selectedDocumentIds.size < 2;
    }

    list.innerHTML =
        uploadedDocuments.length
            ? uploadedDocuments
                  .map(function(doc) {
                      return '<article class="uploaded-document-card">' +
                          '<label>' +
                              '<input type="checkbox" data-doc-id="' + escapeHtml(doc.id || doc.document_id) + '"' +
                              (selectedDocumentIds.has(doc.id || doc.document_id) ? " checked" : "") +
                              '>' +
                              '<strong>' + escapeHtml(doc.filename) + '</strong>' +
                          '</label>' +
                          '<small>' +
                              (doc.page_count ? doc.page_count + " pages" : "Document") +
                              ' \u00B7 ' +
                              Number(doc.characters || 0).toLocaleString() + ' characters' +
                          '</small>' +
                      '</article>';
                  })
                  .join("")
            : '<p class="empty-state">Upload PDF, DOCX, or TXT files to see them here.</p>';

    list
        .querySelectorAll("input[data-doc-id]")
        .forEach(function(box) {

            box.addEventListener("change", function() {

                if (box.checked) {
                    selectedDocumentIds.add(box.dataset.docId);
                } else {
                    selectedDocumentIds.delete(box.dataset.docId);
                }

                renderDocuments();
                if (typeof updateCompareButton === "function") updateCompareButton();
            });
        });
}


/* =========================
   UPLOAD DOCUMENT
========================= */

async function uploadFile(file) {

    var form = new FormData();
    form.append("file", file);

    var response = await fetch(
        API_URL + "/upload",
        {
            method: "POST",
            body: form
        }
    );

    var data =
        await response.json().catch(function() { return {}; });

    if (!response.ok) {
        throw new Error(
            data.detail ||
            "Upload failed (" + response.status + ")"
        );
    }

    // Store the document_id
    if (data.document_id) {
        data.id = data.document_id;
    }

    return data;
}


if (uploadInput) {

    uploadInput.addEventListener(
        "change",
        async function() {

            var files = Array.from(uploadInput.files);

            if (!files.length) return;

            setStatus(
                "Uploading " + files.length + " file" +
                (files.length > 1 ? "s" : "") + "\u2026"
            );

            if (progress) progress.textContent = "";

            for (var i = 0; i < files.length; i++) {

                try {

                    if (progress) {
                        progress.textContent =
                            "Uploading " + (i + 1) + " of " + files.length + ": " + files[i].name + "\u2026";
                    }

                    var doc = await uploadFile(files[i]);

                    uploadedDocuments.push(doc);

                    // Auto-select newly uploaded documents
                    if (doc.id) {
                        selectedDocumentIds.add(doc.id);
                    }

                    if (progress) {
                        progress.textContent =
                            "\u2713 Uploaded " + (i + 1) + " of " + files.length + ": " + files[i].name;
                    }

                } catch (e) {

                    if (progress) {
                        progress.textContent =
                            "\u2717 Failed: " + files[i].name + " \u2014 " + e.message;
                    }
                }
            }

            renderDocuments();

            setStatus("Upload complete.");

            // Refresh My Documents
            if (typeof loadMyDocuments === "function") loadMyDocuments();

            uploadInput.value = "";
        }
    );
}


/* =========================
   CHAT
========================= */

async function sendMessage() {

    var message = messageInput ? messageInput.value.trim() : "";

    if (!message || busy) return;

    busy = true;

    if (sendBtn) {
        sendBtn.disabled = true;
    }

    addMessage(message, "user");

    messageInput.value = "";


    /* Typing indicator */
    var typing = document.createElement("div");
    typing.className = "message assistant typing-indicator";
    typing.id = "typingMessage";

    var typingAvatar = document.createElement("div");
    typingAvatar.className = "avatar";
    typingAvatar.textContent = "\u2726";
    typing.appendChild(typingAvatar);

    var typingContent = document.createElement("div");
    typingContent.className = "message-content";
    typingContent.textContent = "DocTalk is thinking\u2026";
    typing.appendChild(typingContent);

    messages.appendChild(typing);
    typing.scrollIntoView({ behavior: "smooth", block: "end" });


    try {

        /*
         * Send ONLY the selected document IDs,
         * not all uploaded documents.
         */
        var docIds = Array.from(selectedDocumentIds);

        var response =
            await fetch(
                API_URL + "/chat",
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({
                        message: message,
                        document_ids: docIds,
                        conversation_id: currentConversationId
                    })
                }
            );


        var data =
            await response
                .json()
                .catch(function() { return {}; });


        if (!response.ok) {
            throw new Error(
                data.detail ||
                "Request failed (" + response.status + ")"
            );
        }


        if (data.conversation_id) {
            if (!currentConversationId) {
                currentConversationId = data.conversation_id;
            }
            loadConversations();
        }

        var responseText = data.response || data.answer || data.message || "No response returned.";
        var sources = data.sources || [];

        addMessage(responseText, "assistant", sources);


    } catch (e) {

        console.error("Chat error:", e);

        addMessage(
            "Sorry, the request failed: " + e.message + ".",
            "assistant"
        );

    } finally {

        var typingEl = $("typingMessage");
        if (typingEl) typingEl.remove();

        busy = false;

        if (sendBtn) {
            sendBtn.disabled = false;
        }

        if (messageInput) messageInput.focus();
    }
}


/* =========================
   CHAT BUTTON / ENTER
========================= */

if (sendBtn) {
    sendBtn.addEventListener("click", sendMessage);
}

if (messageInput) {
    messageInput.addEventListener(
        "keydown",
        function(e) {
            if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
            }
        }
    );
}


/* =========================
   SUGGESTION CARDS
========================= */

document
    .querySelectorAll(".suggestion-card")
    .forEach(function(x) {
        x.addEventListener(
            "click",
            function() {
                messageInput.value =
                    x.dataset.prompt ||
                    x.textContent.trim();
                sendMessage();
            }
        );
    });


/* =========================
   NEW CHAT
========================= */

$("newChatBtn")?.addEventListener(
    "click",
    function() {

        messages.innerHTML = "";

        welcomeScreen.style.display = "block";

        showWorkspace("chatArea");

        /*
         * SESSION-SCOPE: Clear the current session's
         * document selection when starting a new conversation.
         *
         * Documents remain stored in the backend's
         * metadata store / My Documents.
         * They are NOT deleted.
         */
        uploadedDocuments = [];
        selectedDocumentIds = new Set();
        currentConversationId = null;
        if (progress) progress.textContent = "";
        renderDocuments();
        renderConversations();

        // Refresh My Documents (documents persist)
        if (typeof loadMyDocuments === "function") loadMyDocuments();

        if (messageInput) messageInput.focus();
    }
);


/* =========================
   DOCUMENT COMPARISON
========================= */

if (compareBtn) {
    compareBtn.addEventListener(
        "click",
        async function() {

            if (selectedDocumentIds.size < 2 || busy) {
                if (selectedDocumentIds.size < 2) {
                    addMessage("Please select at least 2 documents to compare.", "assistant");
                }
                return;
            }

            busy = true;
            compareBtn.disabled = true;

            // Show comparison in chat area
            showWorkspace("chatArea");

            // Build the selected document names for the prompt
            var selectedDocs = uploadedDocuments.filter(function(d) {
                return selectedDocumentIds.has(d.id || d.document_id);
            });

            var docNames = selectedDocs.map(function(d) { return d.filename; }).join(", ");

            var comparePrompt = "Compare these documents in detail: " + docNames + ". " +
                "List the key similarities and differences between them. " +
                "Use clear sections for Similarities, Differences, and a Summary.";

            addMessage("Compare: " + docNames, "user");

            // Typing indicator
            var typing = document.createElement("div");
            typing.className = "message assistant typing-indicator";
            typing.id = "typingMessage";

            var typingAvatar = document.createElement("div");
            typingAvatar.className = "avatar";
            typingAvatar.textContent = "\u2726";
            typing.appendChild(typingAvatar);

            var typingContent = document.createElement("div");
            typingContent.className = "message-content";
            typingContent.textContent = "Comparing documents\u2026";
            typing.appendChild(typingContent);

            messages.appendChild(typing);
            typing.scrollIntoView({ behavior: "smooth", block: "end" });

            if (welcomeScreen) welcomeScreen.style.display = "none";
            messages.style.display = "flex";

            try {
                var docIds = Array.from(selectedDocumentIds);

                var response = await fetch(
                    API_URL + "/chat",
                    {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            message: comparePrompt,
                            document_ids: docIds,
                            conversation_id: currentConversationId
                        })
                    }
                );

                var data = await response.json().catch(function() { return {}; });

                if (!response.ok) {
                    throw new Error(
                        data.detail || "Comparison failed (" + response.status + ")"
                    );
                }

                if (data.conversation_id && !currentConversationId) {
                    currentConversationId = data.conversation_id;
                    loadConversations();
                }

                var result = data.response || data.answer || "No comparison generated.";
                var sources = data.sources || [];

                addMessage(result, "assistant", sources);

            } catch (e) {
                console.error("Comparison error:", e);
                addMessage("Comparison failed: " + e.message, "assistant");

            } finally {
                var typingEl = $("typingMessage");
                if (typingEl) typingEl.remove();

                busy = false;
                renderDocuments();
            }
        }
    );
}


/* =========================
   VISUALIZE BUTTON
========================= */

var vizBtn = $("visualizeBtn");
if (vizBtn) {
    vizBtn.addEventListener("click", function() {
        if (!messageInput) return;
        var current = messageInput.value.trim();
        if (current) {
            messageInput.value = "Visualize this: " + current;
        } else {
            messageInput.value = "Create a visualization of the key data from the selected documents. Return a JSON object with type (bar, line, pie, table, timeline, or process), title, labels, and values.";
        }
        sendMessage();
    });
}


/* =========================
   INITIAL LOAD
========================= */

renderDocuments();
loadConversations();