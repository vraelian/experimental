// js/services/UIManager.js
import { CONFIG } from '../data/config.js';
import { MARKETS, LOCATION_VISUALS } from '../data/gamedata.js';
import { HUDManager } from './view-managers/HUDManager.js';
import { MarketViewManager } from './view-managers/MarketViewManager.js';
import { StarportViewManager } from './view-managers/StarportViewManager.js';
import { TravelViewManager } from './view-managers/TravelViewManager.js';

export class UIManager {
    constructor() {
        this.isMobile = window.innerWidth <= 768;
        this.modalQueue = [];
        this.activeGraphAnchor = null;
        this.activeGenericTooltipAnchor = null;
        this._cacheDOM();

        // Instantiate view managers
        this.hudManager = new HUDManager(this.cache);
        this.marketViewManager = new MarketViewManager(this.cache, this);
        this.starportViewManager = new StarportViewManager(this.cache);
        this.travelViewManager = new TravelViewManager(this.cache);

        window.addEventListener('resize', () => { this.isMobile = window.innerWidth <= 768; });
    }

    _cacheDOM() {
        this.cache = {
            gameContainer: document.getElementById('game-container'),
            headerTitle: document.getElementById('header-title'),
            headerSubtitle: document.getElementById('header-subtitle'),
            headerNavButtons: document.getElementById('header-nav-buttons'),
            gameDay: document.getElementById('game-day'),
            gameDate: document.getElementById('game-date-display'),
            vesselDetails: document.getElementById('vessel-details-container'),
            shipHealth: document.getElementById('ship-health'),
            cargoSpace: document.getElementById('player-inventory-space'),
            shipFuel: document.getElementById('ship-fuel-points'),
            shipFuelBar: document.getElementById('ship-fuel-bar'),
            captainInfo: document.getElementById('captain-info-panel'),
            financePanel: document.getElementById('finance-panel'),
            marketPrices: document.getElementById('market-prices'),
            locationsGrid: document.getElementById('locations-grid'),
            inventoryList: document.getElementById('inventory-list'),
            inventoryTitle: document.getElementById('inventory-title'),
            servicesCreditMirror: document.getElementById('services-credit-mirror'),
            debtContainer: document.getElementById('debt-container'),
            fuelPrice: document.getElementById('fuel-price'),
            repairCost: document.getElementById('repair-cost'),
            repairBtn: document.getElementById('repair-btn'),
            refuelBtn: document.getElementById('refuel-btn'),
            intelPurchaseContainer: document.getElementById('intel-purchase-container'),
            intelDisplay: document.getElementById('intel-display'),
            playerInventory: document.getElementById('player-inventory'),
            starportShipyard: document.getElementById('starport-shipyard'),
            starportHangar: document.getElementById('starport-hangar'),
            graphTooltip: document.getElementById('graph-tooltip'),
            genericTooltip: document.getElementById('generic-tooltip'),
        };
    }

    render(gameState) {
        if (!gameState || !gameState.player) return;
        const location = MARKETS.find(l => l.id === gameState.currentLocationId);
        if (location) this.cache.gameContainer.className = `game-container p-4 md:p-8 ${location.bg}`;
        this.renderHeader(gameState);
        this.hudManager.render(gameState);
        this.renderActiveView(gameState);
    }
    
    renderHeader(gameState) {
        const { currentView, currentLocationId } = gameState;
        const location = MARKETS.find(l => l.id === currentLocationId);
        let title = 'System Navigation', subtitle = 'Select your next destination.';
        if (currentView === 'market-view' && location) { title = location.name; subtitle = location.description; }
        else if (currentView === 'starport-view') { title = 'Starport'; subtitle = 'Vessel acquisition and fleet management.'; }
        this.cache.headerTitle.textContent = title;
        this.cache.headerSubtitle.textContent = subtitle;
        this.renderHeaderNav(gameState);
    }

