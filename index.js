import React from "react";
import { createRoot } from "react-dom/client";

// index.js
// Simple React PWA single-file starter.
// Assumes React and react-dom/client are available in your build (create-react-app, Vite, etc).


/* --- ensure root element exists --- */
let rootEl = document.getElementById("root");
if (!rootEl) {
    rootEl = document.createElement("div");

    // Lock page title to "Prasadam Connect" so later assignments won't override it
    (function(){
        const FIXED_TITLE = "Prasadam Connect Mobile App";

        function ensureTitleElement() {
            let el = document.querySelector("title");
            if (!el) {
                el = document.createElement("title");
                document.head.appendChild(el);
            }
            el.textContent = FIXED_TITLE;
            return el;
        }

        Object.defineProperty(document, "title", {
            configurable: true,
            enumerable: true,
            get() { return FIXED_TITLE; },
            set(_) {
                ensureTitleElement();
            }
        });

        // initialize
        const titleEl = ensureTitleElement();

        // Optional: revert any DOM mutations to the <title> element
        try {
            const mo = new MutationObserver(() => ensureTitleElement());
            mo.observe(titleEl, { childList: true, characterData: true, subtree: true });
        } catch (err) {
            // MutationObserver may be blocked in some environments — ignore
        }
    })();
    rootEl.id = "root";
    document.body.appendChild(rootEl);
}

/* --- inject Google Fonts, meta and basic head elements --- */
if (!document.querySelector('link[href*="fonts.googleapis.com"]')) {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href =
        "https://fonts.googleapis.com/css2?family=Poppins:wght@300;600;800&display=swap";
    document.head.appendChild(link);
}
if (!document.querySelector('meta[name="viewport"]')) {
    const meta = document.createElement("meta");
    meta.name = "viewport";
    meta.content = "width=device-width,initial-scale=1,viewport-fit=cover";
    document.head.appendChild(meta);
}
document.title = "Hello World PWA";

/* --- inject minimal CSS for fancy look --- */
const css = `
    :root {
        --bg1: #0f172a;
        --bg2: #071033;
        --accent: #06b6d4;
        --card: rgba(255,255,255,0.06);
        --glass: rgba(255,255,255,0.04);
    }
    html,body,#root { height:100%; margin:0; font-family: 'Poppins', system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial; }
    body {
        background: radial-gradient(1200px 600px at 10% 20%, rgba(6,182,212,0.08), transparent),
                                radial-gradient(900px 400px at 90% 80%, rgba(99,102,241,0.06), transparent),
                                linear-gradient(180deg, var(--bg1), var(--bg2));
        color: #fff;
        -webkit-font-smoothing:antialiased;
        display:flex;
        align-items:center;
        justify-content:center;
        padding:24px;
        box-sizing:border-box;
    }
    .card {
        width:100%;
        max-width:880px;
        background: linear-gradient(180deg, rgba(255,255,255,0.03), rgba(255,255,255,0.02));
        border: 1px solid rgba(255,255,255,0.06);
        border-radius:20px;
        padding:36px;
        box-shadow: 0 10px 30px rgba(2,6,23,0.6);
        display:flex;
        gap:28px;
        align-items:center;
        backdrop-filter: blur(6px) saturate(120%);
    }
    .logo {
        width:140px;
        height:140px;
        border-radius:18px;
        background: linear-gradient(135deg, rgba(6,182,212,0.12), rgba(99,102,241,0.1));
        display:flex;
        align-items:center;
        justify-content:center;
        flex-shrink:0;
        border:1px solid rgba(255,255,255,0.04);
        animation: float 6s ease-in-out infinite;
    }
    .logo svg { width:76px; height:76px; filter: drop-shadow(0 6px 18px rgba(2,6,23,0.6)); }
    @keyframes float { 0% {transform:translateY(0)} 50% {transform:translateY(-10px)} 100% {transform:translateY(0)} }
    h1 {
        margin:0;
        font-weight:800;
        letter-spacing:-0.02em;
        font-size: clamp(28px, 5vw, 48px);
        line-height:1.02;
        color: #fff;
        text-shadow: 0 6px 30px rgba(6,182,212,0.06);
    }
    p.lead {
        margin:8px 0 0 0;
        color: rgba(255,255,255,0.8);
        font-weight:600;
    }
    .badges { margin-top:18px; display:flex; gap:12px; flex-wrap:wrap; }
    .badge {
        background:var(--glass);
        border-radius:999px;
        padding:8px 14px;
        font-size:13px;
        color: rgba(255,255,255,0.9);
        display:inline-flex;
        align-items:center;
        gap:8px;
        border:1px solid rgba(255,255,255,0.03);
        transition: transform .18s ease, box-shadow .18s ease;
    }
    .badge:hover { transform:translateY(-4px); box-shadow: 0 10px 24px rgba(2,6,23,0.5); }
    .accent { color: var(--accent); font-weight:800; }
    .right { flex:1; display:flex; flex-direction:column; justify-content:center; }
    @media (max-width:720px) {
        .card { flex-direction:column; padding:22px; }
        .logo { width:110px; height:110px; }
    }
`;
const style = document.createElement("style");
style.textContent = css;
document.head.appendChild(style);

