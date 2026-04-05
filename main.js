'use strict';

const { Plugin, PluginSettingTab, Setting, Menu, requestUrl, MarkdownView, MarkdownRenderer, Component } = require('obsidian');

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
    chatDirection: 'above',           // 'above' | 'below'
    showNameTag: true,               // show/hide name below avatar
    avatarPath: '',                  // DEPRECATED — migrated to emotionAvatars.default
    avatarPreset: 'custom',          // 'custom' | 'gemmy' | ... (see AVATAR_PRESETS)
    emotionAvatars: {},              // { default, emerge, disappear, idle, lookAround, happy, angry, disappoint, excited } → paths/URLs
    gifSpeed: 1.0,                   // GIF playback speed multiplier (0–2, 0 = paused)
    savedPosition: null,             // null = default corner; {fromRight, fromBottom} when dragged
    theme: 'purple',                 // color palette (see THEMES below)
    visualStyle: 'glow',             // overall aesthetic (see VISUAL_STYLES below)
    customFont: '',                  // font-family override for the buddy UI (empty = inherit)
    emotionsEnabled: true,           // master toggle for personality/emotion reactions
    emotionMessages: {},             // {emotionKey: "msg1|msg2|msg3"} user overrides; falls back to DEFAULT_EMOTIONS
};

// ─── Themes ───────────────────────────────────────────────────────────────────
// Each theme defines color anchors. Chat/bubble backgrounds use Obsidian's
// native vars so they adapt to light/dark automatically; our colors just need
// to look good against both.

const THEMES = {
    purple:  { label: 'Purple (default)', primary: '124, 106, 247', light: '167, 139, 250', pale: '196, 184, 255', dark: '109, 40, 217' },
    ocean:   { label: 'Ocean',            primary: '14, 165, 233',  light: '56, 189, 248',  pale: '125, 211, 252', dark: '3, 105, 161'   },
    forest:  { label: 'Forest',           primary: '16, 185, 129',  light: '52, 211, 153',  pale: '110, 231, 183', dark: '5, 122, 85'    },
    sunset:  { label: 'Sunset',           primary: '249, 115, 22',  light: '251, 146, 60',  pale: '253, 186, 116', dark: '194, 65, 12'   },
    rose:    { label: 'Rose',             primary: '236, 72, 153',  light: '244, 114, 182', pale: '249, 168, 212', dark: '190, 24, 93'   },
    crimson: { label: 'Crimson',          primary: '239, 68, 68',   light: '248, 113, 113', pale: '252, 165, 165', dark: '185, 28, 28'   },
    cyber:   { label: 'Cyber',            primary: '6, 182, 212',   light: '34, 211, 238',  pale: '103, 232, 249', dark: '14, 116, 144'  },
    candy:   { label: 'Candy',            primary: '217, 70, 239',  light: '232, 121, 249', pale: '240, 171, 252', dark: '162, 28, 175'  },
    mono:    { label: 'Monochrome',       primary: '100, 116, 139', light: '148, 163, 184', pale: '203, 213, 225', dark: '51, 65, 85'    },
    gold:    { label: 'Gold',             primary: '234, 179, 8',   light: '250, 204, 21',  pale: '253, 224, 71',  dark: '161, 98, 7'    },
};

// ─── Visual Styles ────────────────────────────────────────────────────────────
// Each style is a complete design system: borders, shadows, radii, fonts and
// chrome details. Applied via the `visual-<key>` class on the buddy root.
// The color palette (see THEMES) tints the accents where the style permits.

const VISUAL_STYLES = {
    glow: {
        label:       'Glow',
        description: 'Glowing tech with soft purple accents (default)',
    },
    paper: {
        label:       'Paper',
        description: 'Warm cream notepad with dashed borders and serif type',
    },
    minimal: {
        label:       'Minimal',
        description: 'Clean flat design, thin borders, tight spacing',
    },
    terminal: {
        label:       'Terminal',
        description: 'Green-on-black retro CRT with scanlines and monospace',
    },
    neon: {
        label:       'Neon',
        description: 'Cyberpunk arcade: dark panels with hot neon outlines',
    },
    cozy: {
        label:       'Cozy',
        description: 'Soft pastel plushie with pillowy rounded corners',
    },
};

// ─── Avatar Presets ───────────────────────────────────────────────────────────
// Paths marked as `bundled: true` are resolved relative to the plugin's install
// directory (so we can ship art with the plugin). Custom user paths are treated
// as vault-relative paths or absolute URLs.

const AVATAR_PRESETS = {
    custom: {
        label:   'Custom (enter paths manually)',
        bundled: false,
        paths:   {},
    },
    chip: {
        label:   'Chip (built-in)',
        builtin: true,
        paths: {
            default:    '',                          // uses BUDDY_SVG with blink animation
            emerge:     'builtin:chip/emerge',
            disappear:  'builtin:chip/disappear',
            idle:       '',                          // keep blink-enabled default during idle
            lookAround: 'builtin:chip/lookAround',
            happy:      'builtin:chip/happy',
            angry:      'builtin:chip/angry',
            disappoint: 'builtin:chip/disappoint',
            excited:    'builtin:chip/excited',
        },
    },
    gemmy: {
        label:   'Gemmy (by ericaxu & Rigmarole)',
        bundled: true,
        paths: {
            default:    'Gemmy/gemmy_idle.gif',
            emerge:     'Gemmy/gemmy_emerge.gif',
            disappear:  'Gemmy/gemmy_disappear.gif',
            idle:       'Gemmy/gemmy_idle.gif',
            lookAround: 'Gemmy/gemmy_lookAround.gif',
            happy:      'Gemmy/gemmy_pop.gif',
            angry:      'Gemmy/gemmy_angry.gif',
            disappoint: 'Gemmy/gemmy_disappoint.gif',
            excited:    'Gemmy/gemmy_pop.gif',
        },
        credit: 'Gemmy sprites © ericaxu & Rigmarole — see github.com/ericaxu/gemmy',
    },
    clippy: {
        label:   'Clippy (Microsoft Office 97 assistant)',
        bundled: true,
        paths: {
            default:    'Clippy/clippy_idle.gif',
            emerge:     'Clippy/clippy_emerge.gif',
            disappear:  'Clippy/clippy_disappear.gif',
            idle:       'Clippy/clippy_idle.gif',
            lookAround: 'Clippy/clippy_lookAround.gif',
            happy:      'Clippy/clippy_happy.gif',
            angry:      'Clippy/clippy_angry.gif',
            disappoint: 'Clippy/clippy_disappoint.gif',
            excited:    'Clippy/clippy_excited.gif',
        },
        credit: 'Clippy © Microsoft Corporation. GIFs extracted by Vjeux (blog.vjeux.com/2024/project/clippy-gifs.html) from the original Office 97 assistant.',
    },
};

// ─── Emotions ─────────────────────────────────────────────────────────────────
// Each emotion has: default bubble messages (pipe-separated, one picked at
// random) and a CSS class applied to the root for any visual flourish.
// Triggers are wired in code — no AI calls.

