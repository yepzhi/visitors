/* ═══════════════════════════════════════════
   VISITORS DASHBOARD LOGIC — app.js (v5.7.0)
   Firestore: one-shot get() + localStorage cache.
   Quota-optimised: no real-time listeners.
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
let markersGroup = null; // Centralized LayerGroup to prevent memory leaks
let markers = [];
let currentFilter = 'all';
let currentTimeRange = 'all';
let lastSnapshotData = null;
const accentColor = "#a78bfa";

// ── Cache helpers (localStorage) ─────────────────────────────────────────────
const CACHE_TTL_COUNT_MS  = 10 * 60 * 1000; // 10 min for the aggregated count
const CACHE_TTL_SNAP_MS   =  5 * 60 * 1000; //  5 min for the snapshot docs

function cacheSet(key, value) {
    try {
        localStorage.setItem(key, JSON.stringify({ ts: Date.now(), value }));
    } catch (_) {}
}

function cacheGet(key, ttl) {
    try {
        const raw = localStorage.getItem(key);
        if (!raw) return null;
        const { ts, value } = JSON.parse(raw);
        if (Date.now() - ts > ttl) return null;
        return value;
    } catch (_) { return null; }
}

function cacheClear(prefix) {
    try {
        Object.keys(localStorage)
            .filter(k => k.startsWith(prefix))
            .forEach(k => localStorage.removeItem(k));
    } catch (_) {}
}


function escapeHtml(s) {
    if (s == null) return '';
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

    if (ua.includes('edg')) browser = 'Edge';
    else if (ua.includes('chrome')) browser = 'Chrome';
    else if (ua.includes('safari') && !ua.includes('chrome')) browser = 'Safari';
    else if (ua.includes('firefox')) browser = 'Firefox';

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

function matchesSiteFilter(itemSite, filter) {
    if (filter === 'all') return true;
    if (filter === 'radios_unified') return itemSite === 'hopradio' || itemSite === 'sergradio';
    if (filter === 'yepzhi_main') return itemSite === 'main' || itemSite === 'yepzhiweb';
    return itemSite === filter;
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
        // Clear caches so we force a fresh Firestore fetch
        cacheClear('neosys_count_');
        cacheClear('neosys_snap_');
        setupSnapshot();
        const icon = document.querySelector('.refresh-icon');
        icon.style.transform = 'rotate(360deg)';
        setTimeout(() => { icon.style.transform = 'rotate(0deg)'; }, 500);
    });

    function syncFilterUI(selectedFilter) {
        document.querySelectorAll('.quick-filter-btn').forEach(btn => {
            if (btn.getAttribute('data-site') === selectedFilter) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });
        const siteDropdown = document.getElementById('site-filter');
        if (siteDropdown) {
            const hasOption = Array.from(siteDropdown.options).some(o => o.value === selectedFilter);
            if (hasOption) {
                siteDropdown.value = selectedFilter;
            }
        }
    }

    document.querySelectorAll('.quick-filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            currentFilter = btn.getAttribute('data-site');
            syncFilterUI(currentFilter);
            setupSnapshot();
        });
    });

    document.getElementById('site-filter').addEventListener('change', (e) => {
        currentFilter = e.target.value;
        syncFilterUI(currentFilter);
        setupSnapshot();
    });

    document.querySelectorAll('.time-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            currentTimeRange = btn.getAttribute('data-range');
            document.querySelectorAll('.time-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            if (lastSnapshotData) processData(lastSnapshotData);
        });
    });

}

let currentRealCount = null;
let isFetching = false;

function countCacheKey(site) { return `neosys_count_${site}`; }
function snapCacheKey(site)  { return `neosys_snap_${site}`; }

async function fetchRealCount(site) {
    // Check cache first
    const cached = cacheGet(countCacheKey(site), CACHE_TTL_COUNT_MS);
    if (cached !== null) {
        console.log('[Visitors] Count from cache:', cached);
        return cached;
    }

    if (site === 'radios_unified') {
        const [cHop, cSerg] = await Promise.all([
            fetchRealCount('hopradio'),
            fetchRealCount('sergradio')
        ]);
        if (cHop !== null || cSerg !== null) {
            const sum = (cHop || 0) + (cSerg || 0);
            cacheSet(countCacheKey(site), sum);
            return sum;
        }
        return null;
    }

    if (site === 'yepzhi_main') {
        const [cMain, cWeb] = await Promise.all([
            fetchRealCount('main'),
            fetchRealCount('yepzhiweb')
        ]);
        if (cMain !== null || cWeb !== null) {
            const sum = (cMain || 0) + (cWeb || 0);
            cacheSet(countCacheKey(site), sum);
            return sum;
        }
        return null;
    }

    const payload = {
        structuredAggregationQuery: {
            structuredQuery: {
                from: [{ collectionId: 'visits' }]
            },
            aggregations: [{ count: {}, alias: 'total_count' }]
        }
    };
    if (site && site !== 'all') {
        payload.structuredAggregationQuery.structuredQuery.where = {
            fieldFilter: {
                field: { fieldPath: 'site' },
                op: 'EQUAL',
                value: { stringValue: site }
            }
        };
    }
    try {
        const res = await fetch('https://firestore.googleapis.com/v1/projects/neosys-4dc42/databases/(default)/documents:runAggregationQuery', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (res.status === 429) {
            console.warn('[Visitors] Firestore quota exceeded (429). Serving from cache or historical data.');
            return null;
        }
        const data = await res.json();
        if (data[0]?.error) {
            console.warn('[Visitors] Aggregation error:', data[0].error.message);
            return null;
        }
        const count = Number(data[0]?.result?.aggregateFields?.total_count?.integerValue);
        if (Number.isFinite(count)) {
            cacheSet(countCacheKey(site), count);
            return count;
        }
        return null;
    } catch (e) {
        console.error('[Visitors] Failed to fetch real count:', e);
        return null;
    }
}

async function updateRealCountHUD() {
    const filter = currentFilter;
    const count = await fetchRealCount(filter);
    if (filter === currentFilter && count !== null) {
        currentRealCount = count;
        const historicalItems = (typeof HISTORICAL_DATA !== 'undefined') ? HISTORICAL_DATA : [];
        const historicalFiltered = (filter === 'all')
            ? historicalItems
            : historicalItems.filter(item => matchesSiteFilter(item.site, filter));
        const total = count + historicalFiltered.length;
        const totalEl = document.getElementById('stat-total-views');
        if (totalEl) totalEl.innerText = total.toLocaleString();
    }
}

async function setupSnapshot() {
    if (isFetching) return;
    isFetching = true;
    lastSnapshotData = null;
    currentRealCount = null;

    const cKey = snapCacheKey(currentFilter);
    const cachedDocs = cacheGet(cKey, CACHE_TTL_SNAP_MS);

    if (cachedDocs) {
        console.log('[Visitors] Docs from localStorage cache:', cachedDocs.length);
        // Wrap in a fake snapshot-like object
        const fakeSnapshot = {
            docs: cachedDocs.map(d => ({
                id: d.id,
                data: () => d,
                get: (field) => d[field]
            })),
            size: cachedDocs.length
        };
        lastSnapshotData = fakeSnapshot;
        processData(fakeSnapshot);
        isFetching = false;
        // Still refresh the count HUD in background (uses its own cache)
        updateRealCountHUD();
        return;
    }

    // One-shot fetch (much cheaper than onSnapshot listener)
    let q;
    if (currentFilter === 'all') {
        q = db.collection('visits').orderBy('timestamp', 'desc').limit(2000);
    } else if (currentFilter === 'radios_unified') {
        q = db.collection('visits')
            .where('site', 'in', ['hopradio', 'sergradio'])
            .orderBy('timestamp', 'desc')
            .limit(2000);
    } else if (currentFilter === 'yepzhi_main') {
        q = db.collection('visits')
            .where('site', 'in', ['main', 'yepzhiweb'])
            .orderBy('timestamp', 'desc')
            .limit(2000);
    } else {
        q = db.collection('visits')
            .where('site', '==', currentFilter)
            .orderBy('timestamp', 'desc')
            .limit(2000);
    }

    try {
        const snapshot = await q.get();
        console.log('[Visitors] Firestore fetch size:', snapshot.size);

        // Serialize docs to localStorage for caching
        const serialised = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        cacheSet(cKey, serialised);

        lastSnapshotData = snapshot;
        processData(snapshot);
        updateRealCountHUD();
    } catch (error) {
        if (error && (error.code === 'resource-exhausted' || (error.message && error.message.includes('429')))) {
            console.warn('[Visitors] Firestore quota exceeded — showing historical data only.');
            // Show historical data only with a warning
            processData({ docs: [], size: 0 });
            const tbody = document.getElementById('visitors-tbody');
            if (tbody && !tbody.innerHTML.trim()) {
                tbody.innerHTML = `<tr><td colspan="5" style="color:#fb923c;padding:16px;text-align:center;">⚡ Firestore quota temporarily exceeded. Showing historical records only. Will auto-recover after midnight UTC.</td></tr>`;
            }
        } else {
            console.error('[Visitors] Fetch error:', error);
            const tbody = document.getElementById('visitors-tbody');
            if (tbody) {
                tbody.innerHTML = `<tr><td colspan="5" style="color:#f87171;padding:16px;">${escapeHtml(error.message || String(error))}</td></tr>`;
            }
        }
    } finally {
        isFetching = false;
    }
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
    if (tbody) tbody.innerHTML = '';

    // Clear existing markers properly to prevent Leaflet layer leakage
    if (markersGroup) {
        markersGroup.clearLayers();
    } else {
        markersGroup = L.layerGroup().addTo(map);
    }
    markers = [];

    // ── Time Filter Logic ──────────────────
    const now = new Date();
    let startTime = 0;
    if (currentTimeRange === 'today') startTime = new Date().setHours(0,0,0,0);
    else if (currentTimeRange === '1w') startTime = now.getTime() - (7 * 24 * 60 * 60 * 1000);
    else if (currentTimeRange === '1m') startTime = now.getTime() - (30 * 24 * 60 * 60 * 1000);
    else if (currentTimeRange === '3m') startTime = now.getTime() - (90 * 24 * 60 * 60 * 1000);
    else if (currentTimeRange === '6m') startTime = now.getTime() - (180 * 24 * 60 * 60 * 1000);
    else if (currentTimeRange === '1y') startTime = now.getTime() - (365 * 24 * 60 * 60 * 1000);

    // ── Data Merging Logic ──────────────────
    // Merge Firestore docs with Historical archive
    function parseTimestamp(ts) {
        if (!ts) return new Date(0);
        if (typeof ts.toDate === 'function') return ts.toDate(); // live Firestore Timestamp
        if (ts.seconds) return new Date(ts.seconds * 1000);      // cached plain object
        if (ts._seconds) return new Date(ts._seconds * 1000);    // alternate serialisation
        return new Date(0);
    }
    const liveItems = snapshot.docs.map(doc => ({
        ...doc.data(),
        id: doc.id,
        timestamp: parseTimestamp(doc.get ? doc.get('timestamp') : doc.data?.().timestamp)
    }));

    // Local historical data (convert timestamp_ms to Date objects)
    const historicalItems = (typeof HISTORICAL_DATA !== 'undefined') ? HISTORICAL_DATA.map(item => ({
        ...item,
        timestamp: new Date(item.timestamp_ms || 0)
    })) : [];

    const allItems = [...liveItems, ...historicalItems];

    // Filter by site if not 'all'
    const siteFiltered = allItems.filter(item => matchesSiteFilter(item.site, currentFilter));

    // Filter by time range
    const timeFiltered = siteFiltered.filter(item => {
        if (currentTimeRange === 'all') return true;
        const ts = item.timestamp.getTime();
        return ts >= startTime;
    });

    // Sort by most recent first
    const sortedItems = timeFiltered.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    sortedItems.forEach((data) => {
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

        if (!stats.lastVisit && data.timestamp) stats.lastVisit = data.timestamp;

        const siteLabel = (data.site != null && data.site !== '') ? String(data.site) : 'unknown';
        const lat = Number(data.latitude);
        const lng = Number(data.longitude);
        if (Number.isFinite(lat) && Number.isFinite(lng) && lat !== 0 && lng !== 0) {
            const timeStr = data.timestamp ? data.timestamp.toLocaleTimeString() : '…';
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
            const timeStr = data.timestamp ? data.timestamp.toLocaleString() : '—';
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

    // Update markers group instead of creating a new FeatureGroup every time
    markers.forEach(m => m.addTo(markersGroup));

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
        appleEl.textContent = '—';
        androidEl.textContent = '—';
    } else {
        const applePct = ((stats.devices.apple / mob) * 100).toFixed(1);
        const androidPct = ((stats.devices.android / mob) * 100).toFixed(1);
        appleEl.style.width = `${applePct}%`;
        appleEl.textContent = `${applePct}%`;
        androidEl.style.width = `${androidPct}%`;
        androidEl.textContent = `${androidPct}%`;
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
    const historicalItems = (typeof HISTORICAL_DATA !== 'undefined') ? HISTORICAL_DATA : [];
    const historicalFiltered = (currentFilter === 'all')
        ? historicalItems
        : historicalItems.filter(item => matchesSiteFilter(item.site, currentFilter));
        
    const displayTotal = (currentRealCount !== null) 
        ? (currentRealCount + historicalFiltered.length) 
        : stats.total;

    document.getElementById('stat-total-views').innerText = displayTotal;
    document.getElementById('stat-total-countries').innerText = Object.keys(stats.countries).length;
    document.getElementById('stat-total-cities').innerText = Object.keys(stats.cities).length;

    const avgEl = document.getElementById('stat-avg-time');
    const ctrEl = document.getElementById('stat-ctr');
    if (avgEl) avgEl.textContent = '—';
    if (ctrEl) ctrEl.textContent = '—';

    if (stats.lastVisit) {
        document.getElementById('overlay-last-visit').textContent = `Last event: ${stats.lastVisit.toLocaleTimeString()}`;
    } else {
        document.getElementById('overlay-last-visit').textContent = 'Last event: —';
    }

    let displayName = currentFilter.toUpperCase();
    if (currentFilter === 'all') displayName = 'GLOBAL TRAFFIC';
    else if (currentFilter === 'yepzhi_main') displayName = 'YEPZHI.COM';
    else if (currentFilter === 'jovenesstem') displayName = 'JOVENESSTEM.COM';
    else if (currentFilter === 'bose') displayName = 'YEPZHI.COM / BOSE';
    else if (currentFilter === 'yzai') displayName = 'YZAI.YEPZHI.COM';
    else if (currentFilter === 'radios_unified') displayName = 'HOPRADIO + SERGRADIO';
    else if (currentFilter === 'lot') displayName = 'LOT! MARKETPLACE';

    const overlayEl = document.getElementById('overlay-site-name');
    if (overlayEl) overlayEl.textContent = displayName;
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
