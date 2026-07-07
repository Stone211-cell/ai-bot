const API_BASE = '/api';
let password = '';
let currentGuild = '';
let currentChannel = '';
let replyToMessageId = null;
let currentVoiceChannel = '';
let mediaRecorder = null;
let audioChunks = [];
let voiceBlob = null; // for text channel audio preview

// DOM Elements
const loginScreen = document.getElementById('login-screen');
const dashboardScreen = document.getElementById('dashboard-screen');
const pwdInput = document.getElementById('password-input');
const loginBtn = document.getElementById('login-btn');
const loginError = document.getElementById('login-error');

const guildSelector = document.getElementById('guild-selector');
const channelSelector = document.getElementById('channel-selector');
const voiceChannelSelector = document.getElementById('voice-channel-selector');
const currentChannelName = document.getElementById('current-channel-name');
const chatMessages = document.getElementById('chat-messages');

const messageInput = document.getElementById('message-input');
const sendBtn = document.getElementById('send-btn');
const attachBtn = document.getElementById('attach-btn');
const fileInput = document.getElementById('file-input');

const replyingToBar = document.getElementById('replying-to-bar');
const replyToText = document.getElementById('reply-to-text');
const cancelReplyBtn = document.getElementById('cancel-reply-btn');

const attachmentPreviewBar = document.getElementById('attachment-preview-bar');
const attachmentName = document.getElementById('attachment-name');
const cancelAttachmentBtn = document.getElementById('cancel-attachment-btn');

const joinVoiceBtn = document.getElementById('join-voice-btn');
const leaveVoiceBtn = document.getElementById('leave-voice-btn');

// Troll Panel Elements
const disguiseToggle = document.getElementById('disguise-toggle');
const villainToggle = document.getElementById('villain-toggle');
const typingToggle = document.getElementById('typing-toggle');
const spamCount = document.getElementById('spam-count');
const spamInput = document.getElementById('spam-input');
const spamStartBtn = document.getElementById('spam-start-btn');
const spamStopBtn = document.getElementById('spam-stop-btn');
const takeoverInput = document.getElementById('takeover-input');
const takeoverBtn = document.getElementById('takeover-btn');
const kickSelector = document.getElementById('kick-selector');
const kickBtn = document.getElementById('kick-btn');
const deleteChannelBtn = document.getElementById('delete-channel-btn');

const voiceStatusIndicator = document.getElementById('voice-status-indicator');
const voiceStatusText = document.getElementById('voice-status-text');

// Audio elements
const recordChatBtn = document.getElementById('record-chat-btn');
const audioPreviewBar = document.getElementById('audio-preview-bar');
const audioPlayer = document.getElementById('audio-player');
const sendAudioMsgBtn = document.getElementById('send-audio-msg-btn');
const cancelAudioBtn = document.getElementById('cancel-audio-btn');

// --- API Helpers ---
async function fetchAPI(endpoint, options = {}) {
    if (!options.headers) options.headers = {};
    options.headers['x-password'] = password;
    
    const res = await fetch(`${API_BASE}${endpoint}`, options);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'API Error');
    return data;
}

// --- Auth ---
loginBtn.addEventListener('click', async () => {
    password = pwdInput.value;
    try {
        await loadGuilds();
        loginScreen.classList.add('hidden');
        dashboardScreen.classList.remove('hidden');
    } catch (e) {
        loginError.classList.remove('hidden');
    }
});

pwdInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') loginBtn.click();
});

// --- Selectors ---
async function loadGuilds() {
    const { guilds } = await fetchAPI('/guilds');
    guildSelector.innerHTML = '<option value="">-- เลือกเซิร์ฟเวอร์ --</option>';
    guilds.forEach(g => {
        guildSelector.innerHTML += `<option value="${g.id}">${g.name}</option>`;
    });
}

