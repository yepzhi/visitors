/* ═══════════════════════════════════════════
   UNIVERSAL TRACKER — yepzhi.com Meta-Analytics
   Usage: Add this script to any site to track globally.
   ═══════════════════════════════════════════ */

(function() {
    // 1. CONFIGURATION
    const FIREBASE_CONFIG = {
        apiKey: "AIzaSyD-tbdD6eHip2fCBAJnGEj3_4eqLMc1EhE",
        authDomain: "neosys-4dc42.firebaseapp.com",
        projectId: "neosys-4dc42",
        storageBucket: "neosys-4dc42.firebasestorage.app",
        messagingSenderId: "1009059504450",
        appId: "1:1009059504450:web:d26dd042f2139dcaa6e8db",
        measurementId: "G-V2FD2WR82B"
    };

    // Site Identification
    const siteId = window.NEOSYS_SITE_ID || window.location.hostname.replace('yepzhi.com', '').replace(/\//g, '') || 'main';

    // 2. LOAD FIREBASE (Async)
    const loadScript = (url) => {
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = url;
            script.onload = resolve;
            script.onerror = reject;
            document.head.appendChild(script);
        });
    };

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

            // 3. GET GEO DATA (IP-API)
            const geoResponse = await fetch('https://ipapi.co/json/');
            const geoData = await geoResponse.json();

            // 4. LOG VISIT
            const visitData = {
                site: siteId,
                path: window.location.pathname,
                full_url: window.location.href,
                referrer: document.referrer || 'direct',
                city: geoData.city || 'Unknown',
                country: geoData.country_name || 'Unknown',
                country_code: geoData.country_code || '??',
                latitude: geoData.latitude || 0,
                longitude: geoData.longitude || 0,
                timestamp: firebase.firestore.FieldValue.serverTimestamp(),
                user_agent: navigator.userAgent,
                language: navigator.language
            };

            await db.collection('visits').add(visitData);
            console.log(`[Neosys-Tracker] Visit logged for ${siteId}`);

        } catch (error) {
            console.warn("[Neosys-Tracker] Tracking error:", error);
        }
    }

    // Initialize after a small delay to avoid blocking main content
    if (document.readyState === 'complete') {
        initTracker();
    } else {
        window.addEventListener('load', initTracker);
    }
})();
