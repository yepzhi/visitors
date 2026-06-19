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
        } catch (e) {
            // Silently fallback to empty geolocation
            return empty;
        }
    }

    async function initTracker() {
        try {
            if (typeof firebase === 'undefined') {
                await loadScript('https://www.gstatic.com/firebasejs/8.10.1/firebase-app.js');
                await loadScript('https://www.gstatic.com/firebasejs/8.10.1/firebase-firestore.js');
            }

            let trackerApp;
            const APP_NAME = 'yepzhi_tracker';
            
            trackerApp = firebase.apps.find(a => a.name === APP_NAME);
            if (!trackerApp) {
                trackerApp = firebase.initializeApp(FIREBASE_CONFIG, APP_NAME);
            }
            const db = trackerApp.firestore();

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
            // Discrete log for tracking-only issues
            if (error && error.code === 'permission-denied') {
                console.log('%c [Yepzhi-Tracker] ', 'background:#333;color:#999;font-size:10px;', 'Tracking limited (Permissions)');
            } else {
                console.warn('[Yepzhi-Tracker] Tracking error:', error);
            }
        }
    }

    function initCookieConsent() {
        if (siteId !== 'jovenesstem') {
            return;
        }
        if (localStorage.getItem('yepzhi_cookie_consent') === 'true') {
            return;
        }

        const htmlLang = (document.documentElement.lang || '').toLowerCase();
        const navLang = (navigator.language || '').toLowerCase();
        const isSpanish = htmlLang.startsWith('es') || navLang.startsWith('es') || 
            document.cookie.includes('geo-lang=es') || document.cookie.includes('jovenesstem-geo-lang=es');

        const text = isSpanish 
            ? 'Usamos cookies para mejorar tu experiencia.' 
            : 'We use cookies to improve your experience.';
        const btnText = isSpanish ? 'Aceptar' : 'Accept';

        // Create style element
        const style = document.createElement('style');
        style.innerHTML = `
            #yepzhi-cookie-banner {
                position: fixed;
                bottom: 20px;
                right: 20px;
                background: rgba(10, 10, 20, 0.85);
                backdrop-filter: blur(12px);
                -webkit-backdrop-filter: blur(12px);
                border: 1px solid rgba(255, 255, 255, 0.08);
                padding: 10px 16px;
                border-radius: 16px;
                color: #e4e4e7;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
                font-size: 13px;
                display: flex;
                align-items: center;
                gap: 12px;
                box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3), 0 0 20px rgba(167, 139, 250, 0.05);
                z-index: 999999;
                opacity: 0;
                transform: translateY(10px);
                transition: opacity 0.3s ease, transform 0.3s ease;
            }
            #yepzhi-cookie-banner.visible {
                opacity: 1;
                transform: translateY(0);
            }
            #yepzhi-cookie-banner .consent-btn {
                background: rgba(255, 255, 255, 0.08);
                border: 1px solid rgba(255, 255, 255, 0.15);
                color: #ffffff;
                padding: 4px 12px;
                border-radius: 8px;
                cursor: pointer;
                font-size: 12px;
                font-weight: 600;
                transition: all 0.2s;
            }
            #yepzhi-cookie-banner .consent-btn:hover {
                background: rgba(255, 255, 255, 0.15);
                border-color: rgba(255, 255, 255, 0.3);
            }
            @media (max-width: 480px) {
                #yepzhi-cookie-banner {
                    left: 20px;
                    bottom: 20px;
                    flex-direction: column;
                    align-items: stretch;
                    text-align: center;
                    gap: 8px;
                }
            }
        `;
        document.head.appendChild(style);

        // Create banner element
        const banner = document.createElement('div');
        banner.id = 'yepzhi-cookie-banner';
        banner.innerHTML = `
            <span>${text}</span>
            <button class="consent-btn">${btnText}</button>
        `;
        document.body.appendChild(banner);

        // Animate in
        setTimeout(() => {
            banner.classList.add('visible');
        }, 100);

        // Accept handler
        banner.querySelector('.consent-btn').addEventListener('click', () => {
            localStorage.setItem('yepzhi_cookie_consent', 'true');
            banner.classList.remove('visible');
            setTimeout(() => {
                banner.remove();
            }, 300);
        });
    }

    if (document.readyState === 'complete') {
        initTracker();
        initCookieConsent();
    } else {
        window.addEventListener('load', () => {
            initTracker();
            initCookieConsent();
        });
    }
})();

