# Visitors Meta-Tracking — Integration Guide ✨

This repository contains the **Unified Tracking System** for all your websites under the `yepzhi.com` domain.

## 🚀 How to Track a New Site

To start tracking any of your sites (e.g., `hopradio`, `jovenesstem`, `sergradio`), follow these simple steps:

### 1. Add the Global Site ID (Optional but Recommended)
In the `<head>` of your website, before the tracker script, define which site this is:

```html
<script>
  window.NEOSYS_SITE_ID = 'hopradio'; // Use the name of your site here
</script>
```

### 2. Add the Tracker Script
Paste this line right before the closing `</body>` tag of your site:

```html
<script src="https://yepzhi.com/visitors/tracker.js"></script>
```

*Note: If you haven't deployed the `visitors` repo to `yepzhi.com/visitors` yet, you can link to the local file or a CDN.*

---

## 📊 How to Access the Dashboard

Once the script is added to your sites, go to:
**[yepzhi.com/visitors/index.html](https://yepzhi.com/visitors/index.html)**

### Features:
- **Unified View**: See "All Sites" or filter by a specific platform.
- **Geographic Map**: Real-time markers showing where your visitors are located.
- **Privacy First**: Uses IP-based geolocation, so it doesn't interrupt the user with GPS permission popups.
- **Zero Configuration**: Sites automatically appear in the dashboard as soon as they receive their first visit.

---
*Built for the Neosys Aeon Ecosystem.*
