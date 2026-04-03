'use strict';

const { Plugin, PluginSettingTab, Setting, requestUrl, MarkdownView } = require('obsidian');

// ─── Constants ────────────────────────────────────────────────────────────────

const SECRET_KEY = 'ai-buddy-api-key';

const DEFAULT_SETTINGS = {
    apiProvider: 'claude',
    model: 'claude-haiku-4-5-20251001',
    buddyName: 'Chip',
    showBuddy: true,
    systemPrompt: `You are Chip, a friendly AI assistant living inside the user's Obsidian vault. You help with note-taking, writing, brainstorming, and thinking through ideas. Be warm, concise, and genuinely helpful. When given context about the current note, reference it naturally.`,
    proactiveTips: true,
    tipIntervalMinutes: 8,
    tipPrompt: `Give a short, insightful observation or question about the note. Be specific — reference actual content.`,
    chatDirection: 'below',          // 'above' | 'below'
    showNameTag: true,               // show/hide name below avatar
    avatarPath: '',                  // vault-relative path or URL to custom avatar image (GIF/PNG/etc), empty = default SVG
    gifSpeed: 1.0,                   // GIF playback speed multiplier (0.25–4×)
    savedPosition: null,             // null = default corner; {fromRight, fromBottom} when dragged
};

const PROACTIVE_TIPS = [
    "It looks like you're working on something interesting. Need help structuring your thoughts?",
    "Want me to summarize the key points from your current note?",
    "I can help you brainstorm related ideas for what you're working on!",
    "Need help finding connections between your notes? Just ask!",
    "I'm here if you want a second opinion on anything you're writing.",
    "Want me to help you outline your next steps on this topic?",
];

// ─── SVG Avatar ───────────────────────────────────────────────────────────────

const BUDDY_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 110" width="64" height="64" class="ai-buddy-svg">
  <ellipse cx="50" cy="107" rx="22" ry="5" fill="rgba(0,0,0,0.15)"/>
  <rect x="22" y="48" width="56" height="48" rx="12" fill="#7c6af7"/>
  <rect x="22" y="48" width="56" height="16" rx="6" fill="#8e7ef8"/>
  <rect x="32" y="68" width="36" height="20" rx="6" fill="#6355d4" opacity="0.6"/>
  <circle cx="42" cy="75" r="4" fill="#c4b8ff" opacity="0.85"/>
  <circle cx="58" cy="75" r="4" fill="#c4b8ff" opacity="0.85"/>
  <rect x="36" y="82" width="28" height="4" rx="2" fill="#c4b8ff" opacity="0.5"/>
  <rect x="4" y="52" width="18" height="11" rx="5.5" fill="#7c6af7"/>
  <rect x="78" y="52" width="18" height="11" rx="5.5" fill="#7c6af7"/>
  <circle cx="9" cy="57" r="5" fill="#9b8ff8"/>
  <circle cx="91" cy="57" r="5" fill="#9b8ff8"/>
  <rect x="17" y="6" width="66" height="48" rx="14" fill="#9b8ff8"/>
  <rect x="22" y="8" width="56" height="16" rx="10" fill="rgba(255,255,255,0.1)"/>
  <circle cx="17" cy="24" r="5" fill="#8075e8"/>
  <circle cx="83" cy="24" r="5" fill="#8075e8"/>
  <circle cx="17" cy="24" r="2.5" fill="#c4b8ff" opacity="0.7"/>
  <circle cx="83" cy="24" r="2.5" fill="#c4b8ff" opacity="0.7"/>
  <rect x="44" y="0" width="12" height="10" rx="4" fill="#8075e8"/>
  <circle cx="50" cy="-2" r="6" fill="#c4b8ff"/>
  <circle cx="50" cy="-2" r="3" fill="white" opacity="0.8" class="antenna-glow"/>
  <g class="eyes-open">
    <rect x="28" y="20" width="18" height="16" rx="8" fill="white"/>
    <rect x="54" y="20" width="18" height="16" rx="8" fill="white"/>
    <circle cx="37" cy="28" r="5" fill="#2d2d3a"/>
    <circle cx="63" cy="28" r="5" fill="#2d2d3a"/>
    <circle cx="39" cy="25.5" r="2" fill="white"/>
    <circle cx="65" cy="25.5" r="2" fill="white"/>
  </g>
  <g class="eyes-blink" style="display:none;">
    <rect x="28" y="27" width="18" height="4" rx="2" fill="#2d2d3a"/>
    <rect x="54" y="27" width="18" height="4" rx="2" fill="#2d2d3a"/>
  </g>
  <path d="M 36 42 Q 50 52 64 42" stroke="white" stroke-width="2.5" fill="none" stroke-linecap="round"/>