    renderHeaderNav(gameState) {
        const { currentView, player: { starportUnlocked } } = gameState;
        const buttons = [
            { id: 'market-button', view: 'market-view', label: 'Market' },
            { id: 'travel-button', view: 'travel-view', label: 'Travel' },
            { id: 'starport-button', view: 'starport-view', label: 'Starport', locked: !starportUnlocked }
        ];
        this.cache.headerNavButtons.innerHTML = buttons.map(btn => {
            const action = btn.locked ? 'show-starport-locked-toast' : 'set-view';
            const viewData = btn.locked ? '' : `data-view-id="${btn.view}"`;
            const isDisabled = btn.locked || (currentView === btn.view && !btn.locked);
            return `<button id="${btn.id}" data-action="${action}" ${viewData} class="btn btn-header ${currentView === btn.view ? 'btn-header-active' : ''}" ${isDisabled ? 'disabled' : ''}>${btn.label}</button>`;
        }).join('');
    }

    renderActiveView(gameState) {
        document.querySelectorAll('.view').forEach(v => v.classList.remove('active-view'));
        const activeView = document.getElementById(gameState.currentView);
        if (activeView) activeView.classList.add('active-view');

        this.cache.inventoryTitle.textContent = this.isMobile ? "Cargo Manifest" : "Active Ship Cargo Manifest";

        switch (gameState.currentView) {
            case 'market-view': this.marketViewManager.render(gameState); break;
            case 'travel-view': this.travelViewManager.render(gameState); break;
            case 'starport-view': this.starportViewManager.render(gameState); break;
        }
    }
    
    // Delegated granular updates
    updateTime(day) { this.hudManager.updateTime(day); }
    updateLiveHUD(gameState) { this.hudManager.updateLiveHUD(gameState); }
    updateLiveServices(gameState) { this.marketViewManager.updateLiveServices(gameState); }
    renderFinancePanel(gameState) { this.hudManager.renderFinancePanel(gameState); }
    renderInventoryList(gameState) { this.marketViewManager.renderInventoryList(gameState); }
    renderStarportView(gameState) { this.starportViewManager.render(gameState); }
    
    // --- SHARED UTILS / MODALS ---
    getItemPrice(gameState, goodId, isSelling = false) {
        let price = gameState.market.prices[gameState.currentLocationId][goodId];
        const market = MARKETS.find(m => m.id === gameState.currentLocationId);
        if (isSelling && market.specialDemand && market.specialDemand[goodId]) price *= market.specialDemand[goodId].bonus;
        const intel = gameState.intel.active;
        if (intel && intel.targetMarketId === gameState.currentLocationId && intel.commodityId === goodId) price *= (intel.type === 'demand') ? CONFIG.INTEL_DEMAND_MOD : CONFIG.INTEL_DEPRESSION_MOD;
        return Math.max(1, Math.round(price));
    }