guildSelector.addEventListener('change', async (e) => {
    currentGuild = e.target.value;
    channelSelector.innerHTML = '<option value="">-- เลือกห้องแชท --</option>';
    voiceChannelSelector.innerHTML = '<option value="">-- เลือกห้องเสียง --</option>';
    kickSelector.innerHTML = '<option value="">-- เลือกเหยื่อ --</option>';
    
    if (currentGuild) {
        channelSelector.disabled = false;
        voiceChannelSelector.disabled = false;
        const { channels } = await fetchAPI(`/channels/${currentGuild}`);
        
        channels.filter(c => c.type === 'text').forEach(c => {
            channelSelector.innerHTML += `<option value="${c.id}"># ${c.name}</option>`;
        });
        channels.filter(c => c.type === 'voice').forEach(c => {
            voiceChannelSelector.innerHTML += `<option value="${c.id}">🔊 ${c.name}</option>`;
        });

        // Load members for kick
        try {
            const { members } = await fetchAPI(`/troll/members/${currentGuild}`);
            kickSelector.disabled = false;
            members.forEach(m => {
                if (!m.bot) kickSelector.innerHTML += `<option value="${m.id}">${m.name}</option>`;
            });
        } catch (e) {}

        // Start voice polling
        if (!voicePollInterval) voicePollInterval = setInterval(pollVoiceStatus, 5000);
    } else {
        channelSelector.disabled = true;
        voiceChannelSelector.disabled = true;
        kickSelector.disabled = true;
        if (voicePollInterval) {
            clearInterval(voicePollInterval);
            voicePollInterval = null;
        }
    }
});

let chatInterval;
let typingInterval;
channelSelector.addEventListener('change', (e) => {
    currentChannel = e.target.value;
    if (currentChannel) {
        currentChannelName.textContent = channelSelector.options[channelSelector.selectedIndex].text;
        messageInput.disabled = false;
        sendBtn.disabled = false;
        spamStartBtn.disabled = false;
        deleteChannelBtn.disabled = false;
        loadChat();
        if (chatInterval) clearInterval(chatInterval);
        chatInterval = setInterval(loadChat, 3000);
    } else {
        messageInput.disabled = true;
        sendBtn.disabled = true;
        spamStartBtn.disabled = true;
        deleteChannelBtn.disabled = true;
        if (chatInterval) clearInterval(chatInterval);
        chatMessages.innerHTML = `
            <div class="empty-state">
                <i class="fa-regular fa-comments"></i>
                <p>เลือกห้องแชทเพื่อดูข้อความ</p>
            </div>
        `;
    }
});

// --- Chat View ---
async function loadChat() {
    if (!currentChannel) return;
    try {
        const { messages } = await fetchAPI(`/messages/${currentChannel}`);
        renderChat(messages);
    } catch (e) {
        console.error("Failed to load chat", e);
    }
}