const DEFAULT_EMOTIONS = {
    emerge:     { label: 'Emerge',      defaultMsg: `Hi! I'm {name} — click me! ✦|Hey there, I'm {name}!|{name} reporting for duty ✦` },
    disappear:  { label: 'Disappear',   defaultMsg: `See you later!|Catch you next time ✦|Heading out — ping me anytime!` },
    idle:       { label: 'Idle',        defaultMsg: `Still here whenever you need me ✦|Just hanging out...|Let me know if you need a hand!` },
    lookAround: { label: 'Look around', defaultMsg: `👀|...hmm|*peeks around*|Anything interesting today?` },
    happy:      { label: 'Happy',       defaultMsg: `🎉|Glad to help!|Nice!|Awesome ✦` },
    angry:      { label: 'Angry',       defaultMsg: `Ugh, that didn't work 😤|Something broke — try again?|Grr, error!` },
    disappoint: { label: 'Disappoint',  defaultMsg: `Oh... okay 😔|Maybe next time|Ignored again...` },
    excited:    { label: 'Excited',     defaultMsg: `Ooh, something new! ✨|Let's gooo!|This looks fun! 🚀` },
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

// Reusable face parts for Chip SVG variants (positioned within the head: x=17-83, y=6-54)
const CHIP_EYES = {
    normal:  `<rect x="28" y="20" width="18" height="16" rx="8" fill="white"/><rect x="54" y="20" width="18" height="16" rx="8" fill="white"/><circle cx="37" cy="28" r="5" fill="#2d2d3a"/><circle cx="63" cy="28" r="5" fill="#2d2d3a"/><circle cx="39" cy="25.5" r="2" fill="white"/><circle cx="65" cy="25.5" r="2" fill="white"/>`,
    wide:    `<rect x="26" y="17" width="22" height="22" rx="11" fill="white"/><rect x="52" y="17" width="22" height="22" rx="11" fill="white"/><circle cx="37" cy="28" r="6" fill="#2d2d3a"/><circle cx="63" cy="28" r="6" fill="#2d2d3a"/><circle cx="39" cy="25" r="2.5" fill="white"/><circle cx="65" cy="25" r="2.5" fill="white"/>`,
    closed:  `<rect x="28" y="27" width="18" height="4" rx="2" fill="#2d2d3a"/><rect x="54" y="27" width="18" height="4" rx="2" fill="#2d2d3a"/>`,
    squint:  `<path d="M 28 31 Q 37 22 46 31" stroke="#2d2d3a" stroke-width="3.5" fill="none" stroke-linecap="round"/><path d="M 54 31 Q 63 22 72 31" stroke="#2d2d3a" stroke-width="3.5" fill="none" stroke-linecap="round"/>`,
    angry:   `<rect x="28" y="23" width="18" height="13" rx="6.5" fill="white"/><rect x="54" y="23" width="18" height="13" rx="6.5" fill="white"/><circle cx="37" cy="30" r="4" fill="#2d2d3a"/><circle cx="63" cy="30" r="4" fill="#2d2d3a"/><path d="M 26 17 L 46 22" stroke="#2d2d3a" stroke-width="3.5" stroke-linecap="round"/><path d="M 74 17 L 54 22" stroke="#2d2d3a" stroke-width="3.5" stroke-linecap="round"/>`,
    sad:     `<rect x="28" y="24" width="18" height="13" rx="6.5" fill="white"/><rect x="54" y="24" width="18" height="13" rx="6.5" fill="white"/><circle cx="37" cy="31" r="4" fill="#2d2d3a"/><circle cx="63" cy="31" r="4" fill="#2d2d3a"/><path d="M 28 18 L 46 24" stroke="#2d2d3a" stroke-width="2.5" stroke-linecap="round" opacity="0.7"/><path d="M 72 18 L 54 24" stroke="#2d2d3a" stroke-width="2.5" stroke-linecap="round" opacity="0.7"/>`,
    sideL:   `<rect x="28" y="20" width="18" height="16" rx="8" fill="white"/><rect x="54" y="20" width="18" height="16" rx="8" fill="white"/><circle cx="33" cy="28" r="5" fill="#2d2d3a"/><circle cx="59" cy="28" r="5" fill="#2d2d3a"/><circle cx="35" cy="25.5" r="2" fill="white"/><circle cx="61" cy="25.5" r="2" fill="white"/>`,
    sparkle: `<rect x="26" y="17" width="22" height="22" rx="11" fill="white"/><rect x="52" y="17" width="22" height="22" rx="11" fill="white"/><polygon points="37,22 39,28 44,29 39,30 37,36 35,30 30,29 35,28" fill="#2d2d3a"/><polygon points="63,22 65,28 70,29 65,30 63,36 61,30 56,29 61,28" fill="#2d2d3a"/>`,
};
const CHIP_MOUTHS = {
    smile:      `<path d="M 36 42 Q 50 52 64 42" stroke="white" stroke-width="2.5" fill="none" stroke-linecap="round"/>`,
    bigSmile:   `<path d="M 32 40 Q 50 58 68 40" stroke="white" stroke-width="3" fill="none" stroke-linecap="round"/>`,
    smallSmile: `<path d="M 40 43 Q 50 48 60 43" stroke="white" stroke-width="2.5" fill="none" stroke-linecap="round"/>`,
    flat:       `<line x1="40" y1="44" x2="60" y2="44" stroke="white" stroke-width="2.5" stroke-linecap="round"/>`,
    frown:      `<path d="M 36 50 Q 50 40 64 50" stroke="white" stroke-width="2.5" fill="none" stroke-linecap="round"/>`,
    gasp:       `<ellipse cx="50" cy="44" rx="4.5" ry="5.5" fill="white"/>`,
    sad:        `<path d="M 38 48 Q 50 42 62 48" stroke="white" stroke-width="2.5" fill="none" stroke-linecap="round"/>`,
};

function makeChipSvg({ eyes, mouth, body = '#7c6af7', bodyLight = '#8e7ef8', head = '#9b8ff8' } = {}) {
    return `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 110" width="64" height="64" class="ai-buddy-svg">
  <ellipse cx="50" cy="107" rx="22" ry="5" fill="rgba(0,0,0,0.15)"/>
  <rect x="22" y="48" width="56" height="48" rx="12" fill="${body}"/>
  <rect x="22" y="48" width="56" height="16" rx="6" fill="${bodyLight}"/>
  <rect x="32" y="68" width="36" height="20" rx="6" fill="#6355d4" opacity="0.6"/>
  <circle cx="42" cy="75" r="4" fill="#c4b8ff" opacity="0.85"/>
  <circle cx="58" cy="75" r="4" fill="#c4b8ff" opacity="0.85"/>
  <rect x="36" y="82" width="28" height="4" rx="2" fill="#c4b8ff" opacity="0.5"/>
  <rect x="4" y="52" width="18" height="11" rx="5.5" fill="${body}"/>
  <rect x="78" y="52" width="18" height="11" rx="5.5" fill="${body}"/>
  <circle cx="9" cy="57" r="5" fill="#9b8ff8"/>
  <circle cx="91" cy="57" r="5" fill="#9b8ff8"/>
  <rect x="17" y="6" width="66" height="48" rx="14" fill="${head}"/>
  <rect x="22" y="8" width="56" height="16" rx="10" fill="rgba(255,255,255,0.1)"/>
  <circle cx="17" cy="24" r="5" fill="#8075e8"/>
  <circle cx="83" cy="24" r="5" fill="#8075e8"/>
  <circle cx="17" cy="24" r="2.5" fill="#c4b8ff" opacity="0.7"/>
  <circle cx="83" cy="24" r="2.5" fill="#c4b8ff" opacity="0.7"/>
  <rect x="44" y="0" width="12" height="10" rx="4" fill="#8075e8"/>
  <circle cx="50" cy="-2" r="6" fill="#c4b8ff"/>
  <circle cx="50" cy="-2" r="3" fill="white" opacity="0.8" class="antenna-glow"/>
  ${eyes}
  ${mouth}
</svg>`;
}

// Inline Chip avatar variants used by the "Chip" avatar preset. Referenced by
// "builtin:chip/<key>" paths in emotionAvatars.
const CHIP_VARIANTS = {
    idle:       makeChipSvg({ eyes: CHIP_EYES.normal,  mouth: CHIP_MOUTHS.smile }),
    emerge:     makeChipSvg({ eyes: CHIP_EYES.wide,    mouth: CHIP_MOUTHS.bigSmile }),
    disappear:  makeChipSvg({ eyes: CHIP_EYES.closed,  mouth: CHIP_MOUTHS.flat }),
    lookAround: makeChipSvg({ eyes: CHIP_EYES.sideL,   mouth: CHIP_MOUTHS.smallSmile }),
    happy:      makeChipSvg({ eyes: CHIP_EYES.squint,  mouth: CHIP_MOUTHS.bigSmile }),
    angry:      makeChipSvg({ eyes: CHIP_EYES.angry,   mouth: CHIP_MOUTHS.frown, body: '#d04040', bodyLight: '#e85858', head: '#e56868' }),
    disappoint: makeChipSvg({ eyes: CHIP_EYES.sad,     mouth: CHIP_MOUTHS.sad,   body: '#6878a0', bodyLight: '#7988b0', head: '#8a98c0' }),
    excited:    makeChipSvg({ eyes: CHIP_EYES.sparkle, mouth: CHIP_MOUTHS.gasp }),
};

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

// Module-level cache of parsed GIF frames, keyed by source path. Parsing a GIF
// is the expensive part; reusing frames across emotion swaps makes transitions
// instant so short-lived emotions (angry, happy, etc.) are actually visible.
const GIF_FRAME_CACHE = new Map();

class GifPlayer {
    constructor(canvas, speed = 1.0) {
        this.canvas  = canvas;
        this.ctx     = canvas.getContext('2d');
        this.speed   = Math.max(0, speed);
        this.frames  = [];
        this.idx     = 0;
        this._active = false;
        this._timer  = null;
    }

    async load(src, fetcher, onError, cacheKey) {
        // Fast path: we've already parsed this GIF before
        if (cacheKey && GIF_FRAME_CACHE.has(cacheKey)) {
            this.frames = GIF_FRAME_CACHE.get(cacheKey);
            if (this.frames.length === 0) { onError?.(); return; }
            this.canvas.width  = this.frames[0].w;
            this.canvas.height = this.frames[0].h;
            this._active = true;
            this._tick();
            return;
        }
        try {
            const data = await fetcher(src);
            this.frames = GifPlayer.parse(data);
            if (this.frames.length === 0) { onError?.(); return; }
            if (cacheKey) GIF_FRAME_CACHE.set(cacheKey, this.frames);
            this.canvas.width  = this.frames[0].w;
            this.canvas.height = this.frames[0].h;
            this._active = true;
            this._tick();
        } catch (e) {
            console.warn('AI Buddy: GIF load failed', e);
            onError?.();
        }
    }

    _tick() {
        if (!this._active || this.frames.length === 0) return;
        const frame = this.frames[this.idx];
        this.ctx.putImageData(frame.img, 0, 0);
        // Speed 0 = paused: render current frame but don't schedule the next one
        if (this.speed <= 0) { this._timer = null; return; }
        const delay = Math.max(20, frame.delay / this.speed);
        this._timer = setTimeout(() => {
            this.idx = (this.idx + 1) % this.frames.length;
            this._tick();
        }, delay);
    }

    setSpeed(s) {
        const wasPaused = this.speed <= 0;
        this.speed = Math.max(0, s);
        // If resuming from paused state, kick the loop back into motion
        if (wasPaused && this.speed > 0 && this._active && !this._timer) this._tick();
    }
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
            id: 'show-ai-buddy',
            name: 'Show AI Buddy',
            callback: () => this.showBuddy(),
        });

        this.addCommand({
            id: 'hide-ai-buddy',
            name: 'Hide AI Buddy',
            callback: () => this.hideBuddy(),
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

        // Trigger excited when the user opens a different note
        this.registerEvent(this.app.workspace.on('file-open', (file) => {
            if (!file || !this.buddyEl) return;
            if (this.chatEl?.hasClass('is-open')) return;
            // Skip the initial file-open that fires on layout ready
            if (!this._hasSeenFirstOpen) { this._hasSeenFirstOpen = true; return; }
            this.triggerEmotion('excited', { duration: 4000, animationMs: 2200 });
        }));

        this.app.workspace.onLayoutReady(() => {
            // Ensure bundled preset assets are downloaded (no-op if present)
            const preset = AVATAR_PRESETS[this.settings.avatarPreset];
            if (preset?.bundled) this.ensurePresetAssets(this.settings.avatarPreset);
            if (this.settings.showBuddy) this.createBuddy();
        });
    }

    onunload() {
        this.removeBuddy();
        document.body.classList.remove('ai-buddy-settings-open');
    }

    // ─── Buddy Lifecycle ───────────────────────────────────────────────────────

    createBuddy() {
        if (this.buddyEl) return;

        const container = this.app.workspace.containerEl;

        // Root — just wraps the avatar; chat is absolutely positioned relative to it
        this.buddyEl = container.createEl('div', { cls: 'ai-buddy-root' });
        this.applyDirectionClass();
        this.applyTheme();

        // Avatar section
        const avatarSection = this.buddyEl.createEl('div', { cls: 'ai-buddy-avatar-section' });

        // Tip button — sits above the avatar, revealed on hover
        const tipBtn = avatarSection.createEl('button', {
            cls: 'ai-buddy-tip-btn',
            attr: { title: `Get a tip from ${this.settings.buddyName}` },
            text: '💡',
        });
        this.tipBtnEl = tipBtn;
        tipBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.registerBuddyInteraction();
            this.triggerEmotion('happy', { silent: true, animationMs: 2200 });
            this.showProactiveTip(true);
        });

        // Speech bubble
        const bubble = avatarSection.createEl('div', { cls: 'ai-buddy-bubble' });
        this.bubbleTextEl = bubble.createEl('span', { cls: 'ai-buddy-bubble-text' });
        this.bubbleTextEl.textContent = `Hi! I'm ${this.settings.buddyName} ✦`;

        // Avatar wrapper
        const avatarWrapper = avatarSection.createEl('div', { cls: 'ai-buddy-avatar-wrapper' });
        this.avatarWrapperEl = avatarWrapper;
        this._renderAvatar(this.settings.emotionAvatars?.default || '');

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

        // Right-click context menu
        avatarWrapper.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const menu = new Menu();
            menu.addItem(item => item
                .setTitle(`Hide ${this.settings.buddyName}`)
                .setIcon('eye-off')
                .onClick(() => this.hideBuddy()));
            menu.addItem(item => item
                .setTitle('Reset position')
                .setIcon('move')
                .onClick(() => {
                    this.settings.savedPosition = null;
                    this.saveSettings();
                    this.updateBuddyPosition();
                }));
            menu.addSeparator();
            menu.addItem(item => item
                .setTitle('Open chat')
                .setIcon('message-square')
                .onClick(() => this.openChat()));
            menu.addItem(item => item
                .setTitle('Get a tip')
                .setIcon('lightbulb')
                .onClick(() => this.showProactiveTip(true)));
            menu.addSeparator();
            menu.addItem(item => item
                .setTitle('Open settings')
                .setIcon('settings')
                .onClick(() => {
                    this.app.setting.open();
                    this.app.setting.openTabById(this.manifest.id);
                }));
            menu.showAtMouseEvent(e);
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
        const leftSplit  = this.app.workspace.leftSplit;
        if (rightSplit?.containerEl) ro.observe(rightSplit.containerEl);
        if (leftSplit?.containerEl)  ro.observe(leftSplit.containerEl);
        this.register(() => ro.disconnect());

        // Preload emotion GIFs so avatar swaps during emotions are instant
        this._preloadEmotionAvatars();

        // Watch for Obsidian theme changes (light ↔ dark) so Clippy can swap
        // to the matching white/black variant.
        let lastThemeDark = document.body.classList.contains('theme-dark');
        this._themeObserver = new MutationObserver(() => {
            const isDark = document.body.classList.contains('theme-dark');
            if (isDark === lastThemeDark || !this.buddyEl) return;
            lastThemeDark = isDark;
            // Re-render the current avatar (default) with the new theme variant
            this._renderAvatar(this.settings.emotionAvatars?.default || '');
        });
        this._themeObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] });
        this.register(() => this._themeObserver?.disconnect());

        // Trigger emerge emotion (plays animation + shows greeting bubble)
        this.triggerEmotion('emerge', { duration: 5000, animationMs: 2400, force: true });

        // Start idle/look-around watchers
        this.startIdleWatcher();
    }

    // Tenor/Giphy share URLs point to HTML viewer pages, not raw image data.
    // Fetch the page once, extract the direct media URL from og:image meta tag,
    // and rewrite known-bad Tenor paths to the hotlinkable variant.
    async _resolveShareUrl(url) {
        this._shareUrlCache = this._shareUrlCache || new Map();
        if (this._shareUrlCache.has(url)) return this._shareUrlCache.get(url);
        try {
            const resp = await requestUrl({ url, method: 'GET' });
            const html = resp.text || '';
            // Match og:image meta tag (attribute order can vary)
            const match = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)
                       || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
            let resolved = match ? match[1] : url;
            // Tenor's og:image returns media1.tenor.com/m/<hash>/<name>.gif which
            // 404s for hotlinking; the hotlinkable variant lives at
            // media.tenor.com/<hash>/<name>.gif (no "/m/" path segment).
            resolved = resolved.replace(/:\/\/media1?\.tenor\.com\/m\//i, '://media.tenor.com/');
            this._shareUrlCache.set(url, resolved);
            return resolved;
        } catch (e) {
            console.warn('AI Buddy: share-URL resolution failed for', url, e);
            return url;
        }
    }

    // True when the URL is a known share-service page that needs resolution
    _isShareUrl(url) {
        return /^https?:\/\/(www\.)?tenor\.com\/[^\/]+\.gif(\?.*)?$/i.test(url)
            || /^https?:\/\/(www\.)?tenor\.com\/view\//i.test(url)
            || /^https?:\/\/(www\.)?giphy\.com\/gifs\//i.test(url);
    }

    // Swap Clippy paths to their _dark variant when in dark mode (the Clippy
    // preset ships two variants per emotion: white-bg and black-bg).
    _resolveThemedPath(path) {
        if (!path) return path;
        const isClippy = /\/Clippy\/clippy_[^_/]+\.gif$/i.test(path);
        if (!isClippy) return path;
        const isDark = document.body.classList.contains('theme-dark');
        if (isDark) return path.replace(/\.gif$/i, '_dark.gif');
        return path;
    }

    // Render an avatar image into the avatar wrapper. Clears the previous
    // avatar and any running GIF player. Empty path falls back to the built-in SVG.
    // `isEmotion=true` forces a minimum playback speed so emotion GIFs animate
    // even when the user has paused the default/idle GIF via gifSpeed.
    _renderAvatar(rawPath, isEmotion = false) {
        const path = this._resolveThemedPath(rawPath);
        const wrapper = this.avatarWrapperEl;
        if (!wrapper) return;

        // Tear down any previous GIF player + clear DOM
        this._gifPlayer?.destroy();
        this._gifPlayer = null;
        this._currentAvatarPath = path || '';
        wrapper.empty();

        if (!path) {
            wrapper.innerHTML = BUDDY_SVG;
            return;
        }

        // Tenor/Giphy share URLs — resolve to direct media URL, then re-render
        if (this._isShareUrl(path)) {
            this._resolveShareUrl(path).then(resolved => {
                // Bail if another render has replaced this one
                if (this._currentAvatarPath !== path) return;
                if (resolved && resolved !== path) {
                    this._renderAvatar(resolved, isEmotion);
                } else {
                    wrapper.innerHTML = BUDDY_SVG;
                }
            });
            return;
        }

        // Inline built-in SVG variants (e.g. "builtin:chip/happy")
        if (path.startsWith('builtin:')) {
            const key = path.slice('builtin:'.length);
            if (key.startsWith('chip/')) {
                const variantKey = key.slice('chip/'.length);
                wrapper.innerHTML = CHIP_VARIANTS[variantKey] || BUDDY_SVG;
            } else {
                wrapper.innerHTML = BUDDY_SVG;
            }
            return;
        }

        const isUrl = /^https?:\/\//i.test(path);
        const src   = isUrl ? path : this.app.vault.adapter.getResourcePath(path);
        const isGif = /\.gif(\?.*)?$/i.test(path);

        // Use the canvas-based GIF player ONLY for vault-local .gif files,
        // where we can read bytes directly and get speed control. URLs fall
        // through to <img>, which lets the browser follow redirects (Tenor,
        // Giphy, etc.) and render any animated format natively.
        if (isGif && !isUrl) {
            const canvas = wrapper.createEl('canvas');
            canvas.style.cssText = 'width:64px;height:64px;border-radius:50%;';
            // Emotion GIFs always play (≥ 1×) so pausing the idle avatar
            // doesn't silently freeze the angry/happy/etc animations too.
            const userSpeed = this.settings.gifSpeed ?? 1.0;
            const speed = isEmotion ? Math.max(1.0, userSpeed) : userSpeed;
            this._gifPlayer = new GifPlayer(canvas, speed);
            this._gifPlayer.load(src, (url) => this._fetchGifData(url, path), () => {
                // Fall back to built-in SVG on load failure
                canvas.remove();
                wrapper.innerHTML = BUDDY_SVG;
            }, path);   // cache key
        } else {
            const img = wrapper.createEl('img', {
                cls: 'ai-buddy-custom-avatar',
                attr: { src, width: '64', height: '64' },
            });
            img.style.borderRadius = '50%';
            img.style.objectFit = 'cover';
            // Fall back to built-in SVG if the image fails to load
            img.addEventListener('error', () => {
                img.remove();
                wrapper.innerHTML = BUDDY_SVG;
            });
        }
    }

    // Pre-parse every emotion GIF once so later avatar swaps are instant
    // (no fetch / no LZW decode during the emotion's visible window).
    async _preloadEmotionAvatars() {
        const paths = Object.values(this.settings.emotionAvatars || {}).filter(Boolean);
        // For Clippy GIFs, also preload the _dark variants so theme switches are instant
        const withVariants = [];
        for (const p of paths) {
            withVariants.push(p);
            if (/\/Clippy\/clippy_[^_/]+\.gif$/i.test(p)) {
                withVariants.push(p.replace(/\.gif$/i, '_dark.gif'));
            }
        }
        const unique = [...new Set(withVariants)];
        for (const path of unique) {
            if (GIF_FRAME_CACHE.has(path)) continue;
            if (!/\.gif(\?.*)?$/i.test(path)) continue;
            try {
                const data = await this._fetchGifData(path, path);
                const frames = GifPlayer.parse(data);
                GIF_FRAME_CACHE.set(path, frames);
            } catch (e) {
                console.warn(`AI Buddy: preload failed for ${path}`, e);
            }
        }
    }

    // Fetch GIF bytes — uses requestUrl (bypasses CORS) for remote URLs,
    // readBinary for vault-local paths. `vaultPath` is the original path we're
    // loading (passed through since `src` may be a resource URL we can't re-parse).
    async _fetchGifData(src, vaultPath) {
        if (/^https?:\/\//i.test(src)) {
            const resp = await requestUrl({ url: src, method: 'GET' });
            return new Uint8Array(resp.arrayBuffer);
        }
        const buf = await this.app.vault.adapter.readBinary(vaultPath || this._currentAvatarPath);
        return new Uint8Array(buf);
    }

    removeBuddy() {
        clearTimeout(this.blinkTimer);
        clearTimeout(this.tipTimer);
        clearTimeout(this._emotionTimer);
        clearInterval(this._idleTimer);
        clearInterval(this._lookAroundTimer);
        this.blinkTimer = null;
        this.tipTimer = null;
        this._emotionTimer = null;
        this._idleTimer = null;
        this._lookAroundTimer = null;
        this._isIdle = false;
        clearTimeout(this._pipMoveTimer);
        this._pipMoveTimer = null;
        this._gifPlayer?.destroy();
        this._gifPlayer = null;
        this._renderComponents?.forEach(c => c.unload());
        this._renderComponents = [];
        this.clearQuoteWatcher();
        this.stopTrackingQuote();
        this.removeArrowIndicator();
        this.buddyEl?.remove();
        this.buddyEl = null;
        this.chatEl = null;
        this.bubbleTextEl = null;
        this.nameTagEl = null;
        this.avatarWrapperEl = null;
        this.tipBtnEl = null;
    }

    toggleBuddy() {
        this.buddyEl ? this.hideBuddy() : this.showBuddy();
    }

    showBuddy() {
        if (this.buddyEl) return;
        this.settings.showBuddy = true;
        this.saveSettings();
        this.createBuddy();
    }

    hideBuddy() {
        if (!this.buddyEl) return;
        this.settings.showBuddy = false;
        this.saveSettings();
        // Play disappear animation first, then remove
        this.triggerEmotion('disappear', { duration: 1800, animationMs: 1000 });
        setTimeout(() => this.removeBuddy(), 1000);
    }

    applyDirectionClass() {
        if (!this.buddyEl) return;
        this.buddyEl.removeClass('chat-direction-above', 'chat-direction-below');
        this.buddyEl.addClass(`chat-direction-${this.settings.chatDirection}`);
    }

    // Resolve an avatar preset's paths and write them into emotionAvatars.
    // For bundled presets, paths are prefixed with the plugin's install dir
    // (e.g. ".obsidian/plugins/ai-buddy/Gemmy/gemmy_idle.gif") so the vault
    // adapter can serve them directly.
    applyAvatarPreset(presetKey) {
        const preset = AVATAR_PRESETS[presetKey];
        if (!preset) return;
        this.settings.avatarPreset = presetKey;
        if (presetKey === 'custom') {
            // Leave user's existing paths alone
            return;
        }
        // Builtin presets use "builtin:" paths (inline SVG); bundled presets need
        // the plugin directory prefix so the vault adapter can serve the files.
        const base = preset.bundled ? `${this.manifest.dir}/` : '';
        const out  = {};
        for (const [emotion, relPath] of Object.entries(preset.paths)) {
            out[emotion] = relPath ? (preset.builtin ? relPath : `${base}${relPath}`) : '';
        }
        this.settings.emotionAvatars = out;
        // Kick off asset download in the background (no-op if already present)
        if (preset.bundled) this.ensurePresetAssets(presetKey);
    }

    // Download a bundled preset's asset files from the GitHub release if they
    // aren't already present in the plugin folder. Release assets are flat,
    // so each file's URL is https://.../releases/download/VERSION/FILENAME.
    async ensurePresetAssets(presetKey) {
        const preset = AVATAR_PRESETS[presetKey];
        if (!preset?.bundled) return;
        const adapter = this.app.vault.adapter;
        const version = this.manifest.version;
        const author  = this.manifest.author;
        const repo    = this.manifest.id === 'ai-buddy' ? 'AI-Buddy' : this.manifest.id;

        // Include _dark variants for Clippy (two GIFs per emotion: light + dark bg)
        const withVariants = [];
        for (const p of Object.values(preset.paths)) {
            if (!p) continue;
            withVariants.push(p);
            if (/\/Clippy\/clippy_[^_/]+\.gif$/i.test(p)) {
                withVariants.push(p.replace(/\.gif$/i, '_dark.gif'));
            }
        }
        const unique = [...new Set(withVariants)];
        for (const relPath of unique) {
            const fullPath = `${this.manifest.dir}/${relPath}`;
            try {
                if (await adapter.exists(fullPath)) continue;
                const dir = fullPath.substring(0, fullPath.lastIndexOf('/'));
                if (dir && !(await adapter.exists(dir))) await adapter.mkdir(dir);
                const filename = relPath.split('/').pop();
                const url = `https://github.com/${author}/${repo}/releases/download/${version}/${filename}`;
                const resp = await requestUrl({ url, method: 'GET' });
                await adapter.writeBinary(fullPath, resp.arrayBuffer);
            } catch (e) {
                console.warn(`AI Buddy: failed to fetch preset asset ${relPath}`, e);
            }
        }
        // Warm the frame cache so the first emotion swap is instant
        if (this.buddyEl) this._preloadEmotionAvatars();
    }

    applyTheme() {
        if (!this.buddyEl) return;
        const theme = THEMES[this.settings.theme] || THEMES.purple;
        this.buddyEl.style.setProperty('--buddy-primary',       theme.primary);
        this.buddyEl.style.setProperty('--buddy-primary-light', theme.light);
        this.buddyEl.style.setProperty('--buddy-primary-pale',  theme.pale);
        this.buddyEl.style.setProperty('--buddy-primary-dark',  theme.dark);
        const font = (this.settings.customFont || '').trim();
        this.buddyEl.style.setProperty('--buddy-font', font || '');

        // Apply visual style class
        for (const key of Object.keys(VISUAL_STYLES)) this.buddyEl.removeClass(`visual-${key}`);
        const style = VISUAL_STYLES[this.settings.visualStyle] ? this.settings.visualStyle : 'glow';
        this.buddyEl.addClass(`visual-${style}`);

        // Apply avatar-preset class (lets CSS tweak canvas shape etc. per preset)
        for (const key of Object.keys(AVATAR_PRESETS)) this.buddyEl.removeClass(`preset-${key}`);
        const presetKey = AVATAR_PRESETS[this.settings.avatarPreset] ? this.settings.avatarPreset : 'custom';
        this.buddyEl.addClass(`preset-${presetKey}`);
    }

    // ─── Emotions ──────────────────────────────────────────────────────────────

    triggerEmotion(key, opts = {}) {
        if (!this.buddyEl) return;
        if (!DEFAULT_EMOTIONS[key]) return;
        // Preview bypasses the master toggle so users can test from settings
        if (!this.settings.emotionsEnabled && !opts.preview) return;

        // Rate-limit: don't fire the same emotion more than once every 4s
        // (force/preview bypass this)
        this._lastEmotionTimes = this._lastEmotionTimes || {};
        const now  = Date.now();
        const last = this._lastEmotionTimes[key] || 0;
        if (!opts.force && !opts.preview && now - last < 4000) return;
        this._lastEmotionTimes[key] = now;

        // Pick a message (user override or default); "" means silent
        const custom = this.settings.emotionMessages?.[key];
        const raw    = (custom !== undefined && custom !== null && custom !== '')
            ? custom : DEFAULT_EMOTIONS[key].defaultMsg;
        const msgs   = String(raw).split('|').map(s => s.trim()).filter(Boolean);
        const msg    = msgs.length
            ? msgs[Math.floor(Math.random() * msgs.length)].replace(/\{name\}/g, this.settings.buddyName)
            : '';

        // Check for a custom avatar for this emotion
        const emotionAvatars  = this.settings.emotionAvatars || {};
        const emotionPath     = emotionAvatars[key] || '';
        const defaultPath     = emotionAvatars.default || '';
        const hasEmotionAsset = !!emotionPath && emotionPath !== defaultPath;
        // Only GIFs animate themselves; static images (SVG/PNG/JPG) need CSS motion
        const isSelfAnimating = hasEmotionAsset && /\.gif(\?.*)?$/i.test(emotionPath);

        // Reset animation class (force reflow so same-key retrigger works)
        for (const k of Object.keys(DEFAULT_EMOTIONS)) this.buddyEl.removeClass(`emotion-${k}`);
        void this.buddyEl.offsetWidth;
        // Apply CSS keyframe animation unless the asset self-animates (GIF)
        if (!isSelfAnimating) this.buddyEl.addClass(`emotion-${key}`);

        // Swap avatar to emotion-specific art if provided
        if (hasEmotionAsset) this._renderAvatar(emotionPath, true);

        // Show bubble unless explicitly silent or no message available
        if (msg && !opts.silent) {
            this.showBubble(msg, opts.duration ?? 3500);
        }

        // Preview mode: lift the buddy above any open Obsidian modal so the
        // user can see the emotion play from inside the settings panel
        if (opts.preview) this.buddyEl.addClass('is-previewing');

        clearTimeout(this._emotionTimer);
        if (key === 'idle') {
            this._isIdle = true;     // persistent state
        } else {
            // lookAround is part of idle behavior and shouldn't break idle state
            if (key !== 'lookAround') this._isIdle = false;
            const ms = opts.animationMs ?? 2500;
            this._emotionTimer = setTimeout(() => {
                this.buddyEl?.removeClass(`emotion-${key}`);
                this.buddyEl?.removeClass('is-previewing');
                // Restore default avatar (or idle avatar if still idle)
                if (hasEmotionAsset) {
                    const restorePath = this._isIdle
                        ? (emotionAvatars.idle || defaultPath)
                        : defaultPath;
                    this._renderAvatar(restorePath);
                }
                // If we're still idle, restore the idle animation (only when no custom idle asset)
                if (this._isIdle && !emotionAvatars.idle) this.buddyEl?.addClass('emotion-idle');
            }, ms);
        }
    }

    // Reset the idle watcher whenever the user interacts with the buddy
    registerBuddyInteraction() {
        this._lastInteraction = Date.now();
        if (this._isIdle) {
            this._isIdle = false;
            this.buddyEl?.removeClass('emotion-idle');
        }
    }

    startIdleWatcher() {
        clearInterval(this._idleTimer);
        clearInterval(this._lookAroundTimer);
        this._lastInteraction = Date.now();
        // Every 15s check if idle for > 60s; go idle silently
        this._idleTimer = setInterval(() => {
            if (!this.buddyEl || !this.settings.emotionsEnabled) return;
            if (this.chatEl?.hasClass('is-open')) return;
            const idleSecs = (Date.now() - (this._lastInteraction || 0)) / 1000;
            if (idleSecs > 60 && !this._isIdle) {
                this.triggerEmotion('idle', { silent: true, force: true });
            }
        }, 15000);
        // While idle, occasionally look around (~every 50s, 50% chance)
        this._lookAroundTimer = setInterval(() => {
            if (!this.buddyEl || !this.settings.emotionsEnabled) return;
            if (this.chatEl?.hasClass('is-open')) return;
            if (this._isIdle && Math.random() < 0.5) {
                this.triggerEmotion('lookAround', { duration: 3400, animationMs: 3100, force: true });
            }
        }, 50000);
    }

    // ─── Positioning ───────────────────────────────────────────────────────────
    //
    // We always store & apply position as {fromRight, fromBottom} so that the
    // element naturally tracks its corner during window resize (no JS needed).
    // The only time we need to re-run updateBuddyPosition is when the sidebar
    // width changes, which shifts the "note pane right edge".

    updateBuddyPosition() {
        if (!this.buddyEl) return;

        const container     = this.buddyEl.parentElement;
        const containerRect = container.getBoundingClientRect();
        const rightSplit    = this.app.workspace.rightSplit;
        const leftSplit     = this.app.workspace.leftSplit;

        // Use getBoundingClientRect for reliable sidebar edges (accounts for borders, resize handles)
        const sidebarR = (rightSplit && !rightSplit.collapsed)
            ? containerRect.right - rightSplit.containerEl.getBoundingClientRect().left
            : 0;
        const sidebarLRight = (leftSplit && !leftSplit.collapsed)
            ? leftSplit.containerEl.getBoundingClientRect().right - containerRect.left
            : 0;

        const containerW     = container.offsetWidth;
        const chipW          = this.buddyEl.offsetWidth;
        const effectiveChipW = chipW || 60;

        let rightVal;
        if (this.settings.savedPosition) {
            const { fromRight, fromBottom } = this.settings.savedPosition;
            rightVal = fromRight + sidebarR;
            this.buddyEl.style.bottom = `${fromBottom}px`;
        } else {
            rightVal = sidebarR + 20;
            this.buddyEl.style.bottom = '44px';
        }

        // Clamp so Chip stays between left sidebar and right sidebar
        const maxRight = containerW - sidebarLRight - effectiveChipW - 10;
        rightVal = Math.max(sidebarR, Math.min(rightVal, Math.max(0, maxRight)));
        this.buddyEl.style.right = `${rightVal}px`;

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
            this.registerBuddyInteraction();

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

            const container     = this.buddyEl.parentElement;
            const containerRect = container.getBoundingClientRect();
            const leftSplit     = this.app.workspace.leftSplit;
            const rightSplit    = this.app.workspace.rightSplit;
            const minLeft = (leftSplit && !leftSplit.collapsed)
                ? leftSplit.containerEl.getBoundingClientRect().right - containerRect.left + 10
                : 0;
            const maxLeft = (rightSplit && !rightSplit.collapsed)
                ? rightSplit.containerEl.getBoundingClientRect().left - containerRect.left - this.buddyEl.offsetWidth - 10
                : container.offsetWidth - this.buddyEl.offsetWidth;
            const maxTop  = container.offsetHeight - this.buddyEl.offsetHeight;
            this.buddyEl.style.left = `${Math.max(minLeft, Math.min(startLeft + dx, maxLeft))}px`;
            this.buddyEl.style.top  = `${Math.max(0, Math.min(startTop  + dy, maxTop))}px`;

            // Reposition chat/bubble dynamically while dragging
            if (this.chatEl?.hasClass('is-open')) this.ensureChatFits();
            if (this.buddyEl.hasClass('bubble-visible')) this._positionBubble();
        };

        const onMouseUp = () => {
            if (!dragging) return;
            dragging = false;
            this.buddyEl?.removeClass('is-dragging');

            // Track repeated drags — 3+ drags within 12s = rough handling, angry reaction
            if (dragMoved) {
                this._recentDrags = (this._recentDrags || []).filter(t => Date.now() - t < 12000);
                this._recentDrags.push(Date.now());
                if (this._recentDrags.length >= 3) {
                    this.triggerEmotion('angry', { animationMs: 2500, duration: 3500 });
                    this._recentDrags = [];
                } else if (this._recentDrags.length === 2 && Math.random() < 0.4) {
                    // Occasional happy/excited on normal drag around
                    this.triggerEmotion(Math.random() < 0.5 ? 'happy' : 'excited', { silent: true, animationMs: 2200 });
                }
            }

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

    // Pick direction/alignment for the speech bubble so it stays on-screen.
    // Mirrors the chat positioning logic (accounts for left sidebar, picks
    // above vs below and left vs right based on available space).
    _positionBubble() {
        if (!this.buddyEl) return;
        const container     = this.buddyEl.parentElement;
        if (!container) return;
        const containerRect = container.getBoundingClientRect();
        const buddyRect     = this.buddyEl.getBoundingClientRect();
        const leftSplit     = this.app.workspace.leftSplit;
        const sidebarLEdge  = (leftSplit && !leftSplit.collapsed)
            ? leftSplit.containerEl.getBoundingClientRect().right : containerRect.left;

        // Conservative bubble dimension estimates (max-width 260 + padding)
        const bubbleW = 290;
        const bubbleH = 90;

        // Horizontal: right-align (bubble extends LEFT from Chip's right edge)
        // requires enough usable space to the left of Chip
        const usableLeft = buddyRect.right - sidebarLEdge;
        const alignRight = usableLeft >= bubbleW;
        this.buddyEl.removeClass('bubble-align-left', 'bubble-align-right');
        this.buddyEl.addClass(alignRight ? 'bubble-align-right' : 'bubble-align-left');

        // Vertical: above if there's room, otherwise below
        const spaceAbove = buddyRect.top - containerRect.top;
        const spaceBelow = containerRect.bottom - buddyRect.bottom;
        const directionAbove = spaceAbove >= bubbleH + 10 || spaceAbove > spaceBelow;
        this.buddyEl.removeClass('bubble-direction-above', 'bubble-direction-below');
        this.buddyEl.addClass(directionAbove ? 'bubble-direction-above' : 'bubble-direction-below');
    }

    showBubble(text, duration = 5000) {
        if (!this.bubbleTextEl || !this.buddyEl) return;
        this.bubbleTextEl.textContent = text;
        this._positionBubble();
        this.buddyEl.addClass('bubble-visible');
        clearTimeout(this._bubbleTimer);
        if (duration > 0) {
            this._bubbleTimer = setTimeout(() => {
                this.buddyEl?.removeClass('bubble-visible');
                // Auto-dismissed with a pending tip still unread → disappointed
                if (this.pendingTip) {
                    this.pendingTip = null;
                    this.triggerEmotion('disappoint', { animationMs: 2500, duration: 3500 });
                }
            }, duration);
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

        // Clean up previous render components
        this._renderComponents?.forEach(c => c.unload());
        this._renderComponents = [];

        if (this.chatMessages.length === 0) {
            const welcome = this.messagesEl.createEl('div', { cls: 'ai-buddy-welcome' });
            welcome.createEl('div', { cls: 'ai-buddy-welcome-gem', text: '✦' });
            welcome.createEl('p', { text: `Hey! I'm ${this.settings.buddyName}, your vault assistant.` });
            welcome.createEl('p', { cls: 'ai-buddy-welcome-sub', text: 'I can see your current note and help you write, think, or brainstorm.' });
        }

        for (const msg of this.chatMessages) {
            const msgEl = this.messagesEl.createEl('div', { cls: `ai-buddy-message ai-buddy-msg-${msg.role}` });
            if (msg.role === 'assistant') msgEl.createEl('span', { cls: 'ai-buddy-msg-gem', text: '✦' });

            const bodyEl = msgEl.createEl('div', { cls: 'ai-buddy-msg-body' });

            if (msg.role === 'assistant') {
                // Render markdown for assistant messages
                const comp = new Component();
                comp.load();
                this._renderComponents.push(comp);
                const sourcePath = this.app.workspace.getActiveFile()?.path || '';
                MarkdownRenderer.render(this.app, msg.content, bodyEl, sourcePath, comp);

                // Action buttons inside the bubble
                const actions = bodyEl.createEl('div', { cls: 'ai-buddy-msg-actions' });
                const copyBtn = actions.createEl('button', {
                    cls: 'ai-buddy-msg-action-btn',
                    attr: { title: 'Copy message' },
                    text: '📋',
                });
                copyBtn.addEventListener('click', () => {
                    navigator.clipboard.writeText(msg.content);
                    copyBtn.textContent = '✓';
                    setTimeout(() => copyBtn.textContent = '📋', 1500);
                });
                const insertBtn = actions.createEl('button', {
                    cls: 'ai-buddy-msg-action-btn',
                    attr: { title: 'Insert at cursor' },
                    text: '⎀',
                });
                insertBtn.addEventListener('click', () => {
                    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
                    if (view?.editor) {
                        view.editor.replaceSelection(msg.content);
                        insertBtn.textContent = '✓';
                        setTimeout(() => insertBtn.textContent = '⎀', 1500);
                    }
                });
            } else {
                bodyEl.textContent = msg.content;
            }
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
        this._chatHadMessages = true;
        this.registerBuddyInteraction();
        // Longer messages feel more engaged → excited; short ones → happy
        this.triggerEmotion(text.length > 60 ? 'excited' : 'happy', { silent: true, animationMs: 2200 });
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
            // Occasional happy reaction on successful reply (30% chance, silent)
            if (Math.random() < 0.3) this.triggerEmotion('happy', { silent: true, animationMs: 2200 });
        } catch (err) {
            thinkEl.remove();
            this.chatMessages.push({ role: 'assistant', content: `Hmm, something went wrong: ${err.message}` });
            this.triggerEmotion('angry', { silent: true, animationMs: 2500 });
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
        this.registerBuddyInteraction();
        this._chatOpenedAt = Date.now();
        this._chatHadMessages = false;

        // Opening chat counts as engaging — trigger happy reaction (silent)
        const wasPending = !!this.pendingTip;

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
        this.ensureChatFits();
        this.triggerEmotion(wasPending ? 'excited' : 'happy', { silent: true, animationMs: 2200 });
        setTimeout(() => this.textareaEl?.focus(), 100);
    }

    // Dynamically position the chat so it stays fully on-screen.
    // 1. Pick horizontal alignment (left or right) based on available space.
    // 2. Try the preferred vertical direction; if the chat won't fit, flip.
    // 3. If neither direction has enough room, shrink the chat's max-height
    //    to fit the available space instead of moving Chip. Chip stays put.
    ensureChatFits() {
        if (!this.buddyEl || !this.chatEl) return;

        const container     = this.buddyEl.parentElement;
        const containerRect = container.getBoundingClientRect();
        const buddyRect     = this.buddyEl.getBoundingClientRect();
        const chatW  = 320;
        const chatH  = 460;   // max chat height
        const minH   = 220;   // minimum usable chat height
        const gap    = 10;
        const needed = chatH + gap;
        let   dir    = this.settings.chatDirection;

        // ── Horizontal: align chat to whichever side has room ──
        const leftSplit    = this.app.workspace.leftSplit;
        const sidebarLEdge = (leftSplit && !leftSplit.collapsed)
            ? leftSplit.containerEl.getBoundingClientRect().right : containerRect.left;
        const usableLeft = buddyRect.right - sidebarLEdge;
        const alignRight = usableLeft >= chatW;

        this.buddyEl.removeClass('chat-align-left', 'chat-align-right');
        this.buddyEl.addClass(alignRight ? 'chat-align-right' : 'chat-align-left');

        // ── Vertical: pick direction with more room, shrink if still tight ──
        const spaceAbove = buddyRect.top - containerRect.top;
        const spaceBelow = containerRect.bottom - buddyRect.bottom;

        // Try preferred direction; flip only if the other side has clearly more room
        const prefSpace = dir === 'above' ? spaceAbove : spaceBelow;
        if (prefSpace < needed) {
            const flipDir   = dir === 'above' ? 'below' : 'above';
            const flipSpace = dir === 'above' ? spaceBelow : spaceAbove;
            if (flipSpace >= needed || flipSpace > prefSpace) dir = flipDir;
        }

        // Apply direction class
        this.buddyEl.removeClass('chat-direction-above', 'chat-direction-below');
        this.buddyEl.addClass(`chat-direction-${dir}`);

        // Resize chat max-height to fit available space (never moves Chip)
        const chosenSpace = dir === 'above' ? spaceAbove : spaceBelow;
        const fitH = Math.max(minH, Math.min(chatH, chosenSpace - gap - 8));
        this.chatEl.style.maxHeight = `${fitH}px`;
    }

    closeChat() {
        // Emotion reactions to how the chat was closed
        const openedAt     = this._chatOpenedAt || 0;
        const openDuration = Date.now() - openedAt;
        const hadMessages  = !!this._chatHadMessages;

        this.chatEl?.removeClass('is-open');
        this.buddyEl?.removeClass('chat-open');
        this.buddyEl?.removeClass('chat-align-left', 'chat-align-right');
        // Reset dynamic chat sizing + restore preferred direction
        if (this.chatEl) this.chatEl.style.maxHeight = '';
        this.applyDirectionClass();

        if (openedAt > 0) {
            if (!hadMessages && openDuration < 2000) {
                // Opened and dismissed in <2s without saying anything → annoyed
                this.triggerEmotion('angry', { animationMs: 2500, duration: 3500 });
            } else if (!hadMessages && openDuration >= 2000) {
                // Opened, looked, left without asking → disappointed
                this.triggerEmotion('disappoint', { animationMs: 2500, duration: 3500 });
            }
        }
        this._chatOpenedAt = 0;
        this._chatHadMessages = false;
    }

    // ─── Settings ──────────────────────────────────────────────────────────────

    async loadSettings() {
        const saved = await this.loadData() || {};
        this.settings = Object.assign({}, DEFAULT_SETTINGS, saved);
        if (!this.settings.emotionAvatars) this.settings.emotionAvatars = {};

        // Migrate: legacy single `avatarPath` → emotionAvatars.default
        if (this.settings.avatarPath && !this.settings.emotionAvatars.default) {
            this.settings.emotionAvatars.default = this.settings.avatarPath;
            this.settings.avatarPath = '';
            await this.saveData(this.settings);
        }

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

    hide() {
        document.body.classList.remove('ai-buddy-settings-open');
    }

    display() {
        const { containerEl } = this;
        containerEl.empty();
        containerEl.addClass('ai-buddy-settings');
        // Flag the body so CSS can keep the buddy visible + on top while we're
        // looking at his settings (so users can see him react while tweaking).
        document.body.classList.add('ai-buddy-settings-open');

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
                    v ? this.plugin.showBuddy() : this.plugin.hideBuddy();
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
                    if (this.plugin.tipBtnEl) this.plugin.tipBtnEl.setAttribute('title', `Get a tip from ${this.plugin.settings.buddyName}`);
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

        // ── Avatar preset ──────────────────────────────────────────
        new Setting(containerEl)
            .setName('Avatar preset')
            .setDesc('Pick a pre-built avatar set, or choose Custom to enter your own paths per emotion below.')
            .addDropdown(d => {
                for (const [key, p] of Object.entries(AVATAR_PRESETS)) d.addOption(key, p.label);
                d.setValue(this.plugin.settings.avatarPreset || 'custom')
                    .onChange(async v => {
                        this.plugin.applyAvatarPreset(v);
                        await this.plugin.saveSettings();
                        if (this.plugin.buddyEl) {
                            this.plugin.applyTheme();   // updates preset-X class
                            this.plugin._renderAvatar(this.plugin.settings.emotionAvatars.default || '');
                        }
                        this.display();   // refresh to show new paths
                    });
            });

        const activePreset = AVATAR_PRESETS[this.plugin.settings.avatarPreset || 'custom'];
        if (activePreset?.credit) {
            containerEl.createEl('p', {
                cls: 'setting-item-description',
                text: activePreset.credit,
            }).style.marginBottom = '8px';
        }

        // Default avatar path — per-emotion avatars live in the Personality section
        new Setting(containerEl)
            .setName('Default avatar')
            .setDesc('Shown when no emotion is active. Accepts a vault path (e.g. attachments/pip.gif), an https URL to a .gif / .png / .jpg / .webp, a "builtin:" ref, or leave empty for built-in Chip.')
            .addText(t => t
                .setPlaceholder('path / URL / builtin:chip/idle')
                .setValue(this.plugin.settings.emotionAvatars?.default || '')
                .onChange(async v => {
                    this.plugin.settings.emotionAvatars = this.plugin.settings.emotionAvatars || {};
                    this.plugin.settings.emotionAvatars.default = v.trim();
                    this.plugin.settings.avatarPreset = 'custom';
                    await this.plugin.saveSettings();
                    if (this.plugin.buddyEl) this.plugin._renderAvatar(v.trim());
                }));

        new Setting(containerEl)
            .setName('GIF playback speed')
            .setDesc('Speed for the default/idle avatar. 0 = paused, 1× = original, 2× = double. Emotion GIFs (angry, happy, etc.) always play at 1× or faster.')
            .addSlider(s => s
                .setLimits(0, 2, 0.10)
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

        // ── Appearance ────────────────────────────────────────────
        containerEl.createEl('h3', { text: 'Appearance' });

        const styleKey    = this.plugin.settings.visualStyle || 'glow';
        const styleSetting = new Setting(containerEl)
            .setName('Visual style')
            .setDesc(VISUAL_STYLES[styleKey]?.description || 'Overall aesthetic of the buddy UI.');
        styleSetting.addDropdown(d => {
            for (const [key, s] of Object.entries(VISUAL_STYLES)) d.addOption(key, s.label);
            d.setValue(styleKey)
                .onChange(async v => {
                    this.plugin.settings.visualStyle = v;
                    await this.plugin.saveSettings();
                    this.plugin.applyTheme();
                    this.display();   // refresh description
                });
        });

        const themeSetting = new Setting(containerEl)
            .setName('Accent color')
            .setDesc('Color palette that drives each visual style. Try Sunset + Terminal for an amber CRT, Forest + Terminal for the classic Matrix look, Rose + Neon for pink cyberpunk, or any palette with Paper/Cozy for pastel variations.');
        themeSetting.addDropdown(d => {
            for (const [key, t] of Object.entries(THEMES)) d.addOption(key, t.label);
            d.setValue(this.plugin.settings.theme || 'purple')
                .onChange(async v => {
                    this.plugin.settings.theme = v;
                    await this.plugin.saveSettings();
                    this.plugin.applyTheme();
                });
        });

        new Setting(containerEl)
            .setName('Custom font')
            .setDesc('CSS font-family for buddy UI (e.g. "Comic Sans MS", "JetBrains Mono", "Inter"). Leave empty to use Obsidian default.')
            .addText(t => t
                .setPlaceholder('e.g. "JetBrains Mono", monospace')
                .setValue(this.plugin.settings.customFont || '')
                .onChange(async v => {
                    this.plugin.settings.customFont = v;
                    await this.plugin.saveSettings();
                    this.plugin.applyTheme();
                }));

        new Setting(containerEl)
            .setName('Reset position')
            .setDesc(`Snap ${this.plugin.settings.buddyName} back to the default bottom-right corner.`)
            .addButton(b => b
                .setButtonText('Reset')
                .onClick(async () => {
                    this.plugin.settings.savedPosition = null;
                    await this.plugin.saveSettings();
                    this.plugin.updateBuddyPosition();
                }));

        new Setting(containerEl)
            .setName('Proactive tips')
            .setDesc(`${this.plugin.settings.buddyName} will occasionally pop up with a note-related tip.`)
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
            .setDesc(`How often ${this.plugin.settings.buddyName} checks in automatically.`)
            .addSlider(s => s
                .setLimits(2, 30, 1)
                .setValue(this.plugin.settings.tipIntervalMinutes)
                .setDynamicTooltip()
                .onChange(async v => {
                    this.plugin.settings.tipIntervalMinutes = v;
                    await this.plugin.saveSettings();
                }));

        // ── Personality ─────────────────────────────────────────
        containerEl.createEl('h3', { text: 'Personality' });

        new Setting(containerEl)
            .setName('Emotions enabled')
            .setDesc(`Let ${this.plugin.settings.buddyName} react to events with animations and bubble messages.`)
            .addToggle(t => t
                .setValue(this.plugin.settings.emotionsEnabled ?? true)
                .onChange(async v => {
                    this.plugin.settings.emotionsEnabled = v;
                    await this.plugin.saveSettings();
                }));

        const emotionDesc = containerEl.createEl('p', {
            cls: 'setting-item-description',
            text: `Messages: separate alternates with a pipe ( | ), use {name} for the buddy's name. Avatars accept a vault path (attachments/foo.gif), an https URL (.gif/.png/.jpg/.webp), or a "builtin:" ref. Leave empty to reuse default. ▶ to preview.`,
        });
        emotionDesc.style.marginBottom = '6px';

        for (const [key, def] of Object.entries(DEFAULT_EMOTIONS)) {
            const row = new Setting(containerEl).setName(def.label);
            row.settingEl.addClass('ai-buddy-emotion-row');
            row.addText(t => {
                t.inputEl.addClass('ai-buddy-emotion-msg-input');
                t.setPlaceholder('message (pipe-separated)')
                    .setValue(this.plugin.settings.emotionMessages?.[key] || '')
                    .onChange(async v => {
                        this.plugin.settings.emotionMessages = this.plugin.settings.emotionMessages || {};
                        this.plugin.settings.emotionMessages[key] = v;
                        await this.plugin.saveSettings();
                    });
            });
            row.addText(t => {
                t.inputEl.addClass('ai-buddy-emotion-avatar-input');
                t.setPlaceholder('vault path / URL / builtin:')
                    .setValue(this.plugin.settings.emotionAvatars?.[key] || '')
                    .onChange(async v => {
                        this.plugin.settings.emotionAvatars = this.plugin.settings.emotionAvatars || {};
                        this.plugin.settings.emotionAvatars[key] = v.trim();
                        this.plugin.settings.avatarPreset = 'custom';
                        await this.plugin.saveSettings();
                    });
            });
            row.addButton(b => b
                .setButtonText('▶')
                .setTooltip('Preview this emotion')
                .onClick(() => this.plugin.triggerEmotion(key, { preview: true })));
        }

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
            .setDesc(`Tell ${this.plugin.settings.buddyName} what kind of tips to give when it pops up automatically. The note content is always included.`)
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