    _getIndicatorHtml(price, sellPrice, galacticAvg, playerItem, isMobile) {
        const marketDiff = price - galacticAvg;
        const marketPct = galacticAvg > 0 ? Math.round((marketDiff / galacticAvg) * 100) : 0;
        const marketSign = marketPct > 0 ? '+' : '';
        let marketColor = marketPct < -15 ? 'text-red-400' : (marketPct > 15 ? 'text-green-400' : 'text-white');
        let marketArrowSVG = this._getArrowSvg(marketPct > 15 ? 'up' : marketPct < -15 ? 'down' : 'neutral');
        if (isMobile) {
            let mobileHtml = `<div class="mobile-indicator-wrapper text-sm text-outline"><div class="flex items-center ${marketColor}"><span>MKT: ${marketSign}${marketPct}%</span> ${marketArrowSVG}</div>`;
            if (playerItem && playerItem.avgCost > 0) {
                const spreadPerUnit = sellPrice - playerItem.avgCost;
                if (Math.abs(spreadPerUnit) > 0.01) {
                    const plPct = playerItem.avgCost > 0 ? Math.round((spreadPerUnit / playerItem.avgCost) * 100) : 0;
                    const plColor = spreadPerUnit >= 0 ? 'text-green-400' : 'text-red-400';
                    const plSign = plPct > 0 ? '+' : '';
                    let plArrowSVG = this._getArrowSvg(spreadPerUnit > 0 ? 'up' : 'down');
                    mobileHtml += `<div class="flex items-center ${plColor}"><span>P/L: ${plSign}${plPct}%</span> ${plArrowSVG}</div>`;
                }
            }
            mobileHtml += `</div>`;
            return { marketIndicatorHtml: mobileHtml };
        } else {
            const marketIndicatorHtml = `<div class="flex items-center gap-2"><div class="market-indicator-stacked ${marketColor}"><span class="text-xs opacity-80">MKT</span><span>${marketSign}${marketPct}%</span></div>${marketArrowSVG}</div>`;
            let plIndicatorHtml = '';
            if (playerItem && playerItem.avgCost > 0) {
                const spreadPerUnit = sellPrice - playerItem.avgCost;
                if (Math.abs(spreadPerUnit) > 0.01) {
                    const plPct = playerItem.avgCost > 0 ? Math.round((spreadPerUnit / playerItem.avgCost) * 100) : 0;
                    const plColor = spreadPerUnit >= 0 ? 'text-green-400' : 'text-red-400';
                    const plSign = plPct > 0 ? '+' : '';
                    let plArrowSVG = this._getArrowSvg(spreadPerUnit > 0 ? 'up' : 'down');
                    plIndicatorHtml = `<div class="flex items-center gap-2"><div class="market-indicator-stacked ${plColor}"><span class="text-xs opacity-80">P/L</span><span>${plSign}${plPct}%</span></div>${plArrowSVG}</div>`;
                }
            }
            return { marketIndicatorHtml, plIndicatorHtml };
        }
    }

    _getArrowSvg(direction) {
        const path = { up: 'M4 12l1.41 1.41L11 7.83V20h2V7.83l5.58 5.59L20 12l-8-8-8 8z', down: 'M20 12l-1.41-1.41L13 16.17V4h-2v12.17l-5.58-5.59L4 12l8 8 8-8z', neutral: 'M5 12h14' };
        return `<svg class="indicator-arrow" viewBox="0 0 24 24" fill="${direction === 'neutral' ? 'none' : 'currentColor'}" stroke="${direction === 'neutral' ? 'currentColor' : 'none'}" stroke-width="${direction === 'neutral' ? '3' : '0'}"><path d="${path[direction]}"/></svg>`;
    }
    