</svg>`;

// ─── GIF Player ───────────────────────────────────────────────────────────────
// Minimal GIF89a decoder that renders frames onto a canvas with custom speed.

class GifPlayer {
    constructor(canvas, speed = 1.0) {
        this.canvas  = canvas;
        this.ctx     = canvas.getContext('2d');
        this.speed   = Math.max(0.1, speed);
        this.frames  = [];
        this.idx     = 0;
        this._active = false;
        this._timer  = null;
    }

    async load(src, fetcher) {
        try {
            const data = await fetcher(src);
            this.frames = GifPlayer.parse(data);
            if (this.frames.length === 0) return;
            this.canvas.width  = this.frames[0].w;
            this.canvas.height = this.frames[0].h;
            this._active = true;
            this._tick();
        } catch (e) {
            console.warn('AI Buddy: GIF load failed', e);
        }
    }

    _tick() {
        if (!this._active || this.frames.length === 0) return;
        const frame = this.frames[this.idx];
        this.ctx.putImageData(frame.img, 0, 0);
        const delay = Math.max(20, frame.delay / this.speed);
        this._timer = setTimeout(() => {
            this.idx = (this.idx + 1) % this.frames.length;
            this._tick();
        }, delay);
    }

    setSpeed(s) { this.speed = Math.max(0.1, s); }
    destroy()   { this._active = false; clearTimeout(this._timer); this._timer = null; }

    // ── GIF89a parser ──────────────────────────────────────────────────────────

    static parse(data) {
        const frames = [];
        let pos = 6; // skip "GIFxxa"
        const u16 = () => { const v = data[pos] | (data[pos+1] << 8); pos += 2; return v; };

        const screenW = u16(), screenH = u16();
        const packed  = data[pos++];
        pos += 2; // bg color index, pixel aspect ratio

        let gct = null;
        if ((packed >> 7) & 1) {
            const n = 3 * (2 << (packed & 0x7));
            gct = data.subarray(pos, pos + n);
            pos += n;
        }

        // Shared composition canvas
        const comp    = document.createElement('canvas');
        comp.width    = screenW; comp.height = screenH;
        const compCtx = comp.getContext('2d');

        let delay = 100, transIdx = -1, disposal = 0;

        while (pos < data.length) {
            const b = data[pos++];
            if (b === 0x3B) break; // trailer

            if (b === 0x21) { // extension
                const label = data[pos++];
                if (label === 0xF9 && data[pos++] === 4) { // Graphic Control Extension
                    const gce = data[pos++];
                    disposal  = (gce >> 3) & 0x7;
                    const hasT = gce & 1;
                    delay     = u16() * 10; // 1/100s → ms
                    transIdx  = hasT ? data[pos++] : -1;
                    if (!hasT) pos++;
                    pos++; // block terminator
                } else {
                    while (true) { const sz = data[pos++]; if (sz === 0) break; pos += sz; }
                }
                continue;
            }

            if (b === 0x2C) { // image descriptor
                const iLeft = u16(), iTop = u16(), iW = u16(), iH = u16();
                const ip    = data[pos++];
                let ct = gct;
                if ((ip >> 7) & 1) {
                    const n = 3 * (2 << (ip & 0x7));
                    ct = data.subarray(pos, pos + n);
                    pos += n;
                }
                const lzwMin = data[pos++];
                const raw = [];
                while (true) { const sz = data[pos++]; if (sz === 0) break; for (let i = 0; i < sz; i++) raw.push(data[pos++]); }
                if (!ct) { delay = 100; transIdx = -1; disposal = 0; continue; }

                const indices = GifPlayer.lzw(lzwMin, raw);
                const pixels  = new Uint8ClampedArray(iW * iH * 4);
                const rows    = (ip >> 6) & 1 ? GifPlayer.deinterlace(iH) : Array.from({length: iH}, (_, i) => i);

                let si = 0;
                for (const row of rows) {
                    for (let x = 0; x < iW; x++) {
                        const ci = indices[si++];
                        if (ci === transIdx) { pixels[(row * iW + x) * 4 + 3] = 0; continue; }
                        const c = ci * 3, p = (row * iW + x) * 4;
                        pixels[p] = ct[c]; pixels[p+1] = ct[c+1]; pixels[p+2] = ct[c+2]; pixels[p+3] = 255;
                    }
                }

                if (disposal === 2) compCtx.clearRect(iLeft, iTop, iW, iH);
                compCtx.putImageData(new ImageData(pixels, iW, iH), iLeft, iTop);
                frames.push({ img: compCtx.getImageData(0, 0, screenW, screenH), delay: delay || 100, w: screenW, h: screenH });
                if (frames.length >= 200) break; // safety cap
                delay = 100; transIdx = -1; disposal = 0;
                continue;
            }
            break; // unknown block
        }
        return frames;
    }

    static deinterlace(h) {
        const rows = [];
        for (const [start, step] of [[0,8],[4,8],[2,4],[1,2]])
            for (let y = start; y < h; y += step) rows.push(y);
        return rows;
    }

    static lzw(minSize, data) {
        const clear = 1 << minSize, eoi = clear + 1;
        const tbl = [];
        let cs, next, prev;
        const init = () => {
            tbl.length = 0;
            for (let i = 0; i < clear; i++) tbl[i] = [i];
            tbl[clear] = []; tbl[eoi] = [];
            cs = minSize + 1; next = eoi + 1; prev = -1;
        };
        init();
        const out = [];
        let bits = 0, nb = 0, di = 0;
        while (di < data.length || nb >= cs) {
            while (nb < cs && di < data.length) { bits |= data[di++] << nb; nb += 8; }
            if (nb < cs) break;
            const code = bits & ((1 << cs) - 1);
            bits >>= cs; nb -= cs;
            if (code === eoi) break;
            if (code === clear) { init(); continue; }
            const entry = code < next ? tbl[code] : (prev >= 0 ? [...tbl[prev], tbl[prev][0]] : []);
            for (const v of entry) out.push(v);
            if (prev >= 0 && next < 4096) {
                tbl[next++] = [...tbl[prev], entry[0]];
                if (next === (1 << cs) && cs < 12) cs++;
            }
            prev = code;
        }
        return out;
    }
}

// ─── Main Plugin Class ─────────────────────────────────────────────────────────

class AiBuddyPlugin extends Plugin {
    settings = {};
    buddyEl = null;
    chatEl = null;
    chatMessages = [];
    tipTimer = null;
    blinkTimer = null;
    isThinking = false;
    pendingTip        = null;
    highlightEl       = null;
    _trackingListener = null;
    _lastActivity     = 0;   // timestamp of last editor keystroke
    _gifPlayer        = null;
    _apiKey           = '';  // held in memory only — persisted via secretStorage

    async onload() {
        await this.loadSettings();
        this.addSettingTab(new AiBuddySettingTab(this.app, this));

        this.addCommand({
            id: 'toggle-ai-buddy',
            name: 'Toggle AI Buddy',
            callback: () => this.toggleBuddy(),
        });

        this.addCommand({
            id: 'reset-ai-buddy-position',
            name: 'Reset AI Buddy position',
            callback: () => {
                this.settings.savedPosition = null;
                this.saveSettings();
                this.updateBuddyPosition();
            },
        });

        this.addCommand({
            id: 'open-ai-buddy-chat',
            name: 'Open AI Buddy chat',
            callback: () => {
                if (!this.buddyEl) this.createBuddy();
                this.openChat();
            },
        });

        // Track editor activity so proactive tips only fire while the user is active
        this.registerEvent(this.app.workspace.on('editor-change', () => {
            this._lastActivity = Date.now();
        }));

        this.app.workspace.onLayoutReady(() => {
            if (this.settings.showBuddy) this.createBuddy();
        });
    }

    onunload() {
        this.removeBuddy();
    }

    // ─── Buddy Lifecycle ───────────────────────────────────────────────────────

    createBuddy() {
        if (this.buddyEl) return;

        const container = this.app.workspace.containerEl;

        // Root — just wraps the avatar; chat is absolutely positioned relative to it
        this.buddyEl = container.createEl('div', { cls: 'ai-buddy-root' });
        this.applyDirectionClass();

        // Avatar section
        const avatarSection = this.buddyEl.createEl('div', { cls: 'ai-buddy-avatar-section' });

        // Tip button — sits above the avatar, revealed on hover
        const tipBtn = avatarSection.createEl('button', {
            cls: 'ai-buddy-tip-btn',
            attr: { title: 'Get a tip from Chip' },
            text: '💡',
        });
        tipBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.showProactiveTip(true);
        });

        // Speech bubble
        const bubble = avatarSection.createEl('div', { cls: 'ai-buddy-bubble' });
        this.bubbleTextEl = bubble.createEl('span', { cls: 'ai-buddy-bubble-text' });
        this.bubbleTextEl.textContent = `Hi! I'm ${this.settings.buddyName} ✦`;

        // Avatar wrapper
        const avatarWrapper = avatarSection.createEl('div', { cls: 'ai-buddy-avatar-wrapper' });
        if (this.settings.avatarPath) {
            const isUrl = /^https?:\/\//i.test(this.settings.avatarPath);
            const src   = isUrl
                ? this.settings.avatarPath
                : this.app.vault.adapter.getResourcePath(this.settings.avatarPath);
            const isGif = /\.gif(\?.*)?$/i.test(this.settings.avatarPath);
            if (isGif) {
                // Canvas-based player so we can control playback speed
                const canvas = avatarWrapper.createEl('canvas');
                canvas.style.cssText = 'width:64px;height:64px;border-radius:50%;';
                this._gifPlayer = new GifPlayer(canvas, this.settings.gifSpeed ?? 1.0);
                this._gifPlayer.load(src, (url) => this._fetchGifData(url));
            } else {
                const img = avatarWrapper.createEl('img', {
                    cls: 'ai-buddy-custom-avatar',
                    attr: { src, width: '64', height: '64' },
                });
                img.style.borderRadius = '50%';
                img.style.objectFit = 'cover';
            }
        } else {
            avatarWrapper.innerHTML = BUDDY_SVG;
        }

        // Name tag (conditionally shown)
        this.nameTagEl = avatarSection.createEl('div', {
            cls: 'ai-buddy-nametag',
            text: this.settings.buddyName,
        });
        if (!this.settings.showNameTag) this.nameTagEl.addClass('is-hidden');

        // Chat panel — absolute child of root, direction controlled by CSS class
        this.chatEl = this.buddyEl.createEl('div', { cls: 'ai-buddy-chat' });
        this.buildChatPanel();

        // Drag setup
        const wasDrag = this.setupDrag(avatarWrapper);
        avatarWrapper.addEventListener('click', () => {
            if (!wasDrag()) this.toggleChat();
        });

        // Animations
        this.startBlinkLoop(avatarWrapper);
        if (this.settings.proactiveTips) this.startTipTimer();

        // Position — ResizeObserver fires synchronously on every pixel change,
        // giving lag-free anchoring when sidebars open/close or window resizes.
        this.updateBuddyPosition();
        const ro = new ResizeObserver(() => this.updateBuddyPosition());
        ro.observe(this.app.workspace.containerEl);
        const rightSplit = this.app.workspace.rightSplit;
        if (rightSplit?.containerEl) ro.observe(rightSplit.containerEl);
        this.register(() => ro.disconnect());

        this.showBubble(`Hi! I'm ${this.settings.buddyName} — click me!`, 4000);
    }

    // Fetch GIF bytes — uses requestUrl (bypasses CORS) for remote URLs,
    // readBinary for vault-local paths.
    async _fetchGifData(src) {
        if (/^https?:\/\//i.test(src)) {
            const resp = await requestUrl({ url: src, method: 'GET' });
            return new Uint8Array(resp.arrayBuffer);
        }
        const buf = await this.app.vault.adapter.readBinary(this.settings.avatarPath);
        return new Uint8Array(buf);
    }

    removeBuddy() {
        clearTimeout(this.blinkTimer);
        clearTimeout(this.tipTimer);
        this.blinkTimer = null;
        this.tipTimer = null;
        clearTimeout(this._pipMoveTimer);
        this._pipMoveTimer = null;
        this._gifPlayer?.destroy();
        this._gifPlayer = null;
        this.clearQuoteWatcher();
        this.stopTrackingQuote();
        this.removeArrowIndicator();
        this.buddyEl?.remove();
        this.buddyEl = null;
        this.chatEl = null;
        this.bubbleTextEl = null;
        this.nameTagEl = null;
    }

    toggleBuddy() {
        if (this.buddyEl) {
            this.settings.showBuddy = false;
            this.saveSettings();
            this.removeBuddy();
        } else {
            this.settings.showBuddy = true;
            this.saveSettings();
            this.createBuddy();
        }
    }

    applyDirectionClass() {
        if (!this.buddyEl) return;
        this.buddyEl.removeClass('chat-direction-above', 'chat-direction-below');
        this.buddyEl.addClass(`chat-direction-${this.settings.chatDirection}`);
    }

    // ─── Positioning ───────────────────────────────────────────────────────────
    //
    // We always store & apply position as {fromRight, fromBottom} so that the
    // element naturally tracks its corner during window resize (no JS needed).
    // The only time we need to re-run updateBuddyPosition is when the sidebar
    // width changes, which shifts the "note pane right edge".

    updateBuddyPosition() {
        if (!this.buddyEl) return;

        const rightSplit = this.app.workspace.rightSplit;
        const sidebarW = (rightSplit && !rightSplit.collapsed)
            ? rightSplit.containerEl.offsetWidth : 0;

        if (this.settings.savedPosition) {
            // User dragged Pip — honour their choice, but still respect sidebar.
            // fromRight is stored relative to the note pane right edge.
            const { fromRight, fromBottom } = this.settings.savedPosition;
            this.buddyEl.style.right  = `${fromRight + sidebarW}px`;
            this.buddyEl.style.bottom = `${fromBottom}px`;
        } else {
            // Default corner
            this.buddyEl.style.right  = `${sidebarW + 20}px`;
            this.buddyEl.style.bottom = '44px';
        }

        // Always use right/bottom (never left/top) so resize is free.
        this.buddyEl.style.left = 'auto';
        this.buddyEl.style.top  = 'auto';
    }

    // ─── Drag ──────────────────────────────────────────────────────────────────

    setupDrag(handle) {
        let dragging  = false;
        let dragMoved = false;
        let startMouseX, startMouseY, startLeft, startTop;

        const onMouseDown = (e) => {
            if (e.button !== 0) return;
            e.preventDefault();
            dragging  = true;
            dragMoved = false;

            // Cancel any in-progress move-to-text animation
            clearTimeout(this._pipMoveTimer);
            this.buddyEl.removeClass('is-moving');
            this.clearQuoteWatcher();
            this.stopTrackingQuote();
            this.removeArrowIndicator();

            // Snapshot current pixel position as left/top for smooth dragging
            const containerRect = this.buddyEl.parentElement.getBoundingClientRect();
            const buddyRect     = this.buddyEl.getBoundingClientRect();
            startLeft   = buddyRect.left - containerRect.left;
            startTop    = buddyRect.top  - containerRect.top;
            startMouseX = e.clientX;
            startMouseY = e.clientY;

            // Switch to left/top during drag (smoother than right/bottom)
            this.buddyEl.style.left   = `${startLeft}px`;
            this.buddyEl.style.top    = `${startTop}px`;
            this.buddyEl.style.right  = 'auto';
            this.buddyEl.style.bottom = 'auto';

            this.buddyEl.addClass('is-dragging');
        };

        const onMouseMove = (e) => {
            if (!dragging) return;
            const dx = e.clientX - startMouseX;
            const dy = e.clientY - startMouseY;
            if (Math.abs(dx) > 4 || Math.abs(dy) > 4) dragMoved = true;
            if (!dragMoved) return;

            const container = this.buddyEl.parentElement;
            const maxLeft = container.offsetWidth  - this.buddyEl.offsetWidth;
            const maxTop  = container.offsetHeight - this.buddyEl.offsetHeight;
            this.buddyEl.style.left = `${Math.max(0, Math.min(startLeft + dx, maxLeft))}px`;
            this.buddyEl.style.top  = `${Math.max(0, Math.min(startTop  + dy, maxTop))}px`;
        };

        const onMouseUp = () => {
            if (!dragging) return;
            dragging = false;
            this.buddyEl?.removeClass('is-dragging');

            if (dragMoved && this.buddyEl) {
                // Convert left/top back to fromRight/fromBottom so resize is free
                const container = this.buddyEl.parentElement;
                const fromRight  = container.offsetWidth  - parseInt(this.buddyEl.style.left) - this.buddyEl.offsetWidth;
                const fromBottom = container.offsetHeight - parseInt(this.buddyEl.style.top)  - this.buddyEl.offsetHeight;

                // Account for sidebar so savedPosition is pane-relative
                const rightSplit = this.app.workspace.rightSplit;
                const sidebarW = (rightSplit && !rightSplit.collapsed)
                    ? rightSplit.containerEl.offsetWidth : 0;

                this.settings.savedPosition = {
                    fromRight:  Math.max(0, fromRight - sidebarW),
                    fromBottom: Math.max(0, fromBottom),
                };
                this.saveSettings();

                // Switch back to right/bottom now that we have the values
                this.updateBuddyPosition();
            }
        };

        handle.addEventListener('mousedown', onMouseDown);
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
        this.register(() => {
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
        });

        return () => dragMoved;
    }

    // ─── Animations ────────────────────────────────────────────────────────────

    startBlinkLoop(wrapper) {
        const blink = () => {
            const openEyes  = wrapper.querySelector('.eyes-open');
            const blinkEyes = wrapper.querySelector('.eyes-blink');
            if (!openEyes || !blinkEyes) return;
            openEyes.style.display  = 'none';
            blinkEyes.style.display = 'block';
            setTimeout(() => {
                openEyes.style.display  = 'block';
                blinkEyes.style.display = 'none';
            }, 130);
        };
        const schedule = () => {
            this.blinkTimer = setTimeout(() => { blink(); schedule(); }, 3000 + Math.random() * 4000);
        };
        schedule();
    }

    showBubble(text, duration = 5000) {
        if (!this.bubbleTextEl || !this.buddyEl) return;
        this.bubbleTextEl.textContent = text;
        this.buddyEl.addClass('bubble-visible');
        clearTimeout(this._bubbleTimer);
        if (duration > 0) {
            this._bubbleTimer = setTimeout(() => this.buddyEl?.removeClass('bubble-visible'), duration);
        }
    }

    hideBubble() {
        clearTimeout(this._bubbleTimer);
        this.buddyEl?.removeClass('bubble-visible');
    }

    startTipTimer() {
        const tick = () => {
            this.tipTimer = setTimeout(async () => {
                if (!this.buddyEl) return;
                await this.showProactiveTip();
                tick();
            }, (this.settings.tipIntervalMinutes || 8) * 60 * 1000);
        };
        tick();
    }

    async showProactiveTip(manual = false) {
        if (this.chatEl?.hasClass('is-open')) return;
        // Auto-tips only: skip if the tab is hidden or user hasn't typed in 10+ minutes
        if (!manual) {
            if (document.hidden) return;
            const inactiveMins = (Date.now() - this._lastActivity) / 60000;
            if (this._lastActivity > 0 && inactiveMins > 10) return;
        }
        const activeFile = this.app.workspace.getActiveFile();
        if (activeFile && this._apiKey) {
            try {
                const content = await this.app.vault.read(activeFile);
                const { tip, quote } = await this.generateTip(activeFile.basename, content.slice(0, 1000));
                this.pendingTip = { tip, quote };
                this.locateQuote(quote);
                this.showBubble(tip, 8000);
            } catch {
                const tip = PROACTIVE_TIPS[Math.floor(Math.random() * PROACTIVE_TIPS.length)];
                this.pendingTip = { tip, quote: null };
                this.showBubble(tip, 6000);
            }
        } else {
            const tip = PROACTIVE_TIPS[Math.floor(Math.random() * PROACTIVE_TIPS.length)];
            this.pendingTip = { tip, quote: null };
            this.showBubble(tip, 6000);
        }
    }

    locateQuote(quote) {
        if (!quote) return;
        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (!view?.editor) return;
        const editor = view.editor;
        const content = editor.getValue();
        let idx = content.indexOf(quote);
        if (idx === -1) idx = content.toLowerCase().indexOf(quote.toLowerCase());
        if (idx === -1) return;

        const endIdx = idx + quote.length;
        const cm = editor.cm;

        // CM6 coordsAtPos returns non-null only for positions currently rendered.
        // If we can't access CM6 at all, fall back to moving vertically only.
        const coords = cm?.coordsAtPos?.(idx);
        if (coords) {
            this.movePipToQuote(idx, endIdx, editor);
        } else if (cm?.coordsAtPos) {
            // CM6 accessible but text off-screen — watch for scroll
            this.watchForQuote(idx, endIdx, editor, view);
        } else {
            // No CM6 access — move Pip vertically using line number as a rough position
            this.movePipToLine(editor.offsetToPos(idx).line, editor);
        }
    }

    watchForQuote(startIdx, endIdx, editor, view) {
        this.clearQuoteWatcher();
        const cm = editor.cm;
        if (!cm) return;
        const scroller = view.containerEl.querySelector('.cm-scroller');
        if (!scroller) return;

        const check = () => {
            const coords = cm.coordsAtPos?.(startIdx);
            if (coords) {
                this.clearQuoteWatcher();
                this.movePipToQuote(startIdx, endIdx, editor);
            }
        };
        scroller.addEventListener('scroll', check, { passive: true });
        this._quoteWatcher = { scroller, check };
    }

    clearQuoteWatcher() {
        if (!this._quoteWatcher) return;
        this._quoteWatcher.scroller.removeEventListener('scroll', this._quoteWatcher.check);
        this._quoteWatcher = null;
    }

    movePipToQuote(startIdx, endIdx, editor) {
        if (!this.buddyEl) return;
        const cm = editor.cm;
        if (!cm?.coordsAtPos) return;

        const startCoords = cm.coordsAtPos(startIdx);
        if (!startCoords) return;

        const container    = this.buddyEl.parentElement;
        const containerRect = container.getBoundingClientRect();
        const pipW = this.buddyEl.offsetWidth;
        const pipH = this.buddyEl.offsetHeight;
        const gap  = 16;

        // Vertical: Pip's center aligns with the text line's center
        const textMidY  = startCoords.top + (startCoords.bottom - startCoords.top) / 2;
        const targetTop = Math.max(0, Math.min(
            textMidY - containerRect.top - pipH / 2,
            containerRect.height - pipH
        ));

        // Horizontal: Pip sits just to the left of the text start
        const targetLeft = Math.max(0, startCoords.left - containerRect.left - pipW - gap);

        this.buddyEl.addClass('is-moving');
        this.buddyEl.style.left   = `${targetLeft}px`;
        this.buddyEl.style.top    = `${targetTop}px`;
        this.buddyEl.style.right  = 'auto';
        this.buddyEl.style.bottom = 'auto';

        // Arrow indicator just above the text, pointing down at it
        this.addArrowIndicator(startCoords, containerRect);

        // After spring animation settles, remove transition and start tracking scroll
        setTimeout(() => {
            if (!this.buddyEl) return;
            this.buddyEl.removeClass('is-moving'); // drop transition so tracking is instant
            const view = this.app.workspace.getActiveViewOfType(MarkdownView);
            if (view) this.startTrackingQuote(startIdx, endIdx, editor, view);
        }, 700);

        clearTimeout(this._pipMoveTimer);
        this._pipMoveTimer = setTimeout(() => this.returnPipHome(), 8500);
    }

    startTrackingQuote(startIdx, endIdx, editor, view) {
        this.stopTrackingQuote();
        const cm = editor.cm;
        if (!cm) return;
        const scroller = view.containerEl.querySelector('.cm-scroller');
        if (!scroller) return;

        let rafId = null;
        const update = () => {
            if (rafId) return; // already scheduled this frame
            rafId = requestAnimationFrame(() => {
                rafId = null;
                if (!this.buddyEl) return;
                const coords = cm.coordsAtPos?.(startIdx);
                if (!coords) return; // off-screen — stay parked at last position

                const container    = this.buddyEl.parentElement;
                const containerRect = container.getBoundingClientRect();
                const pipW = this.buddyEl.offsetWidth;
                const pipH = this.buddyEl.offsetHeight;
                const gap  = 16;

                const textMidY  = coords.top + (coords.bottom - coords.top) / 2;
                const targetTop  = Math.max(0, Math.min(textMidY - containerRect.top - pipH / 2, containerRect.height - pipH));
                const targetLeft = Math.max(0, coords.left - containerRect.left - pipW - gap);

                this.buddyEl.style.left   = `${targetLeft}px`;
                this.buddyEl.style.top    = `${targetTop}px`;
                this.buddyEl.style.right  = 'auto';
                this.buddyEl.style.bottom = 'auto';

                // Keep arrow locked to the text too
                if (this.highlightEl) {
                    const arrowH = 22, arrowGap = 4;
                    this.highlightEl.style.top  = `${Math.max(0, coords.top  - containerRect.top  - arrowH - arrowGap)}px`;
                    this.highlightEl.style.left = `${Math.max(0, coords.left - containerRect.left - 7)}px`;
                }
            });
        };

        scroller.addEventListener('scroll', update, { passive: true });
        this._trackingListener = { scroller, update };
    }

    stopTrackingQuote() {
        if (!this._trackingListener) return;
        this._trackingListener.scroller.removeEventListener('scroll', this._trackingListener.update);
        this._trackingListener = null;
    }

    movePipToLine(lineNumber, editor) {
        if (!this.buddyEl) return;
        const container     = this.buddyEl.parentElement;
        const containerRect = container.getBoundingClientRect();
        const totalLines    = editor.lineCount();
        const pipH          = this.buddyEl.offsetHeight;
        const fraction      = Math.min(lineNumber / Math.max(totalLines - 1, 1), 1);
        const targetTop     = Math.max(0, Math.min(fraction * containerRect.height - pipH / 2, containerRect.height - pipH));
        const rightSplit    = this.app.workspace.rightSplit;
        const sidebarW      = (rightSplit && !rightSplit.collapsed) ? rightSplit.containerEl.offsetWidth : 0;

        this.buddyEl.addClass('is-moving');
        this.buddyEl.style.right  = `${sidebarW + 20}px`;
        this.buddyEl.style.bottom = `${Math.max(10, containerRect.height - targetTop - pipH)}px`;
        this.buddyEl.style.left   = 'auto';
        this.buddyEl.style.top    = 'auto';

        clearTimeout(this._pipMoveTimer);
        this._pipMoveTimer = setTimeout(() => this.returnPipHome(), 8500);
    }

    returnPipHome() {
        if (!this.buddyEl) return;
        this.clearQuoteWatcher();
        this.stopTrackingQuote();
        this.removeArrowIndicator();
        this.buddyEl.addClass('is-moving'); // re-add spring for the return trip
        this.updateBuddyPosition();         // restores right/bottom, clears left/top
        setTimeout(() => this.buddyEl?.removeClass('is-moving'), 700);
    }

    addArrowIndicator(startCoords, containerRect) {
        this.removeArrowIndicator();
        // Position the arrow just ABOVE the text line so it never overlaps
        const arrowH = 22;
        const gap    = 4;
        const left = startCoords.left  - containerRect.left - 7;
        const top  = startCoords.top   - containerRect.top - arrowH - gap;

        this.highlightEl = this.buddyEl.parentElement.createEl('div', { cls: 'ai-buddy-arrow' });
        this.highlightEl.innerHTML = `<svg viewBox="0 0 20 22" width="20" height="22" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M10 20 L2 8 L7.5 8 L7.5 2 L12.5 2 L12.5 8 L18 8 Z" fill="#7c6af7" stroke="white" stroke-width="1.5" stroke-linejoin="round"/>
        </svg>`;
        Object.assign(this.highlightEl.style, {
            left: `${Math.max(0, left)}px`,
            top:  `${Math.max(0, top)}px`,
        });
        requestAnimationFrame(() => this.highlightEl?.addClass('is-visible'));
    }

    removeArrowIndicator() {
        if (!this.highlightEl) return;
        this.highlightEl.removeClass('is-visible');
        const el = this.highlightEl;
        this.highlightEl = null;
        setTimeout(() => el.remove(), 300);
    }

    async askTipInChat() {
        this.openChat();

        if (!this._apiKey) {
            this.chatMessages.push({ role: 'assistant', content: `Add your API key in Settings → AI Buddy and I'll share something useful about your current note! 💡` });
            this.renderMessages();
            return;
        }

        const activeFile = this.app.workspace.getActiveFile();
        if (!activeFile) {
            this.chatMessages.push({ role: 'assistant', content: `Open a note and I'll share an observation about it! 📝` });
            this.renderMessages();
            return;
        }

        // Show thinking state in chat
        this.isThinking = true;
        this.buddyEl?.addClass('is-thinking');
        this.renderMessages();
        const thinkEl = this.messagesEl.createEl('div', { cls: 'ai-buddy-message ai-buddy-msg-assistant ai-buddy-thinking' });
        thinkEl.createEl('span', { cls: 'ai-buddy-msg-gem', text: '✦' });
        thinkEl.createEl('span', { cls: 'ai-buddy-typing-dots', text: '...' });
        this.messagesEl.scrollTop = this.messagesEl.scrollHeight;

        try {
            const content = await this.app.vault.read(activeFile);
            const tip = await this.generateTip(activeFile.basename, content.slice(0, 1000));
            thinkEl.remove();
            this.chatMessages.push({ role: 'assistant', content: `💡 ${tip}` });
        } catch (err) {
            thinkEl.remove();
            const fallback = PROACTIVE_TIPS[Math.floor(Math.random() * PROACTIVE_TIPS.length)];
            this.chatMessages.push({ role: 'assistant', content: `💡 ${fallback}` });
        }

        this.isThinking = false;
        this.buddyEl?.removeClass('is-thinking');
        this.renderMessages();
    }

    async generateTip(filename, content) {
        const tipInstruction = this.settings.tipPrompt || DEFAULT_SETTINGS.tipPrompt;
        const prompt = `The user is viewing a note called "${filename}". Snippet:\n\n${content}\n\nInstruction: ${tipInstruction}\n\nRespond with a JSON object ONLY — no other text:\n{"tip": "1-2 sentence tip following the instruction above", "quote": "the exact phrase from the note you are commenting on (under 80 chars), or null if your tip is general"}`;
        const sys = `You are ${this.settings.buddyName}, a friendly vault assistant. Always respond with valid JSON only.`;
        const messages = [{ role: 'user', content: prompt }];
        const raw = this.settings.apiProvider === 'claude'
            ? await this.callClaude(sys, messages)
            : await this.callOpenAI(sys, messages);
        try {
            const match = raw.match(/\{[\s\S]*\}/);
            if (match) {
                const parsed = JSON.parse(match[0]);
                return { tip: parsed.tip || raw, quote: parsed.quote || null };
            }
        } catch { /* fall through */ }
        return { tip: raw, quote: null };
    }

    // ─── Chat Panel ────────────────────────────────────────────────────────────

    buildChatPanel() {
        this.chatEl.empty();

        const header = this.chatEl.createEl('div', { cls: 'ai-buddy-chat-header' });
        const title  = header.createEl('div', { cls: 'ai-buddy-chat-title' });
        title.createEl('span', { cls: 'ai-buddy-title-gem', text: '✦' });
        title.createEl('span', { text: ` ${this.settings.buddyName}` });

        const actions  = header.createEl('div', { cls: 'ai-buddy-header-actions' });
        const clearBtn = actions.createEl('button', { cls: 'ai-buddy-action-btn', attr: { title: 'Clear chat' }, text: '↺' });
        const closeBtn = actions.createEl('button', { cls: 'ai-buddy-action-btn ai-buddy-close-btn', attr: { title: 'Close' }, text: '×' });
        closeBtn.addEventListener('click', () => this.closeChat());
        clearBtn.addEventListener('click', () => { this.chatMessages = []; this.buildChatPanel(); });

        this.messagesEl = this.chatEl.createEl('div', { cls: 'ai-buddy-messages' });
        this.renderMessages();

        this.contextEl = this.chatEl.createEl('div', { cls: 'ai-buddy-context' });
        this.updateContextIndicator();

        const inputArea = this.chatEl.createEl('div', { cls: 'ai-buddy-input-area' });
        this.textareaEl = inputArea.createEl('textarea', {
            cls: 'ai-buddy-input',
            attr: { placeholder: 'Ask me anything... (Enter to send)', rows: '2' },
        });
        const sendBtn = inputArea.createEl('button', { cls: 'ai-buddy-send-btn' });
        sendBtn.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M2 21l21-9L2 3v7l15 2-15 2z"/></svg>`;

        const send = () => {
            const text = this.textareaEl.value.trim();
            if (!text || this.isThinking) return;
            this.textareaEl.value = '';
            this.submitMessage(text);
        };
        sendBtn.addEventListener('click', send);
        this.textareaEl.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
        });
    }

    updateContextIndicator() {
        if (!this.contextEl) return;
        const file = this.app.workspace.getActiveFile();
        if (file) {
            this.contextEl.setText(`📄 ${file.basename}`);
            this.contextEl.style.display = 'block';
        } else {
            this.contextEl.style.display = 'none';
        }
    }

    renderMessages() {
        if (!this.messagesEl) return;
        this.messagesEl.empty();

        if (this.chatMessages.length === 0) {
            const welcome = this.messagesEl.createEl('div', { cls: 'ai-buddy-welcome' });
            welcome.createEl('div', { cls: 'ai-buddy-welcome-gem', text: '✦' });
            welcome.createEl('p', { text: `Hey! I'm ${this.settings.buddyName}, your vault assistant.` });
            welcome.createEl('p', { cls: 'ai-buddy-welcome-sub', text: 'I can see your current note and help you write, think, or brainstorm.' });
        }

        for (const msg of this.chatMessages) {
            const msgEl = this.messagesEl.createEl('div', { cls: `ai-buddy-message ai-buddy-msg-${msg.role}` });
            if (msg.role === 'assistant') msgEl.createEl('span', { cls: 'ai-buddy-msg-gem', text: '✦' });
            msgEl.createEl('span', { cls: 'ai-buddy-msg-body' }).textContent = msg.content;
        }

        setTimeout(() => { if (this.messagesEl) this.messagesEl.scrollTop = this.messagesEl.scrollHeight; }, 30);
    }

    async submitMessage(text) {
        if (!this._apiKey) {
            this.chatMessages.push({ role: 'assistant', content: `I'd love to help! First, add your API key in Settings → AI Buddy.` });
            this.renderMessages();
            return;
        }

        this.chatMessages.push({ role: 'user', content: text });
        this.isThinking = true;
        this.renderMessages();

        const thinkEl = this.messagesEl.createEl('div', { cls: 'ai-buddy-message ai-buddy-msg-assistant ai-buddy-thinking' });
        thinkEl.createEl('span', { cls: 'ai-buddy-msg-gem', text: '✦' });
        thinkEl.createEl('span', { cls: 'ai-buddy-typing-dots', text: '...' });
        this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
        this.buddyEl?.addClass('is-thinking');

        try {
            const activeFile = this.app.workspace.getActiveFile();
            let noteContext = '';
            if (activeFile) {
                const content = await this.app.vault.read(activeFile);
                noteContext = `\n\n---\nCurrent note: "${activeFile.basename}"\n${content.slice(0, 2500)}${content.length > 2500 ? '\n[...truncated]' : ''}`;
            }
            const messages = this.chatMessages.map(m => ({ role: m.role, content: m.content }));
            const reply = this.settings.apiProvider === 'claude'
                ? await this.callClaude(this.settings.systemPrompt + noteContext, messages)
                : await this.callOpenAI(this.settings.systemPrompt + noteContext, messages);

            thinkEl.remove();
            this.chatMessages.push({ role: 'assistant', content: reply });
        } catch (err) {
            thinkEl.remove();
            this.chatMessages.push({ role: 'assistant', content: `Hmm, something went wrong: ${err.message}` });
        }

        this.isThinking = false;
        this.buddyEl?.removeClass('is-thinking');
        this.renderMessages();
    }

    // ─── API Calls ─────────────────────────────────────────────────────────────

    async callClaude(system, messages) {
        const resp = await requestUrl({
            url: 'https://api.anthropic.com/v1/messages',
            method: 'POST',
            headers: {
                'x-api-key': this._apiKey,
                'anthropic-version': '2023-06-01',
                'content-type': 'application/json',
            },
            body: JSON.stringify({
                model: this.settings.model || 'claude-haiku-4-5-20251001',
                max_tokens: 1024,
                system,
                messages,
            }),
            throw: false,
        });
        if (resp.status >= 400) throw new Error(resp.json?.error?.message || `HTTP ${resp.status}`);
        return resp.json.content[0].text;
    }

    async callOpenAI(system, messages) {
        const resp = await requestUrl({
            url: 'https://api.openai.com/v1/chat/completions',
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this._apiKey}`,
                'content-type': 'application/json',
            },
            body: JSON.stringify({
                model: this.settings.model || 'gpt-4o-mini',
                max_tokens: 1024,
                messages: [{ role: 'system', content: system }, ...messages],
            }),
            throw: false,
        });
        if (resp.status >= 400) throw new Error(resp.json?.error?.message || `HTTP ${resp.status}`);
        return resp.json.choices[0].message.content;
    }

    // ─── Chat Open/Close ───────────────────────────────────────────────────────

    toggleChat() {
        this.chatEl?.hasClass('is-open') ? this.closeChat() : this.openChat();
    }

    openChat() {
        this.hideBubble();

        // If a tip was shown as a bubble, carry it into the chat history
        if (this.pendingTip) {
            const { tip, quote } = this.pendingTip;
            this.pendingTip = null;
            const text = quote ? `💡 ${tip}\n\n*(referencing: "${quote}")* ` : `💡 ${tip}`;
            this.chatMessages.push({ role: 'assistant', content: text });
        }

        this.updateContextIndicator();
        this.chatEl?.addClass('is-open');
        this.buddyEl?.addClass('chat-open');
        this.renderMessages();
        setTimeout(() => this.textareaEl?.focus(), 100);
    }

    closeChat() {
        this.chatEl?.removeClass('is-open');
        this.buddyEl?.removeClass('chat-open');
    }

    // ─── Settings ──────────────────────────────────────────────────────────────

    async loadSettings() {
        const saved = await this.loadData() || {};
        this.settings = Object.assign({}, DEFAULT_SETTINGS, saved);

        // Load API key from Obsidian secret storage (sync API, since 1.11.4)
        this._apiKey = this.app.secretStorage.getSecret(SECRET_KEY) || '';

        // Migrate: if an old apiKey is sitting in data.json, move it to secret storage
        if (saved.apiKey) {
            this.app.secretStorage.setSecret(SECRET_KEY, saved.apiKey);
            this._apiKey = saved.apiKey;
            delete this.settings.apiKey;
            await this.saveData(this.settings);
        }
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }

    saveApiKey(key) {
        this._apiKey = key;
        if (key) {
            this.app.secretStorage.setSecret(SECRET_KEY, key);
        } else {
            // Clear by setting empty — no removeSecret in the API
            this.app.secretStorage.setSecret(SECRET_KEY, '');
        }
    }
}

// ─── Settings Tab ──────────────────────────────────────────────────────────────

class AiBuddySettingTab extends PluginSettingTab {
    constructor(app, plugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display() {
        const { containerEl } = this;
        containerEl.empty();
        containerEl.addClass('ai-buddy-settings');

        containerEl.createEl('h2', { text: '✦ AI Buddy' });
        containerEl.createEl('p', {
            cls: 'setting-item-description',
            text: 'Your personal Clippy-style assistant, living in the corner of your vault.',
        });

        containerEl.createEl('h3', { text: 'Buddy' });

        new Setting(containerEl)
            .setName('Show buddy')
            .setDesc('Toggle the floating avatar on/off.')
            .addToggle(t => t
                .setValue(this.plugin.settings.showBuddy)
                .onChange(async v => {
                    this.plugin.settings.showBuddy = v;
                    await this.plugin.saveSettings();
                    v ? this.plugin.createBuddy() : this.plugin.removeBuddy();
                }));

        new Setting(containerEl)
            .setName('Buddy name')
            .setDesc('What should your buddy be called?')
            .addText(t => t
                .setValue(this.plugin.settings.buddyName)
                .onChange(async v => {
                    this.plugin.settings.buddyName = v || 'Chip';
                    await this.plugin.saveSettings();
                    if (this.plugin.nameTagEl) this.plugin.nameTagEl.textContent = this.plugin.settings.buddyName;
                }));

        new Setting(containerEl)
            .setName('Show name tag')
            .setDesc('Display the name below the avatar.')
            .addToggle(t => t
                .setValue(this.plugin.settings.showNameTag)
                .onChange(async v => {
                    this.plugin.settings.showNameTag = v;
                    await this.plugin.saveSettings();
                    if (this.plugin.nameTagEl) {
                        v ? this.plugin.nameTagEl.removeClass('is-hidden')
                          : this.plugin.nameTagEl.addClass('is-hidden');
                    }
                }));

        new Setting(containerEl)
            .setName('Custom avatar')
            .setDesc('Vault-relative path (e.g. attachments/pip.gif) or a direct URL (e.g. a Giphy/Tenor .gif link). Leave empty to use the default robot.')
            .addText(t => t
                .setPlaceholder('attachments/pip.gif')
                .setValue(this.plugin.settings.avatarPath)
                .onChange(async v => {
                    this.plugin.settings.avatarPath = v.trim();
                    await this.plugin.saveSettings();
                    // Rebuild buddy so avatar updates immediately
                    if (this.plugin.buddyEl) {
                        this.plugin.removeBuddy();
                        this.plugin.createBuddy();
                    }
                }));

        new Setting(containerEl)
            .setName('GIF playback speed')
            .setDesc('Multiplier for animated GIF speed. 1× = original, 2× = double speed, 0.5× = half speed.')
            .addSlider(s => s
                .setLimits(0.25, 4, 0.25)
                .setValue(this.plugin.settings.gifSpeed ?? 1.0)
                .setDynamicTooltip()
                .onChange(async v => {
                    this.plugin.settings.gifSpeed = v;
                    await this.plugin.saveSettings();
                    this.plugin._gifPlayer?.setSpeed(v);
                }));

        new Setting(containerEl)
            .setName('Chat direction')
            .setDesc('Where the chat panel opens relative to the avatar.')
            .addDropdown(d => d
                .addOption('below', 'Below avatar')
                .addOption('above', 'Above avatar')
                .setValue(this.plugin.settings.chatDirection)
                .onChange(async v => {
                    this.plugin.settings.chatDirection = v;
                    await this.plugin.saveSettings();
                    this.plugin.applyDirectionClass();
                }));

        new Setting(containerEl)
            .setName('Reset position')
            .setDesc('Snap Chip back to the default bottom-right corner.')
            .addButton(b => b
                .setButtonText('Reset')
                .onClick(async () => {
                    this.plugin.settings.savedPosition = null;
                    await this.plugin.saveSettings();
                    this.plugin.updateBuddyPosition();
                }));

        new Setting(containerEl)
            .setName('Proactive tips')
            .setDesc('Chip will occasionally pop up with a note-related tip.')
            .addToggle(t => t
                .setValue(this.plugin.settings.proactiveTips)
                .onChange(async v => {
                    this.plugin.settings.proactiveTips = v;
                    await this.plugin.saveSettings();
                    clearTimeout(this.plugin.tipTimer);
                    if (v && this.plugin.buddyEl) this.plugin.startTipTimer();
                }));

        new Setting(containerEl)
            .setName('Tip interval (minutes)')
            .setDesc('How often Chip checks in automatically.')
            .addSlider(s => s
                .setLimits(2, 30, 1)
                .setValue(this.plugin.settings.tipIntervalMinutes)
                .setDynamicTooltip()
                .onChange(async v => {
                    this.plugin.settings.tipIntervalMinutes = v;
                    await this.plugin.saveSettings();
                }));

        containerEl.createEl('h3', { text: 'AI Provider' });

        new Setting(containerEl)
            .setName('Provider')
            .addDropdown(d => d
                .addOption('claude', 'Anthropic Claude')
                .addOption('openai', 'OpenAI')
                .setValue(this.plugin.settings.apiProvider)
                .onChange(async v => {
                    this.plugin.settings.apiProvider = v;
                    this.plugin.settings.model = v === 'claude' ? 'claude-haiku-4-5-20251001' : 'gpt-4o-mini';
                    await this.plugin.saveSettings();
                    this.display();
                }));

        new Setting(containerEl)
            .setName('API key')
            .setDesc('Stored securely via Obsidian\'s secret storage. Never saved to data.json.')
            .addText(t => {
                t.inputEl.type = 'password';
                t.setValue(this.plugin._apiKey)
                    .setPlaceholder(this.plugin.settings.apiProvider === 'claude' ? 'sk-ant-...' : 'sk-...')
                    .onChange(v => { this.plugin.saveApiKey(v); });
            });

        new Setting(containerEl)
            .setName('Model')
            .setDesc(this.plugin.settings.apiProvider === 'claude'
                ? 'e.g. claude-haiku-4-5-20251001, claude-sonnet-4-6'
                : 'e.g. gpt-4o-mini, gpt-4o')
            .addText(t => t
                .setValue(this.plugin.settings.model)
                .onChange(async v => { this.plugin.settings.model = v; await this.plugin.saveSettings(); }));

        containerEl.createEl('h3', { text: 'Personality' });

        new Setting(containerEl)
            .setName('System prompt')
            .setDesc('Customize your buddy\'s personality. Note context is appended automatically.')
            .addTextArea(t => {
                t.setValue(this.plugin.settings.systemPrompt)
                    .onChange(async v => { this.plugin.settings.systemPrompt = v; await this.plugin.saveSettings(); });
                t.inputEl.rows = 6;
                t.inputEl.style.width = '100%';
                t.inputEl.style.fontFamily = 'var(--font-monospace)';
                t.inputEl.style.fontSize = '12px';
            });

        new Setting(containerEl)
            .setName('Proactive tip instruction')
            .setDesc('Tell Chip what kind of tips to give when it pops up automatically. The note content is always included.')
            .addTextArea(t => {
                t.setValue(this.plugin.settings.tipPrompt || DEFAULT_SETTINGS.tipPrompt)
                    .onChange(async v => { this.plugin.settings.tipPrompt = v; await this.plugin.saveSettings(); });
                t.inputEl.rows = 3;
                t.inputEl.style.width = '100%';
                t.inputEl.style.fontFamily = 'var(--font-monospace)';
                t.inputEl.style.fontSize = '12px';
            });

        new Setting(containerEl)
            .setName('Reset to defaults')
            .setDesc('Restore all settings to their original values.')
            .addButton(b => b
                .setButtonText('Reset')
                .setWarning()
                .onClick(async () => {
                    this.plugin.settings = Object.assign({}, DEFAULT_SETTINGS);
                    await this.plugin.saveSettings();
                    this.display();
                }));
    }
}

module.exports = AiBuddyPlugin;
