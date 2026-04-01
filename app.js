/* ═══════════════════════════════════════════
   VISITORS DASHBOARD LOGIC — app.js (v3.0)
   ═══════════════════════════════════════════ */

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

if (!firebase.apps.length) {
    firebase.initializeApp(FIREBASE_CONFIG);
}
const db = firebase.firestore();

// 2. STATE
let map = null;
let markers = [];
let currentFilter = 'all';
let unsubscribe = null;
const accentColor = "#a78bfa";

// 3. UI INITIALIZATION
function initUI() {
    // Tab Switching
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const tabId = btn.getAttribute('data-tab');
            
            // UI Toggle
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            
            btn.classList.add('active');
            document.getElementById(`${tabId}-tab`).classList.add('active');
            
            // Map Reflow (Leaflet fix for hidden containers)
            if (tabId === 'map' && map) {
                setTimeout(() => map.invalidateSize(), 100);
            }
        });
    });

    // Refresh Button
    document.getElementById('refresh-btn').addEventListener('click', () => {
        setupSnapshot();
        const icon = document.querySelector('.refresh-icon');
        icon.style.transform = 'rotate(360deg)';
        setTimeout(() => icon.style.transform = 'rotate(0deg)', 500);
    });

    // Site Filter
    document.getElementById('site-filter').addEventListener('change', (e) => {
        currentFilter = e.target.value;
        setupSnapshot();
    });
    // Ingest Button (Admin)
    const ingestBtn = document.getElementById('ingest-btn');
    if (typeof HISTORICAL_DATA !== 'undefined') {
        ingestBtn.style.display = 'flex';
        ingestBtn.addEventListener('click', async () => {
            if (!confirm(`Deploying ${HISTORICAL_DATA.length} historical records to Firestore. Proceed?`)) return;
            
            ingestBtn.disabled = true;
            ingestBtn.querySelector('span').innerText = 'Ingesting...';
            
            for (let i = 0; i < HISTORICAL_DATA.length; i++) {
                const item = HISTORICAL_DATA[i];
                item.timestamp = firebase.firestore.Timestamp.fromMillis(item.timestamp_ms);
                delete item.timestamp_ms;
                
                try {
                    await db.collection('visits').add(item);
                    ingestBtn.querySelector('span').innerText = `${Math.round(((i+1)/HISTORICAL_DATA.length)*100)}%`;
                } catch (e) {
                    console.error("Ingest Error:", e);
                }
            }
            ingestBtn.querySelector('span').innerText = 'Done!';
            ingestBtn.style.background = '#22c55e';
        });
    }
}