    showTravelAnimation(from, to, travelInfo, totalHullDamagePercent, finalCallback) {
        const modal = document.getElementById('travel-animation-modal');
        const statusText = document.getElementById('travel-status-text');
        const arrivalLore = document.getElementById('travel-arrival-lore');
        const canvas = document.getElementById('travel-canvas');
        const ctx = canvas.getContext('2d');
        const progressContainer = document.getElementById('travel-progress-container');
        const progressBar = document.getElementById('travel-progress-bar');
        const readoutContainer = document.getElementById('travel-readout-container');
        const infoText = document.getElementById('travel-info-text');
        const hullDamageText = document.getElementById('travel-hull-damage');
        const confirmButton = document.getElementById('travel-confirm-button');
        let animationFrameId = null;
        statusText.textContent = `Traveling to ${to.name}...`;
        arrivalLore.textContent = '';
        arrivalLore.style.opacity = 0;
        readoutContainer.classList.add('hidden');
        readoutContainer.style.opacity = 0;
        confirmButton.classList.add('hidden');
        confirmButton.style.opacity = 0;
        progressContainer.classList.remove('hidden');
        progressBar.style.width = '0%';
        modal.classList.remove('hidden');
        const duration = 2500;
        let startTime = null;
        const fromEmoji = LOCATION_VISUALS[from.id] || '❓';
        const toEmoji = LOCATION_VISUALS[to.id] || '❓';
        const shipEmoji = '🚀';
        let stars = Array.from({length: 150}, () => ({ x: Math.random() * canvas.clientWidth, y: Math.random() * canvas.clientHeight, radius: Math.random() * 1.5, speed: 0.2 + Math.random() * 0.8, alpha: 0.5 + Math.random() * 0.5 }));
        canvas.width = canvas.clientWidth; canvas.height = canvas.clientHeight;
        const animationLoop = (currentTime) => {
            if (!startTime) startTime = currentTime;
            let progress = Math.min((currentTime - startTime) / duration, 1);
            progress = 1 - Math.pow(1 - progress, 3);
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = '#FFF';
            stars.forEach(star => {
                if (progress < 1) { star.x -= star.speed; if (star.x < 0) star.x = canvas.width; }
                ctx.beginPath(); ctx.arc(star.x, star.y, star.radius, 0, Math.PI * 2); ctx.globalAlpha = star.alpha; ctx.fill();
            });
            ctx.globalAlpha = 1.0;
            const padding = 60, startX = padding, endX = canvas.width - padding, y = canvas.height / 2;
            ctx.font = '42px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText(fromEmoji, startX, y); ctx.fillText(toEmoji, endX, y);
            const shipX = startX + (endX - startX) * progress;
            ctx.save(); ctx.translate(shipX, y); ctx.font = '17px sans-serif'; ctx.fillText(shipEmoji, 0, 0); ctx.restore();
            progressBar.style.width = `${progress * 100}%`;
            if (progress < 1) animationFrameId = requestAnimationFrame(animationLoop);
            else {
                statusText.textContent = `Arrived at ${to.name}`;
                arrivalLore.innerHTML = to.arrivalLore || "You have arrived.";
                infoText.innerHTML = `<div class="text-center ${this.isMobile ? 'travel-info-mobile' : ''}"><div>Journey Time: ${travelInfo.time} Days</div><div><span class="font-bold text-sky-300">Fuel Expended: ${travelInfo.fuelCost}</span></div></div>`;
                hullDamageText.className = 'text-sm font-roboto-mono mt-1 font-bold text-red-400';
                if (totalHullDamagePercent > 0.01) {
                    hullDamageText.innerHTML = `Hull Integrity -${totalHullDamagePercent.toFixed(2)}%`;
                    if (this.isMobile) infoText.querySelector('div').appendChild(hullDamageText);
                } else hullDamageText.innerHTML = '';
                arrivalLore.style.opacity = 1;
                progressContainer.classList.add('hidden');
                readoutContainer.classList.remove('hidden');
                confirmButton.classList.remove('hidden');
                setTimeout(() => { readoutContainer.style.opacity = 1; confirmButton.style.opacity = 1; }, 50);
            }
        }
        animationFrameId = requestAnimationFrame(animationLoop);
        confirmButton.onclick = () => { cancelAnimationFrame(animationFrameId); modal.classList.add('hidden'); if (finalCallback) finalCallback(); };
    }
    
    queueModal(modalId, title, description, callback = null, options = {}) {
        this.modalQueue.push({ modalId, title, description, callback, options });
        if (!document.querySelector('.modal-backdrop:not(.hidden)')) this.processModalQueue();
    }

