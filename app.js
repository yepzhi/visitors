/* ═══════════════════════════════════════════
   VISITORS DASHBOARD LOGIC — app.js (v5.0.0)
   Firestore: filtered queries use where+limit only (no composite index).
   Tighten security in firestore.rules (see repo root).
   ═══════════════════════════════════════════ */

const FIREBASE_CONFIG = {
    apiKey: "AIzaSyD-tbdD6eHip2fCBAJnGEj3_4eqLMc1EhE",
    authDomain: "neosys-4dc42.firebaseapp.com",
    projectId: "neosys-4dc42",
    storageBucket: "neosys-4dc42.firebasestorage.app",
    messagingSenderId: "1009059504450",
    appId: "1:1009059504450:web:d26dd042f2139dcaa6e8db",
    measurementId: "G-V2FD2WR82B"
};

if (!firebase.apps.length) {
    firebase.initializeApp(FIREBASE_CONFIG);
}
const db = firebase.firestore();

let map = null;
let markers = [];
let currentFilter = 'all';
let unsubscribe = null;
const accentColor = "#a78bfa";
const MAX_SAMPLE = 3000;

function escapeHtml(s) {
    if (s == null || s === undefined) return '';
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

/** Plain label for aggregation and display (no HTML). */
function normalizeReferrer(referrer) {
    if (referrer == null || referrer === '' || referrer === 'direct') return 'Direct / Social';
    try {
        return new URL(referrer).hostname;
    } catch {
        return String(referrer).slice(0, 120);
    }
}

function parseUA(uaString) {
    if (!uaString || typeof uaString !== 'string') {
        return { browser: 'Unknown', os: 'Unknown', isApple: false, isAndroid: false };
    }
    const ua = uaString.toLowerCase();
    let browser = 'Other';
    let os = 'Unknown';

    if (ua.includes('chrome')) browser = 'Chrome';
    else if (ua.includes('safari') && !ua.includes('chrome')) browser = 'Safari';
    else if (ua.includes('firefox')) browser = 'Firefox';
    else if (ua.includes('edg')) browser = 'Edge';

    if (ua.includes('windows')) os = 'Windows';
    else if (ua.includes('macintosh') || ua.includes('mac os')) os = 'macOS';
    else if (ua.includes('android')) os = 'Android';
    else if (ua.includes('iphone') || ua.includes('ipad')) os = 'iOS';
    else if (ua.includes('linux')) os = 'Linux';

    return {
        browser,
        os,
        isApple: ua.includes('iphone') || ua.includes('ipad') || ua.includes('macintosh'),
        isAndroid: ua.includes('android')
    };
}

function initUI() {
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const tabId = btn.getAttribute('data-tab');

            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

            btn.classList.add('active');
            document.getElementById(`${tabId}-tab`).classList.add('active');

            if (tabId === 'map' && map) {
                setTimeout(() => map.invalidateSize(), 100);
            }
        });
    });

    document.getElementById('refresh-btn').addEventListener('click', () => {
        setupSnapshot();
        const icon = document.querySelector('.refresh-icon');
        icon.style.transform = 'rotate(360deg)';
        setTimeout(() => { icon.style.transform = 'rotate(0deg)'; }, 500);
    });

    document.getElementById('site-filter').addEventListener('change', (e) => {
        currentFilter = e.target.value;
        setupSnapshot();
    });

    const params = new URLSearchParams(window.location.search);
    if (params.get('admin') === '1') {
        const s = document.createElement('script');
        s.src = 'historical_data.js';
        s.onload = () => setupIngestButton();
        s.onerror = () => console.warn('[Visitors] historical_data.js failed to load');
        document.body.appendChild(s);
    }
}

function setupIngestButton() {
    const ingestBtn = document.getElementById('ingest-btn');
    if (typeof HISTORICAL_DATA === 'undefined' || !ingestBtn) return;

    ingestBtn.style.display = 'flex';
    ingestBtn.addEventListener('click', async () => {
        if (!confirm(`Deploy ${HISTORICAL_DATA.length} historical records to Firestore?`)) return;

        ingestBtn.disabled = true;
        const label = ingestBtn.querySelector('span');
        label.innerText = 'Ingesting...';

        for (let i = 0; i < HISTORICAL_DATA.length; i++) {
            const item = { ...HISTORICAL_DATA[i] };
            item.timestamp = firebase.firestore.Timestamp.fromMillis(item.timestamp_ms);
            delete item.timestamp_ms;

            try {
                await db.collection('visits').add(item);
                label.innerText = `${Math.round(((i + 1) / HISTORICAL_DATA.length) * 100)}%`;
            } catch (e) {
                console.error('Ingest Error:', e);
            }
        }
        label.innerText = 'Done!';
        ingestBtn.style.background = '#22c55e';
    });
}

