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
        const path = window.location.pathname;
        if (path !== '/' && path !== '/index.html') {
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
                bottom: 24px;
                right: 24px;
                width: 270px;
                background: rgba(15, 17, 28, 0.88);
                backdrop-filter: blur(20px);
                -webkit-backdrop-filter: blur(20px);
                border: 1px solid rgba(255, 255, 255, 0.12);
                padding: 22px 20px;
                border-radius: 24px;
                color: #e4e4e7;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
                font-size: 13.5px;
                display: flex;
                flex-direction: column;
                align-items: center;
                text-align: center;
                gap: 16px;
                box-shadow: 0 20px 40px rgba(0, 0, 0, 0.4), 0 0 30px rgba(39, 126, 255, 0.15);
                z-index: 999999;
                opacity: 0;
                transform: translateY(20px) scale(0.95);
                transition: opacity 0.4s cubic-bezier(0.16, 1, 0.3, 1), transform 0.4s cubic-bezier(0.16, 1, 0.3, 1);
            }
            #yepzhi-cookie-banner.visible {
                opacity: 1;
                transform: translateY(0) scale(1);
            }
            #yepzhi-cookie-banner .cookie-icon {
                font-size: 32px;
                line-height: 1;
                margin-bottom: 2px;
                filter: drop-shadow(0 4px 8px rgba(0,0,0,0.2));
                animation: floatCookie 3s ease-in-out infinite;
            }
            @keyframes floatCookie {
                0%, 100% { transform: translateY(0); }
                50% { transform: translateY(-4px); }
            }
            #yepzhi-cookie-banner span {
                line-height: 1.5;
                font-weight: 500;
                color: #f4f4f5;
            }
            #yepzhi-cookie-banner .consent-btn {
                width: 100%;
                background: linear-gradient(135deg, #277eff 0%, #00d2ff 100%);
                border: none;
                color: #ffffff;
                padding: 10px 20px;
                border-radius: 20px;
                cursor: pointer;
                font-size: 13.5px;
                font-weight: 700;
                box-shadow: 0 4px 14px rgba(39, 126, 255, 0.35);
                transition: transform 0.2s ease, box-shadow 0.2s ease, opacity 0.2s ease;
                outline: none;
            }
            #yepzhi-cookie-banner .consent-btn:hover {
                transform: translateY(-2px);
                box-shadow: 0 6px 20px rgba(39, 126, 255, 0.5);
            }
            #yepzhi-cookie-banner .consent-btn:active {
                transform: translateY(0);
                box-shadow: 0 3px 10px rgba(39, 126, 255, 0.4);
            }
            @media (max-width: 480px) {
                #yepzhi-cookie-banner {
                    left: 20px;
                    right: 20px;
                    bottom: 20px;
                    width: auto;
                    max-width: none;
                    padding: 20px 18px;
                    border-radius: 22px;
                }
            }
        `;
        document.head.appendChild(style);

        // Create banner element
        const banner = document.createElement('div');
        banner.id = 'yepzhi-cookie-banner';
        banner.innerHTML = `
            <div class="cookie-icon">🍪</div>
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