function renderChat(messages) {
    const isScrolledToBottom = chatMessages.scrollHeight - chatMessages.clientHeight <= chatMessages.scrollTop + 50;
    
    let html = '';
    messages.forEach(m => {
        const isSelf = m.author.username === 'urmomisbot' || m.author.username.includes('bot'); 
        const time = new Date(m.timestamp).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
        
        let attachmentsHtml = '';
        if (m.attachments && m.attachments.length > 0) {
            m.attachments.forEach(url => {
                attachmentsHtml += `<img src="${url}" class="message-attachment" alt="Attachment">`;
            });
        }

        let replyHtml = '';
        if (m.isReply) {
            const repliedMsg = messages.find(msg => msg.id === m.isReply);
            if (repliedMsg) {
                replyHtml = `<div class="reply-reference"><i class="fa-solid fa-reply"></i> ${repliedMsg.author.username}: ${repliedMsg.content}</div>`;
            }
        }

        let contentSafe = m.content.replace(/</g, "&lt;").replace(/>/g, "&gt;");
        contentSafe = contentSafe.replace(/\n/g, "<br>");
        // Basic code block formatting (not full markdown but enough for visibility)
        contentSafe = contentSafe.replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>');

        html += `
            <div class="message ${isSelf ? 'self' : ''}">
                <img src="${m.author.avatar || 'https://cdn.discordapp.com/embed/avatars/0.png'}" class="avatar">
                <div class="message-content">
                    <div class="message-header">
                        <span class="message-author">${m.author.username}</span>
                        <span class="message-time">${time}</span>
                    </div>
                    <div class="message-bubble" onclick="${!isSelf ? `prepareReply('${m.id}', '${m.content.replace(/'/g, "\\'")}')` : ''}">
                        ${replyHtml}
                        ${contentSafe}
                        ${attachmentsHtml}
                    </div>
                </div>
            </div>
        `;
    });
    
    chatMessages.innerHTML = html;
    
    if (isScrolledToBottom) {
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }
}

// --- Reply & Attachments ---
window.prepareReply = (msgId, content) => {
    replyToMessageId = msgId;
    replyingToBar.classList.remove('hidden');
    replyToText.textContent = content;
    messageInput.focus();
};

cancelReplyBtn.addEventListener('click', () => {
    replyToMessageId = null;
    replyingToBar.classList.add('hidden');
});

attachBtn.addEventListener('click', () => fileInput.click());

fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
        attachmentPreviewBar.classList.remove('hidden');
        attachmentName.textContent = e.target.files[0].name;
    }
});

cancelAttachmentBtn.addEventListener('click', () => {
    fileInput.value = '';
    attachmentPreviewBar.classList.add('hidden');
});

// --- Send Message ---
async function sendMessage() {
    const text = messageInput.value.trim();
    const file = fileInput.files[0];
    
    if (!text && !file) return;
    
    messageInput.disabled = true;
    sendBtn.disabled = true;
    
    try {
        const formData = new FormData();
        formData.append('channelId', currentChannel);
        if (text) formData.append('content', text);
        if (replyToMessageId) formData.append('replyTo', replyToMessageId);
        if (file) formData.append('file', file);

        await fetch(`${API_BASE}/send`, {
            method: 'POST',
            headers: { 'x-password': password },
            body: formData
        });
        
        messageInput.value = '';
        messageInput.style.height = 'auto'; // reset textarea height
        fileInput.value = '';
        cancelReplyBtn.click();
        cancelAttachmentBtn.click();
        loadChat();
    } catch (e) {
        alert("ส่งข้อความไม่สำเร็จ");
    } finally {
        messageInput.disabled = false;
        sendBtn.disabled = false;
        messageInput.focus();
    }
}

sendBtn.addEventListener('click', sendMessage);
messageInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
});

// Auto resize textarea
messageInput.addEventListener('input', function() {
    this.style.height = 'auto';
    this.style.height = (this.scrollHeight) + 'px';
    if(this.scrollHeight > 150) {
        this.style.overflowY = 'auto';
        this.style.height = '150px';
    } else {
        this.style.overflowY = 'hidden';
    }
});

// --- Voice Polling (Follow /joinmom) ---
let voicePollInterval;
async function pollVoiceStatus() {
    if (!currentGuild) return;
    try {
        const { channelId } = await fetchAPI(`/voice/status/${currentGuild}`);
        if (channelId && currentVoiceChannel !== channelId) {
            // บอทย้ายห้อง หรือมีคนใช้ joinmom
            currentVoiceChannel = channelId;
            voiceChannelSelector.value = channelId;
            joinVoiceBtn.classList.add('hidden');
            leaveVoiceBtn.classList.remove('hidden');
            voiceStatusIndicator.style.color = 'var(--accent-color)';
            
            // หาชื่อห้อง
            const option = Array.from(voiceChannelSelector.options).find(o => o.value === channelId);
            voiceStatusText.textContent = `เชื่อมต่อแล้ว: ${option ? option.text : 'Unknown'}`;
        } else if (!channelId) {
            currentVoiceChannel = '';
            voiceChannelSelector.value = '';
            joinVoiceBtn.classList.remove('hidden');
            leaveVoiceBtn.classList.add('hidden');
            voiceStatusIndicator.style.color = 'var(--text-secondary)';
            voiceStatusText.textContent = 'ไม่ได้อยู่ในห้องเสียง';
            joinVoiceBtn.disabled = true;
        }
    } catch (e) {}
}

// --- Voice Control ---
voiceChannelSelector.addEventListener('change', (e) => {
    currentVoiceChannel = e.target.value;
    joinVoiceBtn.disabled = !currentVoiceChannel;
});

joinVoiceBtn.addEventListener('click', async () => {
    try {
        joinVoiceBtn.disabled = true;
        await fetchAPI('/voice/join', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ channelId: currentVoiceChannel })
        });
        
        joinVoiceBtn.classList.add('hidden');
        leaveVoiceBtn.classList.remove('hidden');
        pollVoiceStatus(); // update immediately
    } catch (e) {
        alert("เข้าห้องเสียงไม่สำเร็จ");
        joinVoiceBtn.disabled = false;
    }
});

leaveVoiceBtn.addEventListener('click', async () => {
    try {
        await fetchAPI('/voice/leave', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ guildId: currentGuild })
        });
        
        leaveVoiceBtn.classList.add('hidden');
        joinVoiceBtn.classList.remove('hidden');
        joinVoiceBtn.disabled = false;
        pollVoiceStatus();
    } catch (e) {
        console.error(e);
    }
});

// --- Audio Record for Chat (Voice Message) ---
let chatMediaRecorder = null;
let chatAudioChunks = [];
let isRecordingChat = false;

recordChatBtn.addEventListener('click', async () => {
    if (isRecordingChat) {
        // Stop recording
        if (chatMediaRecorder && chatMediaRecorder.state === 'recording') {
            chatMediaRecorder.stop();
        }
        recordChatBtn.classList.remove('recording');
        isRecordingChat = false;
        return;
    }

    // Start recording
    if (!navigator.mediaDevices) {
        alert("บราวเซอร์ไม่รองรับไมค์");
        return;
    }
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        chatMediaRecorder = new MediaRecorder(stream);
        chatAudioChunks = [];

        chatMediaRecorder.addEventListener('dataavailable', event => {
            chatAudioChunks.push(event.data);
        });

        chatMediaRecorder.addEventListener('stop', () => {
            voiceBlob = new Blob(chatAudioChunks, { type: 'audio/webm' });
            stream.getTracks().forEach(track => track.stop());
            
            const audioUrl = URL.createObjectURL(voiceBlob);
            audioPlayer.src = audioUrl;
            audioPreviewBar.classList.remove('hidden');
        });

        chatMediaRecorder.start();
        recordChatBtn.classList.add('recording');
        isRecordingChat = true;
    } catch (e) {
        console.error(e);
        alert("เข้าถึงไมค์ไม่ได้");
    }
});

cancelAudioBtn.addEventListener('click', () => {
    voiceBlob = null;
    audioPreviewBar.classList.add('hidden');
    audioPlayer.src = '';
});

sendAudioMsgBtn.addEventListener('click', async () => {
    if (!voiceBlob || !currentChannel) return;

    sendAudioMsgBtn.disabled = true;
    try {
        const formData = new FormData();
        formData.append('channelId', currentChannel);
        formData.append('audio', voiceBlob, 'voicemessage.webm');

        await fetch(`${API_BASE}/voice/message`, {
            method: 'POST',
            headers: { 'x-password': password },
            body: formData
        });

        cancelAudioBtn.click();
        loadChat();
    } catch (e) {
        alert("ส่งข้อความเสียงไม่สำเร็จ");
    } finally {
        sendAudioMsgBtn.disabled = false;
    }
});

// --- Troll Panel Controls ---
async function updateTrollState() {
    try {
        console.log("Updating troll state:", disguiseToggle.checked, villainToggle.checked);
        const res = await fetchAPI('/troll/state', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                disguiseMode: disguiseToggle.checked,
                villainMode: villainToggle.checked
            })
        });
        console.log("State updated:", res);
    } catch (e) {
        console.error("Failed to sync troll state", e);
    }
}

disguiseToggle.addEventListener('change', updateTrollState);
villainToggle.addEventListener('change', updateTrollState);

typingToggle.addEventListener('change', (e) => {
    if (e.target.checked) {
        if (typingInterval) clearInterval(typingInterval);
        typingInterval = setInterval(() => {
            if (currentChannel) {
                fetchAPI('/troll/typing', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ channelId: currentChannel })
                });
            }
        }, 8000); // Send typing indicator every 8 seconds
    } else {
        if (typingInterval) clearInterval(typingInterval);
    }
});

spamStartBtn.addEventListener('click', async () => {
    const count = spamCount.value || 10;
    const text = spamInput.value;
    if (!text || !currentChannel) return;

    try {
        await fetchAPI('/troll/spam', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ channelId: currentChannel, text, count })
        });
        spamStartBtn.classList.add('hidden');
        spamStopBtn.classList.remove('hidden');
    } catch (e) {
        alert("เริ่มสแปมไม่สำเร็จ");
    }
});

spamStopBtn.addEventListener('click', async () => {
    try {
        await fetchAPI('/troll/stop-spam', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ channelId: currentChannel })
        });
        spamStopBtn.classList.add('hidden');
        spamStartBtn.classList.remove('hidden');
    } catch (e) {
        alert("หยุดสแปมไม่สำเร็จ");
    }
});

// --- Double Confirm Utility ---
function makeDoubleConfirm(btnElement, confirmText, actionCallback) {
    let isConfirming = false;
    let timeout;
    const originalHtml = btnElement.innerHTML;
    
    btnElement.addEventListener('click', () => {
        if (!isConfirming) {
            isConfirming = true;
            btnElement.innerHTML = `⚠️ ${confirmText}`;
            btnElement.classList.add('confirming');
            timeout = setTimeout(() => {
                isConfirming = false;
                btnElement.innerHTML = originalHtml;
                btnElement.classList.remove('confirming');
            }, 3000);
        } else {
            clearTimeout(timeout);
            isConfirming = false;
            btnElement.innerHTML = originalHtml;
            btnElement.classList.remove('confirming');
            actionCallback();
        }
    });
}

// Attach double confirms
makeDoubleConfirm(takeoverBtn, 'กดยืนยันอีกครั้ง!', async () => {
    if (!currentGuild) return;
    const customText = takeoverInput.value.trim();
    if (!customText) {
        alert("กรุณาพิมพ์ข้อความประกาศด้วยครับ");
        return;
    }
    
    try {
        await fetchAPI('/troll/takeover', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ guildId: currentGuild, message: customText })
        });
        alert("ประกาศส่งไปทุกห้องแล้ว!");
        takeoverInput.value = '';
    } catch (e) {
        alert("ประกาศไม่สำเร็จ");
    }
});

kickSelector.addEventListener('change', (e) => {
    kickBtn.disabled = !e.target.value;
});

makeDoubleConfirm(kickBtn, 'เตะแน่ใจนะ?', async () => {
    const memberId = kickSelector.value;
    if (!memberId || !currentGuild) return;
    
    try {
        await fetchAPI('/troll/kick', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ guildId: currentGuild, memberId })
        });
        alert("เตะสำเร็จ!");
        guildSelector.dispatchEvent(new Event('change'));
    } catch (e) {
        alert("เตะไม่สำเร็จ บอทอาจยศต่ำกว่า");
    }
});

makeDoubleConfirm(deleteChannelBtn, 'ระเบิดห้อง! ยืนยัน?', async () => {
    if (!currentChannel) return;
    
    try {
        await fetchAPI('/troll/delete-channel', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ channelId: currentChannel })
        });
        alert("ลบห้องทิ้งแล้ว!");
        guildSelector.dispatchEvent(new Event('change'));
    } catch (e) {
        alert("ลบห้องไม่สำเร็จ");
    }
});