/* --- dynamic web app manifest (small) --- */
const manifest = {
    short_name: "HelloPWA",
    name: "Hello World PWA",
    start_url: ".",
    display: "standalone",
    background_color: "#0f172a",
    theme_color: "#06b6d4",
    icons: [
        {
            src: "data:image/svg+xml;utf8," + encodeURIComponent(
                '<svg xmlns="http://www.w3.org/2000/svg" width="192" height="192" viewBox="0 0 24 24" fill="none"><rect width="24" height="24" rx="4" fill="%2306b6d4"/><text x="50%" y="55%" font-family="Poppins, sans-serif" font-weight="700" font-size="10" text-anchor="middle" fill="%230f172a">HW</text></svg>'
            ),
            sizes: "192x192",
            type: "image/svg+xml"
        }
    ]
};
const manifestBlob = new Blob([JSON.stringify(manifest)], { type: "application/json" });
const manifestURL = URL.createObjectURL(manifestBlob);
if (!document.querySelector('link[rel="manifest"]')) {
    const l = document.createElement("link");
    l.rel = "manifest";
    l.href = manifestURL;
    document.head.appendChild(l);
}

/* --- register a small service worker created from a blob so this file is self-contained --- */
if ("serviceWorker" in navigator) {
    const swCode = `
        const CACHE = "hello-pwa-v1";
        const resourcesToCache = ["/", "./"];
        self.addEventListener("install", (e) => {
            self.skipWaiting();
            e.waitUntil(
                caches.open(CACHE).then(c => c.addAll(resourcesToCache)).catch(()=>{})
            );
        });
        self.addEventListener("activate", (e) => {
            e.waitUntil(self.clients.claim());
        });
        self.addEventListener("fetch", (e) => {
            // Simple network-first for same-origin navigation + cache fallback
            if (e.request.mode === "navigate") {
                e.respondWith(fetch(e.request).catch(()=>caches.match("/")));
                return;
            }
            e.respondWith(
                caches.match(e.request).then(cached => cached || fetch(e.request).catch(()=>cached))
            );
        });
    `;
    try {
        const swBlob = new Blob([swCode], { type: "application/javascript" });
        const swUrl = URL.createObjectURL(swBlob);
        navigator.serviceWorker.register(swUrl).catch(() => {});
    } catch (err) {
        // ignore registration failures in dev environments
    }
}

/* --- React app --- */
function Logo() {
    return (
        <div className="logo" aria-hidden>
            <svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg">
                <defs>
                    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
                        <stop offset="0" stopColor="#06b6d4"/>
                        <stop offset="1" stopColor="#6366f1"/>
                    </linearGradient>
                </defs>
                <rect x="8" y="8" width="104" height="104" rx="16" fill="url(#g)"/>
                <text x="50%" y="58%" fontFamily="Poppins, system-ui, sans-serif" fontWeight="800" fontSize="46" textAnchor="middle" fill="#071033">H</text>
            </svg>
        </div>
    );
}

function App() {
    return (
        <div style={{ padding: 12 }}>
            <div className="card" role="main" aria-labelledby="hello">
                <Logo />
                <div className="right">
                    <h1 id="hello">
                        Hello World<span className="accent">.</span>
                    </h1>
                    <p className="lead">A tiny React progressive web app — fancy fonts, colors and subtle motion.</p>
                    <div className="badges" aria-hidden>
                        <div className="badge">React</div>
                        <div className="badge">PWA Ready</div>
                        <div className="badge">Fancy Fonts</div>
                        <div className="badge">Responsive</div>
                    </div>
                </div>
            </div>
        </div>
    );
}

/* --- render --- */
const root = createRoot(rootEl);
root.render(<App />);