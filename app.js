/* ═══════════════════════════════════════════
   VISITORS DASHBOARD LOGIC — app.js
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

// Color Palette for Map
const accentColor = "#a78bfa";

// 3. INITIALIZE MAP
function initMap() {
    map = L.map('visitor-map', {
        zoomControl: false,
        attributionControl: false
    }).setView([20, 0], 2);

    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        maxZoom: 19
    }).addTo(map);

    // Custom Zoom Control
    L.control.zoom({ position: 'bottomleft' }).addTo(map);
}

// 4. DATA FETCHING & RENDERING
function updateDashboard() {
    let query = db.collection('visits').orderBy('timestamp', 'desc');
    
    if (currentFilter !== 'all') {
        query = query.where('site', '==', currentFilter);
    }

    query.onSnapshot((snapshot) => {
        const tbody = document.getElementById('visitors-tbody');
        tbody.innerHTML = '';
        
        // Clear previous markers
        markers.forEach(m => map.removeLayer(m));
        markers = [];
        
        const countries = new Set();
        const cities = new Set();
        let totalViews = 0;
        let lastVisitTime = null;

        snapshot.forEach((doc) => {
            const data = doc.data();
            totalViews++;
            if (data.country) countries.add(data.country);
            if (data.city) cities.add(data.city);
            
            if (!lastVisitTime && data.timestamp) {
                lastVisitTime = data.timestamp.toDate();
            }

            // --- Add Table Row ---
            const row = document.createElement('tr');
            const timeStr = data.timestamp ? data.timestamp.toDate().toLocaleString() : 'Just now';
            
            row.innerHTML = `
                <td><span class="site-badge">${data.site.toUpperCase()}</span></td>
                <td>${data.city}, ${data.country_code}</td>
                <td style="font-family: monospace; font-size: 0.8rem; opacity: 0.6;">${data.path}</td>
                <td style="font-size: 0.8rem; max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${data.referrer}</td>
                <td style="font-size: 0.75rem; opacity: 0.5;">${timeStr}</td>
            `;
            tbody.appendChild(row);

            // --- Add Map Marker ---
            if (data.latitude && data.longitude) {
                const marker = L.circleMarker([data.latitude, data.longitude], {
                    radius: 6,
                    fillColor: accentColor,
                    color: "#fff",
                    weight: 1,
                    opacity: 1,
                    fillOpacity: 0.6
                }).addTo(map);
                
                marker.bindPopup(`<strong>${data.city}</strong><br>${data.site.toUpperCase()}<br>${timeStr}`);
                markers.push(marker);
            }
        });

        // Update Stats
        document.getElementById('stat-total-views').innerText = totalViews;
        document.getElementById('stat-total-countries').innerText = countries.size;
        document.getElementById('stat-total-cities').innerText = cities.size;

        if (lastVisitTime) {
            document.getElementById('overlay-last-visit').innerText = `Last visit: ${lastVisitTime.toLocaleTimeString()}`;
        }
        
        document.getElementById('overlay-site-name').innerText = currentFilter === 'all' ? 'GLOBAL TRAFFIC' : currentFilter.toUpperCase();
    });
}

// 5. EVENT LISTENERS
document.getElementById('site-filter').addEventListener('change', (e) => {
    currentFilter = e.target.value;
    updateDashboard();
});

// 6. INITIALIZATION
window.addEventListener('load', () => {
    initMap();
    updateDashboard();
    initParticles();
    
    // Reveal Observer
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');
            }
        });
    }, { threshold: 0.1 });

    document.querySelectorAll('.reveal').forEach(el => observer.observe(el));
});

// 7. PARTICLES BACKGROUND
function initParticles() {
    const canvas = document.getElementById('particle-canvas');
    const ctx = canvas.getContext('2d');
    let particles = [];

    function resize() {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
    }
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

    for (let i = 0; i < 60; i++) particles.push(new P());

    function anim() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        particles.forEach(p => { p.update(); p.draw(); });
        requestAnimationFrame(anim);
    }
    anim();
}
