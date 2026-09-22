const API_URL = "http://127.0.0.1:8000";

let uploadedDocuments = [];
let selectedDocumentIds = new Set();
let busy = false;
let currentConversationId = null;
let conversations = [];

const $ = (id) => document.getElementById(id);

const messages = $("messages");
const welcomeScreen = $("welcomeScreen");
const messageInput = $("messageInput");
const sendBtn = $("sendBtn");
const uploadInput = $("document-upload");
const uploadStatus = $("upload-status");
const progress = $("document-upload-progress");
const list = $("uploaded-documents-list");
const count = $("document-count");
const compareBtn = $("compare-selected-btn");
const comparisonPanel = $("comparisonPanel");
const chatArea = $("chatArea");
const insightsPanel = $("insightsPanel");
const conversationList = $("conversationList");


/* =========================
   HELPER FUNCTIONS
========================= */

function escapeHtml(value) {
    return String(value ?? "").replace(
        /[&<>"']/g,
        (c) => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#039;"
        }[c])
    );
}


function setStatus(text, error = false) {
    if (uploadStatus) {
        uploadStatus.textContent = text;
        uploadStatus.classList.toggle("error", error);
    }
}


function addMessage(text, role = "assistant") {
    if (!messages) return;

    if (welcomeScreen) {
        welcomeScreen.style.display = "none";
    }

    messages.style.display = "flex";

    const el = document.createElement("div");
    el.className = `message ${role}`;

    if (role === "assistant") {
        const avatar = document.createElement("div");
        avatar.className = "avatar";
        avatar.textContent = "✦";
        el.appendChild(avatar);
    }

    const content = document.createElement("div");
    content.className = "message-content";
    content.textContent = text;

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
        .forEach((x) => {
            x.classList.toggle("active", x.dataset.target === id);
        });

    if (chatArea) {
        chatArea.style.display =
            id === "comparisonPanel" ? "none" : "block";
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

    if (welcomeScreen) {
        welcomeScreen.style.display =
            id === "chatArea" ? "block" : "none";
    }
}


document
    .querySelectorAll(".sidebar-item[data-target]")
    .forEach((x) => {
        x.addEventListener("click", () => {
            showWorkspace(x.dataset.target);
        });
    });


/* =========================
   CHAT HISTORY
========================= */

async function loadConversations() {
    try {
        const response = await fetch(`${API_URL}/conversations`);
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
    
    conversationList.innerHTML = conversations.map(c => `
        <li class="conversation-item ${c.conversation_id === currentConversationId ? 'active' : ''}" 
            data-id="${escapeHtml(c.conversation_id)}" 
            title="${escapeHtml(c.title)}">
            ${escapeHtml(c.title)}
        </li>
    `).join("");

    conversationList.querySelectorAll(".conversation-item").forEach(item => {
        item.addEventListener("click", () => {
            loadConversation(item.dataset.id);
        });
    });
}

async function loadConversation(id) {
    if (busy) return;
    busy = true;

    try {
        const response = await fetch(`${API_URL}/conversations/${id}`);
        if (!response.ok) throw new Error("Failed to load chat");
        
        const data = await response.json();
        
        currentConversationId = data.conversation_id;
        messages.innerHTML = "";
        welcomeScreen.style.display = "none";
        messages.style.display = "flex";
        showWorkspace("chatArea");

        // Restore messages
        data.messages.forEach(msg => {
            const el = document.createElement("div");
            el.className = `message ${msg.role}`;
            if (msg.role === "assistant") {
                const avatar = document.createElement("div");
                avatar.className = "avatar";
                avatar.textContent = "✦";
                el.appendChild(avatar);
            }
            const content = document.createElement("div");
            content.className = "message-content";
            content.textContent = msg.content;
            el.appendChild(content);
            messages.appendChild(el);
        });
        
        // Scroll to bottom
        const lastEl = messages.lastElementChild;
        if (lastEl) lastEl.scrollIntoView({ behavior: "smooth", block: "end" });

        // Restore document IDs
        // We will fetch document metadata to populate uploadedDocuments properly
        uploadedDocuments = [];
        selectedDocumentIds = new Set();
        
        for (const docId of data.document_ids) {
            try {
                const docRes = await fetch(`${API_URL}/documents/${docId}`);
                if (docRes.ok) {
                    const docData = await docRes.json();
                    uploadedDocuments.push({
                        id: docData.document_id,
                        filename: docData.filename,
                        page_count: docData.page_count,
                        characters: docData.character_count
                    });
                }
            } catch (e) {
                console.error("Failed to restore document:", docId, e);
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
    
    const docArea = document.getElementById("uploaded-documents-area");
    if (docArea) {
        docArea.style.display = uploadedDocuments.length ? "block" : "none";
    }

    count.textContent =
        `${uploadedDocuments.length} document${
            uploadedDocuments.length === 1 ? "" : "s"
        } uploaded`;

    compareBtn.disabled =
        selectedDocumentIds.size < 2 ||
        selectedDocumentIds.size > 2;

    list.innerHTML =
        uploadedDocuments.length
            ? uploadedDocuments
                  .map(
                      (doc) => `
        <article class="uploaded-document-card">

            <label>
                <input
                    type="checkbox"
                    data-doc-id="${escapeHtml(doc.id)}"
                    ${
                        selectedDocumentIds.has(doc.id)
                            ? "checked"
                            : ""
                    }
                >

                <strong>
                    ${escapeHtml(doc.filename)}
                </strong>
            </label>

            <small>
                ${
                    doc.page_count
                        ? `${doc.page_count} pages`
                        : "Document"
                }
                ·
                ${Number(doc.characters || 0).toLocaleString()}
                characters
            </small>

        </article>
        `
                  )
                  .join("")
            : `
        <p class="empty-state">
            Upload PDF, DOCX, or TXT files to see them here.
        </p>
        `;

    list
        .querySelectorAll("input[data-doc-id]")
        .forEach((box) => {

            box.addEventListener("change", () => {

                if (box.checked) {
                    selectedDocumentIds.add(box.dataset.docId);
                } else {
                    selectedDocumentIds.delete(box.dataset.docId);
                }

                renderDocuments();
            });
        });
}


/* =========================
   UPLOAD DOCUMENT
========================= */

async function uploadFile(file) {

    const form = new FormData();

    form.append("file", file);

    const response = await fetch(
        `${API_URL}/upload`,
        {
            method: "POST",
            body: form
        }
    );

    const data =
        await response.json().catch(() => ({}));

    if (!response.ok) {
        throw new Error(
            data.detail ||
            `Upload failed (${response.status})`
        );
    }

    // Store the document_id returned by the backend
    // so the /chat endpoint knows which documents
    // belong to this session.
    if (data.document_id) {
        data.id = data.document_id;
    }

    return data;
}


if (uploadInput) {

    uploadInput.addEventListener(
        "change",
        async () => {

            const files = [...uploadInput.files];

            if (!files.length) return;

            setStatus(
                `Uploading ${files.length} file${
                    files.length > 1 ? "s" : ""
                }…`
            );

            progress.textContent = "";

            for (let i = 0; i < files.length; i++) {

                try {

                    const doc =
                        await uploadFile(files[i]);

                    uploadedDocuments.push(doc);

                    progress.textContent =
                        `Uploaded ${i + 1} of ${files.length}: ${files[i].name}`;

                } catch (e) {

                    progress.textContent =
                        `Could not upload ${files[i].name}: ${e.message}`;
                }
            }

            renderDocuments();

            setStatus("Upload complete.");

            uploadInput.value = "";
        }
    );
}


/* =========================
   CHAT
========================= */

async function sendMessage() {

    const message =
        messageInput?.value.trim();

    if (!message || busy) return;

    busy = true;

    if (sendBtn) {
        sendBtn.disabled = true;
    }

    addMessage(message, "user");

    messageInput.value = "";


    /* Typing indicator */

    const typing =
        document.createElement("div");

    typing.className = "message assistant";
    typing.id = "typingMessage";
    typing.textContent = "DocTalk is thinking…";

    messages.appendChild(typing);


    try {

        /*
         * SESSION-SCOPED CHAT:
         *
         * Backend expects a JSON body with:
         * {
         *     "message": "...",
         *     "document_ids": ["id1", "id2"]
         * }
         *
         * Only the documents uploaded in THIS session
         * are sent. The backend will not use any other
         * documents.
         */

        const sessionDocIds =
            uploadedDocuments
                .filter((d) => d.id || d.document_id)
                .map((d) => d.id || d.document_id);

        const response =
            await fetch(
                `${API_URL}/chat`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type":
                            "application/json"
                    },
                    body: JSON.stringify({
                        message: message,
                        document_ids: sessionDocIds,
                        conversation_id: currentConversationId
                    })
                }
            );


        const data =
            await response
                .json()
                .catch(() => ({}));


        if (!response.ok) {

            throw new Error(
                data.detail ||
                `Request failed (${response.status})`
            );
        }


        if (data.conversation_id) {
            if (!currentConversationId) {
                currentConversationId = data.conversation_id;
            }
            // Refresh conversation list to show the new title or updated timestamp
            loadConversations();
        }

        addMessage(
            data.response ||
            data.answer ||
            data.message ||
            "No response returned."
        );


    } catch (e) {

        console.error("Chat error:", e);

        addMessage(
            `Sorry, the request failed: ${e.message}.`
        );

    } finally {

        $("typingMessage")?.remove();

        busy = false;

        if (sendBtn) {
            sendBtn.disabled = false;
        }

        messageInput?.focus();
    }
}


/* =========================
   CHAT BUTTON / ENTER
========================= */

sendBtn?.addEventListener(
    "click",
    sendMessage
);


messageInput?.addEventListener(
    "keydown",
    (e) => {

        if (
            e.key === "Enter" &&
            !e.shiftKey
        ) {

            e.preventDefault();

            sendMessage();
        }
    }
);


/* =========================
   SUGGESTION CARDS
========================= */

document
    .querySelectorAll(".suggestion-card")
    .forEach((x) => {

        x.addEventListener(
            "click",
            () => {

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
    () => {

        messages.innerHTML = "";

        welcomeScreen.style.display = "block";

        showWorkspace("chatArea");

        /*
         * SESSION-SCOPE: Clear the current session's
         * document list when starting a new conversation.
         *
         * Historical documents remain stored in the
         * backend's metadata store / My Documents —
         * they are just not in the active session.
         */
        uploadedDocuments = [];
        selectedDocumentIds = new Set();
        currentConversationId = null;
        if (progress) progress.textContent = "";
        renderDocuments();
        renderConversations(); // Remove active state

        messageInput.focus();
    }
);


/* =========================
   DOCUMENT COMPARISON
========================= */

compareBtn?.addEventListener(
    "click",
    async () => {

        if (
            selectedDocumentIds.size !== 2 ||
            busy
        ) {
            return;
        }

        busy = true;

        compareBtn.disabled = true;

        showWorkspace("comparisonPanel");


        const selected =
            uploadedDocuments.filter(
                (d) =>
                    selectedDocumentIds.has(d.id)
            );


        const result =
            comparisonPanel.querySelector(
                ".comparison-result"
            ) ||
            document.createElement("div");


        result.className =
            "comparison-result";

        result.textContent =
            "Comparing documents…";

        comparisonPanel.appendChild(result);


        try {

            const response =
                await fetch(
                    `${API_URL}/compare`,
                    {
                        method: "POST",

                        headers: {
                            "Content-Type":
                                "application/json"
                        },

                        body: JSON.stringify({
                            documents:
                                selected.map(
                                    (d) => ({
                                        id: d.id,
                                        filename:
                                            d.filename
                                    })
                                )
                        })
                    }
                );


            const data =
                await response
                    .json()
                    .catch(() => ({}));


            if (!response.ok) {

                throw new Error(
                    data.detail ||
                    `Comparison failed (${response.status})`
                );
            }


            result.textContent =
                data.response ||
                data.comparison ||
                JSON.stringify(
                    data,
                    null,
                    2
                );


        } catch (e) {

            result.textContent =
                `Comparison failed: ${e.message}`;

        } finally {

            busy = false;

            renderDocuments();
        }
    }
);


/* =========================
   INITIAL LOAD
========================= */

renderDocuments();
loadConversations();