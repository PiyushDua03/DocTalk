var API_URL = "https://doctalk-backend-api.azurewebsites.net";

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

    // Try to detect ALL visualization data blocks (support multiple charts)
    var allJsonBlocks = text.match(/```json\s*([\s\S]*?)```/g);
    var vizRendered = false;

    if (allJsonBlocks && allJsonBlocks.length > 0 && typeof renderVisualization === "function") {
        // Clean text: remove all JSON blocks
        var cleanText = text.replace(/```json[\s\S]*?```/g, "").trim();
        if (cleanText) {
            var textP = document.createElement("div");
            textP.innerHTML = renderMarkdown(cleanText);
            content.appendChild(textP);
        }

        // Render each chart
        for (var vi = 0; vi < allJsonBlocks.length; vi++) {
            try {
                var jsonStr = allJsonBlocks[vi].replace(/```json\s*/, "").replace(/```$/, "").trim();
                var vizObj = JSON.parse(jsonStr);
                if (vizObj && vizObj.type) {
                    renderVisualization(vizObj, content);
                    vizRendered = true;
                }
            } catch(e) { /* skip invalid JSON */ }
        }
    }

    if (!vizRendered) {
        // Fallback: try single viz detection
        var vizData = (typeof tryParseVisualization === "function") ? tryParseVisualization(text) : null;
        if (vizData) {
            var cleanText2 = text.replace(/```json[\s\S]*?```/g, "").replace(/\{[\s\S]*"type"[\s\S]*\}/g, "").trim();
            if (cleanText2) {
                content.innerHTML = renderMarkdown(cleanText2);
            }
            if (typeof renderVisualization === "function") {
                renderVisualization(vizData, content);
            }
        } else {
            content.innerHTML = renderMarkdown(text);
        }
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

    // Add download toolbar for assistant messages
    if (role === "assistant" || !role) {
        var toolbar = document.createElement("div");
        toolbar.className = "message-toolbar";

        var pdfBtn = document.createElement("button");
        pdfBtn.className = "msg-action-btn";
        pdfBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg> Download PDF';
        pdfBtn.title = "Download this response as PDF";
        pdfBtn.onclick = function() { downloadMessageAsPDF(content, text); };
        toolbar.appendChild(pdfBtn);

        var copyBtn = document.createElement("button");
        copyBtn.className = "msg-action-btn";
        copyBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg> Copy';
        copyBtn.title = "Copy to clipboard";
        copyBtn.onclick = function() {
            navigator.clipboard.writeText(text).then(function() {
                copyBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg> Copied!';
                setTimeout(function() {
                    copyBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg> Copy';
                }, 2000);
            });
        };
        toolbar.appendChild(copyBtn);

        content.appendChild(toolbar);
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

    var hidePanels = ["comparisonPanel", "myDocumentsPanel", "architecturePanel"];

    document
        .querySelectorAll(".sidebar-item[data-target]")
        .forEach(function(x) {
            x.classList.toggle("active", x.dataset.target === id);
        });

    if (chatArea) {
        chatArea.style.display =
            hidePanels.indexOf(id) !== -1 ? "none" : "flex";
        if (id === "chatArea" && messages) {
            chatArea.insertBefore(messages, document.getElementById("uploaded-documents-area"));
        }
    }

    if (comparisonPanel) {
        comparisonPanel.style.display = id === "comparisonPanel" ? "flex" : "none";
        comparisonPanel.classList.toggle("active", id === "comparisonPanel");
        if (id === "comparisonPanel" && messages) {
            comparisonPanel.appendChild(messages);
            var resultArea = document.getElementById("comparison-result-area");
            if (resultArea) resultArea.style.display = "none";
        }
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

    var archPanel = document.getElementById("architecturePanel");
    if (archPanel) {
        archPanel.classList.toggle(
            "active",
            id === "architecturePanel"
        );
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

        // Restore messages using the addMessage function so markdown, charts, and sources render properly
        data.messages.forEach(function(msg) {
            addMessage(msg.content, msg.role, msg.sources);
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

        // Detect if the user is asking for charts/visuals
        var chartKeywords = /\b(chart|graph|diagram|visual|visuali[sz]|plot|radar|bar chart|pie chart|line chart|comparison|compare|flow diagram|timeline|infographic)\b/i;
        var augmentedMessage = message;
        if (chartKeywords.test(message)) {
            augmentedMessage = message + "\n\nIMPORTANT: You MUST respond with actual chart data in JSON format wrapped in ```json code fences. Use one of these chart types: bar, line, pie, table, process, timeline. Format example for bar chart: ```json\n{\"type\":\"bar\",\"title\":\"Chart Title\",\"labels\":[\"A\",\"B\",\"C\"],\"values\":[10,20,30]}\n``` For comparison/table: ```json\n{\"type\":\"table\",\"title\":\"Comparison\",\"headers\":[\"Attribute\",\"Edge\",\"Cloud\"],\"rows\":[[\"Latency\",\"1-10ms\",\"50-250ms\"],[\"Privacy\",\"High\",\"Moderate\"]]}\n``` For process/flow: ```json\n{\"type\":\"process\",\"title\":\"Flow\",\"steps\":[\"Step 1\",\"Step 2\",\"Step 3\"]}\n``` For pie: ```json\n{\"type\":\"pie\",\"title\":\"Distribution\",\"labels\":[\"A\",\"B\"],\"values\":[60,40]}\n``` For timeline: ```json\n{\"type\":\"timeline\",\"title\":\"Timeline\",\"events\":[{\"date\":\"Phase 1\",\"description\":\"Description\"}]}\n``` You can include MULTIPLE ```json blocks if the user asks for multiple charts. Include a brief text explanation before each chart. DO NOT just describe charts in text — you MUST include the JSON data so the charts render visually.";
        }

        var response =
            await fetch(
                API_URL + "/chat",
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({
                        message: augmentedMessage,
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

            // Show comparison in compare documents area
            showWorkspace("comparisonPanel");

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
   DOWNLOAD / EXPORT
========================= */

/**
 * Download a single AI response as a styled PDF.
 */
function downloadMessageAsPDF(contentEl, rawText) {
    var jsPDFClass = window.jspdf && window.jspdf.jsPDF;
    if (!jsPDFClass) {
        alert("PDF library not loaded. Please refresh and try again.");
        return;
    }

    // ── Step 1: Capture all visualizations as PNG data URLs ──
    // We capture the entire .viz-container (which includes HTML charts like process, timeline, tables, and SVGs)
    var vizElements = contentEl.querySelectorAll(".viz-container");
    var chartImages = [];

    function convertVizToPng() {
        var promises = [];
        for (var vi = 0; vi < vizElements.length; vi++) {
            (function(vizEl, idx) {
                var promise = new Promise(function(resolve) {
                    if (!window.html2canvas) {
                        chartImages[idx] = null;
                        resolve();
                        return;
                    }
                    
                    // Hide the download button during capture
                    var dlBtn = vizEl.querySelector(".viz-download-btn");
                    if (dlBtn) dlBtn.style.display = "none";
                    
                    html2canvas(vizEl, {
                        scale: 2,
                        useCORS: true,
                        logging: false,
                        backgroundColor: "#ffffff"
                    }).then(function(canvas) {
                        if (dlBtn) dlBtn.style.display = ""; // restore
                        chartImages[idx] = {
                            dataUrl: canvas.toDataURL("image/png"),
                            width: canvas.width / 2,
                            height: canvas.height / 2
                        };
                        resolve();
                    }).catch(function(err) {
                        if (dlBtn) dlBtn.style.display = "";
                        chartImages[idx] = null;
                        resolve();
                    });
                });
                promises.push(promise);
            })(vizElements[vi], vi);
        }
        return Promise.all(promises);
    }

    // ── Step 2: Extract clean text from the DOM ──
    var textContent = "";
    function extractText(node) {
        if (!node) return;
        if (node.nodeType === 3) {
            var t = node.textContent;
            if (t && t.trim()) textContent += t;
            return;
        }
        if (node.nodeType !== 1) return;
        var tag = (node.tagName || "").toLowerCase();
        
        // Skip toolbars
        if (node.classList && (node.classList.contains("message-toolbar") || node.classList.contains("viz-download-btn"))) return;
        
        // CRITICAL: Skip visualization containers entirely so their raw text isn't extracted
        if (node.classList && node.classList.contains("viz-container")) return;

        if (tag === "br") { textContent += "\n"; return; }
        if (tag === "h1" || tag === "h2" || tag === "h3") textContent += "\n\n## ";
        if (tag === "p") textContent += "\n";
        if (tag === "li") textContent += "\n  • ";
        if (tag === "tr") textContent += "\n";
        if (tag === "td" || tag === "th") textContent += " | ";

        for (var i = 0; i < node.childNodes.length; i++) {
            extractText(node.childNodes[i]);
        }

        if (tag === "p" || tag === "div" || tag === "h1" || tag === "h2" || tag === "h3" || tag === "tr") {
            textContent += "\n";
        }
    }
    extractText(contentEl);

    // Clean up
    textContent = textContent
        .replace(/Download SVG/g, "")
        .replace(/⇣ Download SVG/g, "")
        .replace(/\n{3,}/g, "\n\n")
        .replace(/\t/g, "    ")
        .trim();

    // ── Step 3: Convert visualizations then build PDF ──
    convertVizToPng().then(function() {
        _buildAndSavePDF(jsPDFClass, textContent, chartImages);
    });
}

function _buildAndSavePDF(jsPDFClass, textContent, chartImages) {
    var doc = new jsPDFClass({ unit: "mm", format: "a4", orientation: "portrait" });
    var pageW = doc.internal.pageSize.getWidth();
    var pageH = doc.internal.pageSize.getHeight();
    var margin = 15;
    var contentW = pageW - margin * 2;
    var y = margin;

    // ── Header ──
    doc.setFillColor(108, 92, 231);
    doc.rect(0, 0, pageW, 22, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.text("DocTalk", margin, 10);
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.text("AI Document Intelligence — Generated Response", margin, 16);
    y = 28;

    // ── Embed chart images ──
    for (var ci = 0; ci < chartImages.length; ci++) {
        var chart = chartImages[ci];
        if (!chart || !chart.dataUrl) continue;

        // Scale chart to fit page width
        var imgW = contentW;
        var imgH = (chart.height / chart.width) * imgW;

        // Cap height to avoid oversized charts
        if (imgH > pageH * 0.4) {
            imgH = pageH * 0.4;
            imgW = (chart.width / chart.height) * imgH;
        }

        // Check page break
        if (y + imgH + 5 > pageH - 20) {
            doc.setFontSize(8);
            doc.setTextColor(150, 150, 150);
            doc.text("DocTalk — Page " + doc.internal.getNumberOfPages(), pageW / 2, pageH - 8, { align: "center" });
            doc.addPage();
            y = margin;
        }

        try {
            doc.addImage(chart.dataUrl, "PNG", margin, y, imgW, imgH);
            y += imgH + 5;
        } catch(imgErr) {
            // Skip if image embedding fails
            console.warn("Chart image embedding failed:", imgErr);
        }
    }

    // ── Body text ──
    doc.setTextColor(30, 30, 50);
    var lines = textContent.split("\n");

    for (var i = 0; i < lines.length; i++) {
        var line = lines[i];

        // Check for page break needed
        if (y > pageH - 20) {
            // Footer on current page
            doc.setFontSize(8);
            doc.setTextColor(150, 150, 150);
            doc.text("DocTalk — Page " + doc.internal.getNumberOfPages(), pageW / 2, pageH - 8, { align: "center" });

            doc.addPage();
            y = margin;
        }

        // Detect section headers
        if (line.match(/^## /)) {
            line = line.replace(/^## /, "");
            doc.setFontSize(13);
            doc.setFont("helvetica", "bold");
            doc.setTextColor(108, 92, 231);
            y += 3;
            var headerLines = doc.splitTextToSize(line, contentW);
            doc.text(headerLines, margin, y);
            y += headerLines.length * 6 + 2;
            doc.setTextColor(30, 30, 50);
            continue;
        }

        // Detect bold-like section titles
        if ((line.match(/^(Similarities|Differences|Summary|Explanation|Next steps|Attribute|Purpose|Feature)/i) && line.length < 100) ||
            (line.match(/^[A-Z][A-Z\s—:\/\-&,]+$/) && line.length < 80 && line.length > 3)) {
            doc.setFontSize(11);
            doc.setFont("helvetica", "bold");
            doc.setTextColor(108, 92, 231);
            y += 2;
            var titleLines = doc.splitTextToSize(line, contentW);
            doc.text(titleLines, margin, y);
            y += titleLines.length * 5 + 2;
            doc.setTextColor(30, 30, 50);
            continue;
        }

        // Detect bullet points
        if (line.match(/^\s*[•●▪-]\s/)) {
            doc.setFontSize(9);
            doc.setFont("helvetica", "normal");
            var bulletLines = doc.splitTextToSize(line, contentW - 6);
            doc.text(bulletLines, margin + 4, y);
            y += bulletLines.length * 4.5;
            continue;
        }

        // Detect table-like rows
        if (line.indexOf(" | ") !== -1) {
            doc.setFontSize(8);
            doc.setFont("helvetica", "normal");
            doc.setDrawColor(200, 200, 200);
            var cellTexts = line.split(" | ").filter(function(c) { return c.trim(); });
            var cellW = contentW / Math.max(cellTexts.length, 1);
            var maxCellH = 0;
            // Calculate max cell height
            for (var ci = 0; ci < cellTexts.length; ci++) {
                var cellLines = doc.splitTextToSize(cellTexts[ci].trim(), cellW - 4);
                maxCellH = Math.max(maxCellH, cellLines.length * 4);
            }
            // Check page break for table row
            if (y + maxCellH + 4 > pageH - 20) {
                doc.addPage();
                y = margin;
            }
            // Draw cells
            for (var ci2 = 0; ci2 < cellTexts.length; ci2++) {
                var cellX = margin + ci2 * cellW;
                doc.rect(cellX, y - 3, cellW, maxCellH + 4);
                var cLines = doc.splitTextToSize(cellTexts[ci2].trim(), cellW - 4);
                doc.text(cLines, cellX + 2, y);
            }
            y += maxCellH + 4;
            continue;
        }

        // Empty line → small gap
        if (!line.trim()) {
            y += 3;
            continue;
        }

        // Regular text
        doc.setFontSize(9);
        doc.setFont("helvetica", "normal");
        var wrappedLines = doc.splitTextToSize(line, contentW);

        // Check if we need a new page for this block
        if (y + wrappedLines.length * 4.5 > pageH - 20) {
            doc.setFontSize(8);
            doc.setTextColor(150, 150, 150);
            doc.text("DocTalk — Page " + doc.internal.getNumberOfPages(), pageW / 2, pageH - 8, { align: "center" });
            doc.addPage();
            y = margin;
            doc.setTextColor(30, 30, 50);
        }

        doc.text(wrappedLines, margin, y);
        y += wrappedLines.length * 4.5;
    }

    // ── Footer on last page ──
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.setDrawColor(200, 200, 200);
    doc.line(margin, pageH - 14, pageW - margin, pageH - 14);
    doc.text("Generated by DocTalk — " + new Date().toLocaleString(), pageW / 2, pageH - 8, { align: "center" });

    doc.save("DocTalk_Response_" + Date.now() + ".pdf");
}


/**
 * Download a single AI response as a PNG image.
 */
function downloadMessageAsImage(contentEl) {
    var clone = contentEl.cloneNode(true);

    // Remove the toolbar from the clone
    var tb = clone.querySelector(".message-toolbar");
    if (tb) tb.remove();

    // Create a wrapper
    var wrapper = document.createElement("div");
    wrapper.style.cssText = "padding:28px;background:linear-gradient(135deg,#0f0f23,#1a1a3e);border-radius:16px;max-width:700px;font-family:'Inter',sans-serif;color:#e0e0e0;line-height:1.7;";

    // Header
    var header = document.createElement("div");
    header.style.cssText = "display:flex;align-items:center;gap:10px;margin-bottom:16px;padding-bottom:12px;border-bottom:1px solid rgba(108,92,231,0.4);";
    header.innerHTML = '<div style="width:28px;height:28px;background:linear-gradient(135deg,#6c5ce7,#a29bfe);border-radius:8px;display:flex;align-items:center;justify-content:center;color:white;font-size:16px;">✦</div>' +
        '<strong style="font-size:14px;color:#a29bfe;">DocTalk Response</strong>';
    wrapper.appendChild(header);

    clone.style.cssText = "font-size:13px;color:#e0e0e0;";
    wrapper.appendChild(clone);

    var footer = document.createElement("div");
    footer.style.cssText = "margin-top:16px;padding-top:10px;border-top:1px solid rgba(255,255,255,0.1);font-size:10px;color:#666;text-align:right;";
    footer.textContent = "DocTalk — " + new Date().toLocaleString();
    wrapper.appendChild(footer);

    // Temporarily add to DOM for rendering
    wrapper.style.position = "fixed";
    wrapper.style.left = "-9999px";
    document.body.appendChild(wrapper);

    html2canvas(wrapper, { scale: 2, backgroundColor: null, useCORS: true }).then(function(canvas) {
        document.body.removeChild(wrapper);
        var link = document.createElement("a");
        link.download = "DocTalk_Response_" + Date.now() + ".png";
        link.href = canvas.toDataURL("image/png");
        link.click();
    }).catch(function() {
        document.body.removeChild(wrapper);
    });
}


/**
 * Export the entire conversation as a PDF.
 */
function exportConversationAsPDF() {
    var allMessages = document.querySelectorAll("#messages .message");
    if (!allMessages.length) return;

    var wrapper = document.createElement("div");
    wrapper.style.cssText = "padding:32px;font-family:'Inter',sans-serif;color:#1a1a2e;max-width:700px;line-height:1.7;";

    // Title page header
    var header = document.createElement("div");
    header.style.cssText = "text-align:center;margin-bottom:30px;padding-bottom:20px;border-bottom:3px solid #6c5ce7;";
    header.innerHTML = '<div style="width:48px;height:48px;background:linear-gradient(135deg,#6c5ce7,#a29bfe);border-radius:12px;display:inline-flex;align-items:center;justify-content:center;color:white;font-size:24px;margin-bottom:12px;">✦</div>' +
        '<h1 style="font-size:22px;color:#6c5ce7;margin:8px 0 4px;">DocTalk Conversation</h1>' +
        '<p style="font-size:12px;color:#888;">Exported on ' + new Date().toLocaleString() + '</p>';
    wrapper.appendChild(header);

    allMessages.forEach(function(msg, idx) {
        var isUser = msg.classList.contains("user");
        var contentEl = msg.querySelector(".message-content");
        if (!contentEl) return;

        var block = document.createElement("div");
        block.style.cssText = "margin-bottom:16px;padding:14px;border-radius:10px;" +
            (isUser
                ? "background:#f0edff;border-left:3px solid #6c5ce7;"
                : "background:#f8f9fa;border-left:3px solid #00b894;");

        var label = document.createElement("div");
        label.style.cssText = "font-size:11px;font-weight:600;margin-bottom:6px;color:" + (isUser ? "#6c5ce7" : "#00b894") + ";";
        label.textContent = isUser ? "👤 You" : "✦ DocTalk AI";
        block.appendChild(label);

        var clone = contentEl.cloneNode(true);
        var tb = clone.querySelector(".message-toolbar");
        if (tb) tb.remove();
        clone.style.cssText = "font-size:12px;color:#2d3436;";
        block.appendChild(clone);

        wrapper.appendChild(block);
    });

    var footer = document.createElement("div");
    footer.style.cssText = "margin-top:20px;padding-top:12px;border-top:1px solid #ddd;font-size:10px;color:#999;text-align:center;";
    footer.textContent = "Generated by DocTalk — AI Document Intelligence";
    wrapper.appendChild(footer);

    var opt = {
        margin: [10, 10, 10, 10],
        filename: "DocTalk_Conversation_" + Date.now() + ".pdf",
        image: { type: "jpeg", quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
        pagebreak: { mode: ["avoid-all", "css", "legacy"] }
    };

    html2pdf().set(opt).from(wrapper).save();
}


/* =========================
   INFOGRAPHIC GENERATOR
========================= */

/**
 * Generate a visual infographic from the uploaded document.
 * Asks AI for structured data, then renders on Canvas.
 */
function generateInfographic() {
    if (uploadedDocuments.length === 0) {
        addMessage("Please upload a document first to generate an infographic.", "assistant");
        return;
    }

    addMessage("🎨 Generate visual infographic", "user");
    addMessage("Analyzing your document and creating a visual infographic... Please wait.", "assistant");

    var selectedIds = Array.from(selectedDocumentIds);
    var body = {
        message: "Analyze the uploaded document and return ONLY valid JSON (no markdown, no code fences) in this exact format: {\"title\": \"Document Title\", \"subtitle\": \"One-line description\", \"keyTopics\": [\"Topic 1\", \"Topic 2\", \"Topic 3\", \"Topic 4\", \"Topic 5\", \"Topic 6\"], \"stats\": [{\"label\": \"Stat Name\", \"value\": \"Stat Value\"}, {\"label\": \"Stat Name\", \"value\": \"Stat Value\"}, {\"label\": \"Stat Name\", \"value\": \"Stat Value\"}], \"summary\": \"A 2-3 sentence summary of the document.\"}",
        document_ids: selectedIds.length > 0 ? selectedIds : uploadedDocuments.map(function(d) { return d.id; })
    };

    fetch(API_URL + "/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
    })
    .then(function(r) { return r.json(); })
    .then(function(data) {
        var responseText = data.response || data.answer || "";
        // Try to parse JSON from the response
        var jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            try {
                var info = JSON.parse(jsonMatch[0]);
                renderInfographicCanvas(info);
                return;
            } catch(e) { /* fall through */ }
        }
        // Fallback: build from text
        var lines = responseText.split("\n").filter(function(l) { return l.trim(); });
        var fallback = {
            title: uploadedDocuments[0] ? uploadedDocuments[0].name : "Document Analysis",
            subtitle: "AI-Generated Visual Summary",
            keyTopics: lines.slice(0, 6).map(function(l) { return l.replace(/^[-•*\d.]+\s*/, "").substring(0, 40); }),
            stats: [
                { label: "Pages", value: "N/A" },
                { label: "Topics", value: String(lines.length) },
                { label: "Confidence", value: "High" }
            ],
            summary: lines.slice(0, 2).join(" ").substring(0, 200)
        };
        renderInfographicCanvas(fallback);
    })
    .catch(function(err) {
        addMessage("Could not generate infographic: " + err.message, "assistant");
    });
}


/**
 * Render a beautiful infographic on HTML5 Canvas and auto-download.
 */
function renderInfographicCanvas(info) {
    var W = 1200, H = 1600;
    var canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    var ctx = canvas.getContext("2d");

    // Background gradient
    var bgGrad = ctx.createLinearGradient(0, 0, W, H);
    bgGrad.addColorStop(0, "#080B16");
    bgGrad.addColorStop(0.5, "#0D1222");
    bgGrad.addColorStop(1, "#11182A");
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, W, H);

    // Decorative circles
    ctx.globalAlpha = 0.06;
    ctx.fillStyle = "#6366F1";
    ctx.beginPath(); ctx.arc(1050, 150, 200, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#8B5CF6";
    ctx.beginPath(); ctx.arc(150, 1400, 250, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#06B6D4";
    ctx.beginPath(); ctx.arc(1100, 1200, 180, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;

    // Top accent bar
    var accentGrad = ctx.createLinearGradient(0, 0, W, 0);
    accentGrad.addColorStop(0, "#6366F1");
    accentGrad.addColorStop(1, "#8B5CF6");
    ctx.fillStyle = accentGrad;
    ctx.fillRect(0, 0, W, 6);

    // Logo area
    ctx.fillStyle = "#6366F1";
    roundRect(ctx, 50, 40, 44, 44, 10);
    ctx.fill();
    ctx.fillStyle = "#FFFFFF";
    ctx.font = "bold 24px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("✦", 72, 70);

    ctx.textAlign = "left";
    ctx.fillStyle = "#E2E8F0";
    ctx.font = "bold 20px 'Inter', sans-serif";
    ctx.fillText("DocTalk", 110, 60);
    ctx.fillStyle = "#64748B";
    ctx.font = "12px 'Inter', sans-serif";
    ctx.fillText("AI Document Intelligence", 110, 78);

    // Timestamp
    ctx.textAlign = "right";
    ctx.fillStyle = "#475569";
    ctx.font = "11px 'Inter', sans-serif";
    ctx.fillText(new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }), W - 50, 65);
    ctx.textAlign = "left";

    // Title
    ctx.fillStyle = "#F1F5F9";
    ctx.font = "bold 36px 'Inter', sans-serif";
    var title = (info.title || "Document Analysis").substring(0, 50);
    wrapText(ctx, title, 50, 150, W - 100, 44);

    // Subtitle
    ctx.fillStyle = "#94A3B8";
    ctx.font = "16px 'Inter', sans-serif";
    ctx.fillText((info.subtitle || "AI-Generated Visual Summary").substring(0, 80), 50, 210);

    // Divider
    var divGrad = ctx.createLinearGradient(50, 0, W - 50, 0);
    divGrad.addColorStop(0, "#6366F1");
    divGrad.addColorStop(0.5, "#8B5CF6");
    divGrad.addColorStop(1, "transparent");
    ctx.fillStyle = divGrad;
    ctx.fillRect(50, 235, W - 100, 2);

    // Stats cards
    var stats = info.stats || [];
    var statY = 270;
    var cardW = (W - 140) / 3;
    for (var si = 0; si < Math.min(stats.length, 3); si++) {
        var sx = 50 + si * (cardW + 20);
        // Card background
        ctx.fillStyle = "rgba(99, 102, 241, 0.08)";
        roundRect(ctx, sx, statY, cardW, 90, 12);
        ctx.fill();
        ctx.strokeStyle = "rgba(99, 102, 241, 0.2)";
        ctx.lineWidth = 1;
        roundRect(ctx, sx, statY, cardW, 90, 12);
        ctx.stroke();
        // Value
        ctx.fillStyle = "#A5B4FC";
        ctx.font = "bold 28px 'Inter', sans-serif";
        ctx.fillText(String(stats[si].value || "—").substring(0, 15), sx + 20, statY + 42);
        // Label
        ctx.fillStyle = "#64748B";
        ctx.font = "13px 'Inter', sans-serif";
        ctx.fillText(String(stats[si].label || "").substring(0, 25), sx + 20, statY + 70);
    }

    // Key Topics section
    var topicY = 400;
    ctx.fillStyle = "#6366F1";
    ctx.font = "bold 13px 'Inter', sans-serif";
    ctx.fillText("KEY TOPICS", 50, topicY);

    var topics = info.keyTopics || [];
    var colors = ["#6366F1", "#8B5CF6", "#06B6D4", "#10B981", "#F59E0B", "#EF4444"];
    var colW = (W - 120) / 2;

    for (var ti = 0; ti < Math.min(topics.length, 6); ti++) {
        var col = ti % 2;
        var row = Math.floor(ti / 2);
        var tx = 50 + col * (colW + 20);
        var ty = topicY + 25 + row * 110;
        var color = colors[ti % colors.length];

        // Topic card
        ctx.fillStyle = hexToRgba(color, 0.08);
        roundRect(ctx, tx, ty, colW, 90, 12);
        ctx.fill();

        // Left accent
        ctx.fillStyle = color;
        roundRect(ctx, tx, ty, 4, 90, 2);
        ctx.fill();

        // Number badge
        ctx.fillStyle = hexToRgba(color, 0.2);
        ctx.beginPath(); ctx.arc(tx + 30, ty + 32, 16, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = color;
        ctx.font = "bold 14px 'Inter', sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(String(ti + 1), tx + 30, ty + 37);
        ctx.textAlign = "left";

        // Topic text
        ctx.fillStyle = "#E2E8F0";
        ctx.font = "600 15px 'Inter', sans-serif";
        wrapText(ctx, String(topics[ti] || "").substring(0, 60), tx + 56, ty + 35, colW - 76, 20);
    }

    // Summary section
    var summaryY = topicY + 25 + Math.ceil(Math.min(topics.length, 6) / 2) * 110 + 30;
    ctx.fillStyle = "#6366F1";
    ctx.font = "bold 13px 'Inter', sans-serif";
    ctx.fillText("SUMMARY", 50, summaryY);

    ctx.fillStyle = "rgba(99, 102, 241, 0.06)";
    roundRect(ctx, 50, summaryY + 15, W - 100, 120, 12);
    ctx.fill();
    ctx.strokeStyle = "rgba(99, 102, 241, 0.15)";
    roundRect(ctx, 50, summaryY + 15, W - 100, 120, 12);
    ctx.stroke();

    ctx.fillStyle = "#CBD5E1";
    ctx.font = "15px 'Inter', sans-serif";
    wrapText(ctx, (info.summary || "No summary available.").substring(0, 300), 70, summaryY + 50, W - 140, 22);

    // Footer
    ctx.fillStyle = "rgba(99, 102, 241, 0.3)";
    ctx.fillRect(50, H - 70, W - 100, 1);
    ctx.fillStyle = "#475569";
    ctx.font = "11px 'Inter', sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Generated by DocTalk — AI Document Intelligence  •  " + new Date().toLocaleString(), W / 2, H - 40);
    ctx.textAlign = "left";

    // Download
    var link = document.createElement("a");
    link.download = "DocTalk_Infographic_" + Date.now() + ".png";
    link.href = canvas.toDataURL("image/png");
    link.click();

    // Also show in chat
    var img = document.createElement("img");
    img.src = canvas.toDataURL("image/png");
    img.style.cssText = "max-width:100%;border-radius:12px;margin-top:8px;cursor:pointer;border:1px solid var(--border);";
    img.title = "Click to download";
    img.onclick = function() { link.click(); };

    var msgEl = document.createElement("div");
    msgEl.className = "message assistant";
    var av = document.createElement("div");
    av.className = "avatar";
    av.textContent = "\u2726";
    msgEl.appendChild(av);
    var contentDiv = document.createElement("div");
    contentDiv.className = "message-content";
    var label = document.createElement("p");
    label.innerHTML = "<strong>🎨 Document Infographic</strong>";
    contentDiv.appendChild(label);
    contentDiv.appendChild(img);

    // Download Image button
    var dlToolbar = document.createElement("div");
    dlToolbar.className = "message-toolbar";
    dlToolbar.style.opacity = "1";
    var dlBtn = document.createElement("button");
    dlBtn.className = "msg-action-btn";
    dlBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg> Download Image';
    dlBtn.title = "Download infographic as PNG";
    dlBtn.onclick = function() { link.click(); };
    dlToolbar.appendChild(dlBtn);
    contentDiv.appendChild(dlToolbar);

    msgEl.appendChild(contentDiv);
    messages.appendChild(msgEl);
    msgEl.scrollIntoView({ behavior: "smooth", block: "end" });
}

// Canvas helper: rounded rectangle
function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
}

// Canvas helper: wrap text
function wrapText(ctx, text, x, y, maxW, lineH) {
    var words = text.split(" ");
    var line = "";
    for (var n = 0; n < words.length; n++) {
        var testLine = line + words[n] + " ";
        if (ctx.measureText(testLine).width > maxW && n > 0) {
            ctx.fillText(line.trim(), x, y);
            line = words[n] + " ";
            y += lineH;
        } else {
            line = testLine;
        }
    }
    ctx.fillText(line.trim(), x, y);
}

// Helper: hex to rgba
function hexToRgba(hex, alpha) {
    var r = parseInt(hex.slice(1, 3), 16);
    var g = parseInt(hex.slice(3, 5), 16);
    var b = parseInt(hex.slice(5, 7), 16);
    return "rgba(" + r + "," + g + "," + b + "," + alpha + ")";
}


/* =========================
   INITIAL LOAD
========================= */

renderDocuments();
loadConversations();