// 4. DATA ENGINE
function setupSnapshot() {
    if (unsubscribe) unsubscribe();

    let query = db.collection('visits').orderBy('timestamp', 'desc').limit(1000);
    
    if (currentFilter !== 'all') {
        query = query.where('site', '==', currentFilter);
    }

    unsubscribe = query.onSnapshot((snapshot) => {
        processData(snapshot);
    }, (error) => {
        console.error("Snapshot error:", error);
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
    
    // Reset Map Markers (Batch)
    markers.forEach(m => map.removeLayer(m));
    markers = [];

    snapshot.forEach((doc) => {
        const data = doc.data();
        stats.total++;

        // Aggregations
        if (data.city) stats.cities[data.city] = (stats.cities[data.city] || 0) + 1;
        if (data.country) stats.countries[data.country] = (stats.countries[data.country] || 0) + 1;
        
        // Referrer
        const ref = data.referrer === 'direct' ? 'Direct / Social' : new URL(data.referrer).hostname;
        stats.referrers[ref] = (stats.referrers[ref] || 0) + 1;

        // User Agent Parsing
        const ua = parseUA(data.user_agent);
        stats.browsers[ua.browser] = (stats.browsers[ua.browser] || 0) + 1;
        stats.os[ua.os] = (stats.os[ua.os] || 0) + 1;
        if (ua.isApple) stats.devices.apple++;
        if (ua.isAndroid) stats.devices.android++;

        if (!stats.lastVisit && data.timestamp) stats.lastVisit = data.timestamp.toDate();

        // Map Markers
        if (data.latitude && data.longitude) {
            const timeStr = data.timestamp ? data.timestamp.toDate().toLocaleTimeString() : '...';
            const marker = L.circleMarker([data.latitude, data.longitude], {
                radius: 6,
                fillColor: accentColor,
                color: "#fff",
                weight: 1,
                opacity: 1,
                fillOpacity: 0.6
            });
            marker.bindPopup(`<strong>${data.city}</strong><br>${data.site.toUpperCase()}<br>${timeStr}`);
            markers.push(marker);
        }

        // Feed Table (Last 50 for performance)
        if (stats.total <= 50) {
            const row = document.createElement('tr');
            const timeStr = data.timestamp ? data.timestamp.toDate().toLocaleString() : 'Just now';
            row.innerHTML = `
                <td><span class="site-badge">${data.site.toUpperCase()}</span></td>
                <td>${data.city || '??'}, ${data.country_code || '??'}</td>
                <td style="font-family: monospace; font-size: 0.8rem; opacity: 0.6;">${data.path}</td>
                <td style="font-size: 0.8rem; max-width: 15rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${ref}</td>
                <td style="font-size: 0.75rem; opacity: 0.5;">${timeStr}</td>
            `;
            tbody.appendChild(row);
        }
    });

    // Add Markers to Map in one go
    const group = L.featureGroup(markers).addTo(map);
    
    renderRankings(stats);
    updateHUD(stats);
}

function parseUA(uaString) {
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

// 5. RENDERING
function renderRankings(stats) {
    // City Ranking
    renderList('city-ranking', stats.cities);
    renderList('country-ranking', stats.countries);
    renderList('referrer-stats', stats.referrers);

    // Tech Stats (Top 3 Browser)
    const topBrowsers = Object.entries(stats.browsers).sort((a,b) => b[1] - a[1]).slice(0, 3);
    const browserCont = document.getElementById('browser-stats');
    browserCont.innerHTML = topBrowsers.map(([name, count]) => `
        <div class="tech-stat">
            <span style="font-size: 0.8rem; width: 60px;">${name}</span>
            <div class="tech-bar-container">
                <div class="tech-bar" style="width: ${(count/stats.total*100).toFixed(0)}%"></div>
            </div>
            <span style="font-size: 0.7rem; opacity: 0.5;">${count}</span>
        </div>
    `).join('');

    // OS Stats
    const topOS = Object.entries(stats.os).sort((a,b) => b[1] - a[1]).slice(0, 3);
    const osCont = document.getElementById('os-stats');
    osCont.innerHTML = topOS.map(([name, count]) => `
        <div class="tech-stat">
            <span style="font-size: 0.8rem; width: 60px;">${name}</span>
            <div class="tech-bar-container">
                <div class="tech-bar" style="width: ${(count/stats.total*100).toFixed(0)}%; background: var(--accent-2);"></div>
            </div>
            <span style="font-size: 0.7rem; opacity: 0.5;">${count}</span>
        </div>
    `).join('');

    // Ratio
    const totalMobile = stats.devices.apple + stats.devices.android || 1;
    const applePct = (stats.devices.apple / totalMobile * 100).toFixed(1);
    const androidPct = (stats.devices.android / totalMobile * 100).toFixed(1);
    
    document.getElementById('ratio-apple').style.width = `${applePct}%`;
    document.getElementById('ratio-apple').innerText = `${applePct}%`;
    document.getElementById('ratio-android').style.width = `${androidPct}%`;
    document.getElementById('ratio-android').innerText = `${androidPct}%`;
}

function renderList(id, dataObj) {
    const cont = document.getElementById(id);
    const sorted = Object.entries(dataObj).sort((a,b) => b[1] - a[1]);
    cont.innerHTML = sorted.map(([name, count]) => `
        <div class="ranking-item">
            <span>${name}</span>
            <span class="rank-val">${count}</span>
        </div>
    `).join('');
}

function updateHUD(stats) {
    document.getElementById('stat-total-views').innerText = stats.total;
    document.getElementById('stat-total-countries').innerText = Object.keys(stats.countries).length;
    document.getElementById('stat-total-cities').innerText = Object.keys(stats.cities).length;

    if (stats.lastVisit) {
        document.getElementById('overlay-last-visit').innerText = `Pulse: ${stats.lastVisit.toLocaleTimeString()}`;
    }
    document.getElementById('overlay-site-name').innerText = currentFilter === 'all' ? 'GLOBAL TRAFFIC' : currentFilter.toUpperCase();
}

// 6. MAP & PARTICLES (Preserved Core Logic)
function initMap() {
    map = L.map('visitor-map', {
        zoomControl: false,
        attributionControl: false
    }).setView([20, 0], 2);

    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        maxZoom: 19
    }).addTo(map);

    L.control.zoom({ position: 'bottomleft' }).addTo(map);
}

function initParticles() {
    const canvas = document.getElementById('particle-canvas');
    const ctx = canvas.getContext('2d');
    let particles = [];
    const resize = () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight; };
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
            this.x += this.vX; this.y += this.vY;
            if (this.x < 0 || this.x > canvas.width) this.vX *= -1;
            if (this.y < 0 || this.y > canvas.height) this.vY *= -1;
        }
        draw() {
            ctx.fillStyle = `rgba(167, 139, 250, ${this.o})`;
            ctx.beginPath(); ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2); ctx.fill();
        }
    }
    for (let i = 0; i < 40; i++) particles.push(new P());
    const anim = () => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        particles.forEach(p => { p.update(); p.draw(); });
        requestAnimationFrame(anim);
    };
    anim();
}

// 7. INITIALIZATION
window.addEventListener('load', () => {
    initMap();
    initUI();
    setupSnapshot();
    initParticles();
    
    // Reveal Observer
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) entry.target.classList.add('visible');
        });
    }, { threshold: 0.1 });
    document.querySelectorAll('.reveal').forEach(el => observer.observe(el));
});