function setupSnapshot() {
    if (unsubscribe) unsubscribe();

    let q;
    if (currentFilter === 'all') {
        q = db.collection('visits').orderBy('timestamp', 'desc').limit(MAX_SAMPLE);
    } else {
        q = db.collection('visits').where('site', '==', currentFilter).limit(MAX_SAMPLE);
    }

    unsubscribe = q.onSnapshot((snapshot) => {
        processData(snapshot);
    }, (error) => {
        console.error('Snapshot error:', error);
        const tbody = document.getElementById('visitors-tbody');
        if (tbody) {
            tbody.innerHTML = `<tr><td colspan="5" style="color:#f87171;padding:16px;">${escapeHtml(error.message || String(error))}</td></tr>`;
        }
    });
}

function processData(snapshot) {
    const stats = {
        total: 0,
        cities: {},
        countries: {},
        browsers: {},
        os: {},
        referrers: {},
        devices: { apple: 0, android: 0 },
        lastVisit: null
    };

    const tbody = document.getElementById('visitors-tbody');
    tbody.innerHTML = '';

    markers.forEach(m => map.removeLayer(m));
    markers = [];

    const sortedDocs = snapshot.docs.slice().sort((a, b) => {
        const ta = a.get('timestamp')?.toMillis?.() ?? 0;
        const tb = b.get('timestamp')?.toMillis?.() ?? 0;
        return tb - ta;
    });

    sortedDocs.forEach((docSnap) => {
        const data = docSnap.data();
        stats.total++;

        if (data.city) stats.cities[data.city] = (stats.cities[data.city] || 0) + 1;
        if (data.country) stats.countries[data.country] = (stats.countries[data.country] || 0) + 1;

        const ref = normalizeReferrer(data.referrer);
        stats.referrers[ref] = (stats.referrers[ref] || 0) + 1;

        const ua = parseUA(data.user_agent);
        stats.browsers[ua.browser] = (stats.browsers[ua.browser] || 0) + 1;
        stats.os[ua.os] = (stats.os[ua.os] || 0) + 1;
        if (ua.isApple) stats.devices.apple++;
        if (ua.isAndroid) stats.devices.android++;

        if (!stats.lastVisit && data.timestamp) stats.lastVisit = data.timestamp.toDate();

        const siteLabel = (data.site != null && data.site !== '') ? String(data.site) : 'unknown';
        const lat = Number(data.latitude);
        const lng = Number(data.longitude);
        if (Number.isFinite(lat) && Number.isFinite(lng) && lat !== 0 && lng !== 0) {
            const timeStr = data.timestamp ? data.timestamp.toDate().toLocaleTimeString() : '…';
            const marker = L.circleMarker([lat, lng], {
                radius: 6,
                fillColor: accentColor,
                color: '#fff',
                weight: 1,
                opacity: 1,
                fillOpacity: 0.6
            });
            const cityPop = escapeHtml(data.city || 'Unknown');
            marker.bindPopup(`<strong>${cityPop}</strong><br>${escapeHtml(siteLabel.toUpperCase())}<br>${escapeHtml(timeStr)}`);
            markers.push(marker);
        }

        if (stats.total <= 50) {
            const row = document.createElement('tr');
            const timeStr = data.timestamp ? data.timestamp.toDate().toLocaleString() : '—';
            row.innerHTML = `
                <td><span class="site-badge">${escapeHtml(siteLabel.toUpperCase())}</span></td>
                <td>${escapeHtml(data.city || '??')}, ${escapeHtml(data.country_code || '??')}</td>
                <td class="td-path">${escapeHtml(data.path || '')}</td>
                <td class="td-ref" title="${escapeHtml(ref)}">${escapeHtml(ref)}</td>
                <td class="td-time">${escapeHtml(timeStr)}</td>
            `;
            tbody.appendChild(row);
        }
    });

    L.featureGroup(markers).addTo(map);

    renderRankings(stats);
    updateHUD(stats);
}

