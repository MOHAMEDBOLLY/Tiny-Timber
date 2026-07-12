// Tiny Timber Production PWA bootstrap: service worker registration,
// install prompt card, and update-available banner.
// Included by both shop.html and admin.html. Adds no changes to existing UI/logic;
// only injects its own small, self-contained elements styled from each page's
// existing CSS variables (--card, --primary, --text, --border) so it matches
// light/dark mode automatically.
(function () {
    'use strict';

    var INSTALL_DISMISS_KEY = 'tinyTimberInstallDismissed';
    var INSTALL_DISMISS_DAYS = 7;

    function isStandalone() {
        return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
    }

    function injectStyles() {
        if (document.getElementById('pwa-widget-styles')) return;
        var style = document.createElement('style');
        style.id = 'pwa-widget-styles';
        style.textContent = [
            '.pwa-card{position:fixed;left:16px;right:16px;bottom:16px;z-index:9999;',
            'background:var(--card,#fff);color:var(--text,#333);border:1px solid var(--border,#e5e5e5);',
            'border-radius:16px;padding:16px;box-shadow:0 8px 24px rgba(0,0,0,0.18);',
            'font-family:"Quicksand",sans-serif;max-width:420px;margin:0 auto;',
            'display:flex;align-items:center;gap:12px;animation:pwaSlideUp .3s ease-out;}',
            '@keyframes pwaSlideUp{from{transform:translateY(16px);opacity:0}to{transform:translateY(0);opacity:1}}',
            '.pwa-card-icon{width:40px;height:40px;border-radius:10px;flex-shrink:0;object-fit:cover;}',
            '.pwa-card-body{flex:1;min-width:0;}',
            '.pwa-card-title{font-weight:700;font-size:14px;margin:0 0 2px;}',
            '.pwa-card-text{font-size:12px;color:var(--text-light,#777);margin:0;}',
            '.pwa-card-actions{display:flex;gap:8px;flex-shrink:0;}',
            '.pwa-btn{border:none;border-radius:10px;padding:8px 14px;font-family:inherit;',
            'font-size:12px;font-weight:700;cursor:pointer;white-space:nowrap;}',
            '.pwa-btn-primary{background:var(--primary,#8B5A2B);color:#fff;}',
            '.pwa-btn-secondary{background:transparent;color:var(--text-light,#777);}',
            '.pwa-update-card{position:fixed;top:16px;left:16px;right:16px;z-index:9999;',
            'background:var(--card,#fff);color:var(--text,#333);border:1px solid var(--border,#e5e5e5);',
            'border-radius:16px;padding:14px 16px;box-shadow:0 8px 24px rgba(0,0,0,0.18);',
            'font-family:"Quicksand",sans-serif;max-width:420px;margin:0 auto;',
            'display:flex;align-items:center;gap:12px;animation:pwaSlideDown .3s ease-out;}',
            '@keyframes pwaSlideDown{from{transform:translateY(-16px);opacity:0}to{transform:translateY(0);opacity:1}}'
        ].join('');
        document.head.appendChild(style);
    }

    function showInstallCard(deferredPrompt) {
        if (document.getElementById('pwa-install-card')) return;
        injectStyles();

        var card = document.createElement('div');
        card.id = 'pwa-install-card';
        card.className = 'pwa-card';
        card.innerHTML =
            '<img class="pwa-card-icon" src="images/icons/icon-192.png" alt="Tiny Timber">' +
            '<div class="pwa-card-body">' +
            '<p class="pwa-card-title">Install Tiny Timber</p>' +
            '<p class="pwa-card-text">Add to your home screen for quick access</p>' +
            '</div>' +
            '<div class="pwa-card-actions">' +
            '<button class="pwa-btn pwa-btn-secondary" id="pwa-install-dismiss">Not now</button>' +
            '<button class="pwa-btn pwa-btn-primary" id="pwa-install-accept">Install</button>' +
            '</div>';
        document.body.appendChild(card);

        document.getElementById('pwa-install-accept').addEventListener('click', function () {
            card.remove();
            if (!deferredPrompt) return;
            deferredPrompt.prompt();
            deferredPrompt.userChoice.finally(function () {
                deferredPrompt = null;
            });
        });

        document.getElementById('pwa-install-dismiss').addEventListener('click', function () {
            card.remove();
            try {
                localStorage.setItem(INSTALL_DISMISS_KEY, String(Date.now()));
            } catch (e) { /* ignore storage errors */ }
        });
    }

    function installDismissedRecently() {
        try {
            var raw = localStorage.getItem(INSTALL_DISMISS_KEY);
            if (!raw) return false;
            var elapsedDays = (Date.now() - Number(raw)) / (1000 * 60 * 60 * 24);
            return elapsedDays < INSTALL_DISMISS_DAYS;
        } catch (e) {
            return false;
        }
    }

    function initInstallPrompt() {
        if (isStandalone()) return;

        window.addEventListener('beforeinstallprompt', function (event) {
            event.preventDefault();
            if (installDismissedRecently()) return;
            showInstallCard(event);
        });

        window.addEventListener('appinstalled', function () {
            var card = document.getElementById('pwa-install-card');
            if (card) card.remove();
            try {
                localStorage.removeItem(INSTALL_DISMISS_KEY);
            } catch (e) { /* ignore storage errors */ }
        });
    }

    function showUpdateBanner(registration) {
        if (document.getElementById('pwa-update-card')) return;
        injectStyles();

        var card = document.createElement('div');
        card.id = 'pwa-update-card';
        card.className = 'pwa-update-card';
        card.innerHTML =
            '<div class="pwa-card-body">' +
            '<p class="pwa-card-title">New version available</p>' +
            '<p class="pwa-card-text">Update Tiny Timber to get the latest changes</p>' +
            '</div>' +
            '<div class="pwa-card-actions">' +
            '<button class="pwa-btn pwa-btn-secondary" id="pwa-update-later">Later</button>' +
            '<button class="pwa-btn pwa-btn-primary" id="pwa-update-now">Update Now</button>' +
            '</div>';
        document.body.appendChild(card);

        document.getElementById('pwa-update-later').addEventListener('click', function () {
            card.remove();
        });

        document.getElementById('pwa-update-now').addEventListener('click', function () {
            var waiting = registration.waiting;
            if (waiting) {
                waiting.postMessage({ type: 'SKIP_WAITING' });
            }
            card.remove();
        });
    }

    function initServiceWorker() {
        if (!('serviceWorker' in navigator)) return;

        window.addEventListener('load', function () {
            navigator.serviceWorker.register('service-worker.js').then(function (registration) {
                if (registration.waiting && navigator.serviceWorker.controller) {
                    showUpdateBanner(registration);
                }

                registration.addEventListener('updatefound', function () {
                    var newWorker = registration.installing;
                    if (!newWorker) return;
                    newWorker.addEventListener('statechange', function () {
                        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                            showUpdateBanner(registration);
                        }
                    });
                });
            }).catch(function (err) {
                console.warn('[PWA] Service worker registration failed:', err);
            });

            var refreshing = false;
            navigator.serviceWorker.addEventListener('controllerchange', function () {
                if (refreshing) return;
                refreshing = true;
                window.location.reload();
            });
        });
    }

    initServiceWorker();
    initInstallPrompt();
})();