    processModalQueue() {
        if (this.modalQueue.length === 0) return;
        const { modalId, title, description, callback, options } = this.modalQueue.shift();
        const modal = document.getElementById(modalId);
        if (!modal) return this.processModalQueue();
        const titleEl = modal.querySelector('#' + modalId.replace('-modal', '-title'));
        const descEl = modal.querySelector('#' + modalId.replace('-modal', '-description')) || modal.querySelector('#' + modalId.replace('-modal', '-scenario'));
        if(titleEl) titleEl.innerHTML = title;
        if(descEl) descEl.innerHTML = description;
        const closeHandler = () => {
            modal.classList.add('modal-hiding');
            modal.addEventListener('animationend', () => {
                modal.classList.add('hidden');
                modal.classList.remove('modal-hiding');
                if (callback) callback();
                this.processModalQueue();
            }, { once: true });
        };
        if (options.customSetup) options.customSetup(modal, closeHandler);
        else {
            const btnContainer = modal.querySelector('#' + modalId.replace('-modal', '-button-container'));
            let button;
            if (btnContainer) { btnContainer.innerHTML = ''; button = document.createElement('button'); btnContainer.appendChild(button); }
            else button = modal.querySelector('#' + modalId.replace('-modal', '-ok-button'));
            if (button) {
                button.className = 'btn px-6 py-2';
                if (options.buttonClass) button.classList.add(options.buttonClass);
                button.innerHTML = options.buttonText || 'Understood';
                button.onclick = closeHandler;
            }
        }
        modal.classList.remove('hidden');
        modal.classList.add('modal-visible');
    }
    showRandomEventModal(event, choicesCallback) {
        this.queueModal('random-event-modal', event.title, event.scenario, null, {
            customSetup: (modal, closeHandler) => {
                const choicesContainer = modal.querySelector('#random-event-choices-container');
                choicesContainer.innerHTML = '';
                event.choices.forEach((choice, index) => {
                    const button = document.createElement('button');
                    button.className = 'btn w-full text-center p-4 hover:bg-slate-700';
                    button.innerHTML = choice.title;
                    button.onclick = () => { choicesCallback(event.id, index); closeHandler(); };
                    choicesContainer.appendChild(button);
                });
            }
        });
    }

    showAgeEventModal(event, choiceCallback) {
        const modal = document.getElementById('age-event-modal');
        document.getElementById('age-event-title').innerHTML = event.title;
        document.getElementById('age-event-description').innerHTML = event.description;
        const btnContainer = document.getElementById('age-event-button-container');
        btnContainer.innerHTML = '';
        event.choices.forEach(choice => {
            const button = document.createElement('button');
            button.className = 'perk-button';
            button.innerHTML = `<h4>${choice.title}</h4><p>${choice.description}</p>`;
            button.onclick = () => { this.hideModal('age-event-modal'); choiceCallback(choice); };
            btnContainer.appendChild(button);
        });
        modal.classList.remove('hidden');
        modal.classList.add('modal-visible');
    }

    hideModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal && !modal.classList.contains('hidden')) {
            modal.classList.add('modal-hiding');
            modal.addEventListener('animationend', () => {
                modal.classList.add('hidden');
                modal.classList.remove('modal-hiding');
                if (this.modalQueue.length > 0 && !document.querySelector('.modal-backdrop:not(.hidden)')) {
                    this.processModalQueue();
                }
            }, { once: true });
        }
    }

    createFloatingText(text, x, y, color = '#fde047') {
        const el = document.createElement('div');
        el.textContent = text;
        el.className = 'floating-text';
        el.style.left = `${x - 20}px`; el.style.top = `${y - 40}px`; el.style.color = color;
        document.body.appendChild(el);
        setTimeout(() => el.remove(), 2450);
    }
    
    showToast(toastId, message, duration = 3000) {
        const toast = document.getElementById(toastId);
        if (!toast) return;
        toast.textContent = message;
        toast.classList.remove('hidden');
        toast.style.opacity = '1';
        setTimeout(() => {
            toast.style.opacity = '0';
            setTimeout(() => toast.classList.add('hidden'), 300);
        }, duration);
    }
    showGraph(anchorEl, gameState) { /* ... implementation unchanged ... */ }
    hideGraph() { /* ... implementation unchanged ... */ }
    updateGraphTooltipPosition() { /* ... implementation unchanged ... */ }
    showGenericTooltip(anchorEl, content) { /* ... implementation unchanged ... */ }
    hideGenericTooltip() { /* ... implementation unchanged ... */ }
    updateGenericTooltipPosition() { /* ... implementation unchanged ... */ }
    _renderPriceGraph(goodId, gameState, playerItem) { /* ... implementation unchanged ... */ }
    _renderFinanceGraph(gameState) { /* ... implementation unchanged ... */ }
}