function renderRankings(stats) {
    renderList('city-ranking', stats.cities);
    renderList('country-ranking', stats.countries);
    renderList('referrer-stats', stats.referrers);

    const total = stats.total || 1;

    const topBrowsers = Object.entries(stats.browsers).sort((a, b) => b[1] - a[1]).slice(0, 3);
    const browserCont = document.getElementById('browser-stats');
    browserCont.innerHTML = topBrowsers.length
        ? topBrowsers.map(([name, count]) => `
        <div class="tech-stat">
            <span class="tech-stat-name">${escapeHtml(name)}</span>
            <div class="tech-bar-container">
                <div class="tech-bar" style="width: ${((count / total) * 100).toFixed(0)}%"></div>
            </div>
            <span class="tech-stat-count">${count}</span>
        </div>
    `).join('')
        : '<p class="empty-hint">No browser data in this sample.</p>';

    const topOS = Object.entries(stats.os).sort((a, b) => b[1] - a[1]).slice(0, 3);
    const osCont = document.getElementById('os-stats');
    osCont.innerHTML = topOS.length
        ? topOS.map(([name, count]) => `
        <div class="tech-stat">
            <span class="tech-stat-name">${escapeHtml(name)}</span>
            <div class="tech-bar-container">
                <div class="tech-bar tech-bar-os" style="width: ${((count / total) * 100).toFixed(0)}%"></div>
            </div>
            <span class="tech-stat-count">${count}</span>
        </div>
    `).join('')
        : '<p class="empty-hint">No OS data in this sample.</p>';

    const mob = stats.devices.apple + stats.devices.android;
    const appleEl = document.getElementById('ratio-apple');
    const androidEl = document.getElementById('ratio-android');
    if (mob === 0) {
        appleEl.style.width = '50%';
        androidEl.style.width = '50%';
        appleEl.innerText = '—';
        androidEl.innerText = '—';
    } else {
        const applePct = ((stats.devices.apple / mob) * 100).toFixed(1);
        const androidPct = ((stats.devices.android / mob) * 100).toFixed(1);
        appleEl.style.width = `${applePct}%`;
        appleEl.innerText = `${applePct}%`;
        androidEl.style.width = `${androidPct}%`;
        androidEl.innerText = `${androidPct}%`;
    }
}

function renderList(id, dataObj) {
    const cont = document.getElementById(id);
    const sorted = Object.entries(dataObj).sort((a, b) => b[1] - a[1]);
    cont.innerHTML = sorted.length
        ? sorted.map(([name, count]) => `
        <div class="ranking-item">
            <span>${escapeHtml(name)}</span>
            <span class="rank-val">${count}</span>
        </div>
    `).join('')
        : '<p class="empty-hint">No data.</p>';
}

function updateHUD(stats) {
    document.getElementById('stat-total-views').innerText = stats.total;
    document.getElementById('stat-total-countries').innerText = Object.keys(stats.countries).length;
    document.getElementById('stat-total-cities').innerText = Object.keys(stats.cities).length;

    const avgEl = document.getElementById('stat-avg-time');
    const ctrEl = document.getElementById('stat-ctr');
    if (avgEl) avgEl.textContent = '—';
    if (ctrEl) ctrEl.textContent = '—';

    if (stats.lastVisit) {
        document.getElementById('overlay-last-visit').innerText = `Last event: ${stats.lastVisit.toLocaleTimeString()}`;
    } else {
        document.getElementById('overlay-last-visit').innerText = 'Last event: —';
    }
    document.getElementById('overlay-site-name').innerText = currentFilter === 'all' ? 'GLOBAL TRAFFIC' : currentFilter.toUpperCase();
}

function initMap() {
    map = L.map('visitor-map', {
        zoomControl: false
    }).setView([20, 0], 2);

    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap &copy; CARTO'
    }).addTo(map);

    L.control.zoom({ position: 'bottomleft' }).addTo(map);
}

function initParticles() {
    const canvas = document.getElementById('particle-canvas');
    const ctx = canvas.getContext('2d');
    const particles = [];
    const resize = () => {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
    };
    window.addEventListener('resize', resize);
    resize();

    class P {
        constructor() {
            this.x = Math.random() * canvas.width;
            this.y = Math.random() * canvas.height;
            this.size = Math.random() * 1.5;
            this.vX = Math.random() * 0.4 - 0.2;
            this.vY = Math.random() * 0.4 - 0.2;
            this.o = Math.random() * 0.5;
        }
        update() {
            this.x += this.vX;
            this.y += this.vY;
            if (this.x < 0 || this.x > canvas.width) this.vX *= -1;
            if (this.y < 0 || this.y > canvas.height) this.vY *= -1;
        }
        draw() {
            ctx.fillStyle = `rgba(167, 139, 250, ${this.o})`;
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
            ctx.fill();
        }
    }
    for (let i = 0; i < 40; i++) particles.push(new P());
    const anim = () => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        particles.forEach(p => {
            p.update();
            p.draw();
        });
        requestAnimationFrame(anim);
    };
    anim();
}

window.addEventListener('load', () => {
    initMap();
    initUI();
    setupSnapshot();
    initParticles();

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) entry.target.classList.add('visible');
        });
    }, { threshold: 0.1 });
    document.querySelectorAll('.reveal').forEach(el => observer.observe(el));
});
