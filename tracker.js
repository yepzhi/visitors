/* ═══════════════════════════════════════════
   UNIVERSAL TRACKER — yepzhi.com Meta-Analytics
   Set window.NEOSYS_SITE_ID for a stable site key when possible.
   ═══════════════════════════════════════════ */

(function () {
    const FIREBASE_CONFIG = {
        apiKey: "AIzaSyD-tbdD6eHip2fCBAJnGEj3_4eqLMc1EhE",
        authDomain: "neosys-4dc42.firebaseapp.com",
        projectId: "neosys-4dc42",
        storageBucket: "neosys-4dc42.firebasestorage.app",
        messagingSenderId: "1009059504450",
        appId: "1:1009059504450:web:d26dd042f2139dcaa6e8db",
        measurementId: "G-V2FD2WR82B"
    };

    function resolveSiteId() {
        if (window.NEOSYS_SITE_ID != null && String(window.NEOSYS_SITE_ID).trim() !== '') {
            return String(window.NEOSYS_SITE_ID).trim().slice(0, 64);
        }
        const host = (window.location.hostname || '').toLowerCase();
        if (!host) return 'main';
        if (host === 'yepzhi.com' || host === 'www.yepzhi.com') return 'main';
        if (host.endsWith('.yepzhi.com')) {
            const sub = host.replace(/\.yepzhi\.com$/i, '').replace(/^www\./, '');
            return sub || 'main';
        }
        return host.replace(/^www\./, '').replace(/\./g, '-').slice(0, 64) || 'main';
    }

    const siteId = resolveSiteId();

    const loadScript = (url) => {
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = url;
            script.onload = resolve;
            script.onerror = reject;
            document.head.appendChild(script);
        });
    };

    async function fetchGeo() {
        const empty = {
            city: 'Unknown',
            country: 'Unknown',
            country_code: '??',
            latitude: 0,
            longitude: 0
        };
        try {
            const res = await fetch('https://ipapi.co/json/');
            const data = await res.json();
            if (!data || data.error || data.reason) return empty;
            return {
                city: data.city || empty.city,
                country: data.country_name || empty.country,
                country_code: data.country_code || empty.country_code,
                latitude: typeof data.latitude === 'number' ? data.latitude : 0,
                longitude: typeof data.longitude === 'number' ? data.longitude : 0
            };
        } catch {
            return empty;
        }
    }

    async function initTracker() {
        try {
            if (typeof firebase === 'undefined') {
                await loadScript('https://www.gstatic.com/firebasejs/8.10.1/firebase-app.js');
                await loadScript('https://www.gstatic.com/firebasejs/8.10.1/firebase-firestore.js');
            }

            if (!firebase.apps.length) {
                firebase.initializeApp(FIREBASE_CONFIG);
            }
            const db = firebase.firestore();

            const geo = await fetchGeo();

            const visitData = {
                site: siteId,
                path: window.location.pathname,
                full_url: window.location.href,
                referrer: document.referrer || 'direct',
                city: geo.city,
                country: geo.country,
                country_code: geo.country_code,
                latitude: geo.latitude,
                longitude: geo.longitude,
                timestamp: firebase.firestore.FieldValue.serverTimestamp(),
                user_agent: navigator.userAgent,
                language: navigator.language
            };

            await db.collection('visits').add(visitData);
            console.log('[Yepzhi-Tracker] Visit logged:', siteId);
        } catch (error) {
            console.warn('[Yepzhi-Tracker] Tracking error:', error);
        }
    }

    if (document.readyState === 'complete') {
        initTracker();
    } else {
        window.addEventListener('load', initTracker);
    }
})();
