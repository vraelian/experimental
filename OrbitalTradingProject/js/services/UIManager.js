import { CONFIG } from '../data/config.js';
import { SHIPS, COMMODITIES, MARKETS } from '../data/gamedata.js';
import { formatCredits, calculateInventoryUsed, getDateFromDay } from '../utils.js';

class UIManager {
    constructor() {
        this.isMobile = window.innerWidth <= 768;
        this.modalQueue = [];
        this.activeGraphAnchor = null;
        this._cacheDOM();
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
            marketItemTemplate: document.getElementById('market-item-template'),
            servicesCreditMirror: document.getElementById('services-credit-mirror'),
            debtContainer: document.getElementById('debt-container'),
            fuelPrice: document.getElementById('fuel-price'),
            repairCost: document.getElementById('repair-cost'),
            repairBtn: document.getElementById('repair-btn'),
            refuelBtn: document.getElementById('refuel-btn'),
            intelPurchaseContainer: document.getElementById('intel-purchase-container'),
            intelDisplay: document.getElementById('intel-display'),
            playerInventory: document.getElementById('player-inventory'),
            
            views: {
                market: document.getElementById('view-market'),
                travel: document.getElementById('view-travel'),
                starport: document.getElementById('view-starport'),
            }
        };
    }

    render(state) {
        if (!state || !state.player) return;
        const location = MARKETS.find(l => l.id === state.currentLocationId);
        if (location) {
            this.cache.gameContainer.className = `game-container p-4 md:p-8 ${location.bg}`;
        }
        this.renderHeader(state);
        this.renderHUD(state);
        this.renderActiveView(state);
    }
    
    renderHeader(state) {
        const { currentView, currentLocationId } = state;
        const location = MARKETS.find(l => l.id === currentLocationId);
        
        let title = 'System Navigation';
        let subtitle = 'Select your next destination.';

        if (currentView === 'market-view' && location) {
            title = location.name;
            subtitle = location.description;
        } else if (currentView === 'starport-view') {
            title = 'Starport';
            subtitle = 'Vessel acquisition and fleet management.';
        }

        this.cache.headerTitle.textContent = title;
        this.cache.headerSubtitle.textContent = subtitle;
        this.renderHeaderNav(state);
    }

    renderHeaderNav(state) {
        const { currentView, player: { starportUnlocked } } = state;
        const buttons = [
            { id: 'market-button', view: 'market-view', label: 'Market' },
            { id: 'travel-button', view: 'travel-view', label: 'Travel' },
            { id: 'starport-button', view: 'starport-view', label: 'Starport', disabled: !starportUnlocked }
        ];
        this.cache.headerNavButtons.innerHTML = buttons.map(btn => `
            <button id="${btn.id}" data-action="set-view" data-view-id="${btn.view}" 
                    class="btn btn-header ${currentView === btn.view ? 'btn-header-active' : ''}" 
                    ${currentView === btn.view || btn.disabled ? 'disabled' : ''}>
                ${btn.label}
            </button>
        `).join('');
    }
    
    renderHUD(state) {
        const { player, day } = state;
        const activeShipId = player.activeShipId;
        const shipStatic = SHIPS[activeShipId];
        const shipDynamic = player.shipStates[activeShipId];
        const inventory = player.inventories[activeShipId];
        const cargoUsed = calculateInventoryUsed(inventory);

        this.cache.gameDay.textContent = day;
        this.cache.gameDate.textContent = getDateFromDay(day);
        this.cache.vesselDetails.innerHTML = `<p>${shipStatic.name} (Class ${shipStatic.class})</p>`;
        
        this.cache.shipHealth.textContent = `${Math.floor(shipDynamic.health)}%`;
        this.cache.cargoSpace.textContent = `${cargoUsed}/${shipStatic.cargoCapacity}`;
        this.cache.shipFuel.textContent = `${Math.floor(shipDynamic.fuel)}/${shipStatic.maxFuel}`;
        this.cache.shipFuelBar.style.width = `${(shipDynamic.fuel / shipDynamic.maxFuel) * 100}%`;
        
        this.cache.captainInfo.innerHTML = `<span>${player.playerTitle} ${player.name}, ${player.playerAge}</span>`;

        this.renderFinancePanel(state);
    }

    renderFinancePanel(state) {
        const { player } = state;
        if (player.debt > 0) {
            this.cache.financePanel.innerHTML = `
                <div><span class="block text-sm text-cyan-400">Credits</span><span class="text-xl font-bold font-roboto-mono text-cyan-300">${formatCredits(player.credits, false)}</span></div>
                <div><span class="block text-sm text-red-400">Debt</span><span class="text-xl font-bold font-roboto-mono text-red-400">${formatCredits(player.debt, false)}</span></div>
                <div><span class="block text-sm text-red-400">Interest / 7d</span><span class="text-xl font-bold font-roboto-mono text-red-400">${formatCredits(player.weeklyInterestAmount, false)}</span></div>
            `;
        } else {
             this.cache.financePanel.innerHTML = `<div><span class="block text-sm text-cyan-400">Credits</span><span class="text-2xl font-bold font-roboto-mono text-cyan-300">${formatCredits(player.credits, false)}</span></div>`;
        }
    }

    renderActiveView(state) {
        Object.values(this.cache.views).forEach(view => view.classList.remove('active'));
        const viewKey = state.currentView.split('-')[0];
        
        if (this.cache.views[viewKey]) {
            this.cache.views[viewKey].classList.add('active');
            if (viewKey === 'market') this.renderMarketView(state);
            if (viewKey === 'travel') this.renderTravelView(state);
        }
    }

    renderMarketView(state) {
        const { player, market, currentLocationId } = state;
        const availableCommodities = COMMODITIES.filter(c => c.unlockLevel <= player.unlockedCommodityLevel);
        const fragment = document.createDocumentFragment();

        availableCommodities.forEach(good => {
            const clone = this.cache.marketItemTemplate.content.cloneNode(true);
            const container = clone.querySelector('.item-card-container > div');
            container.classList.add(good.styleClass);

            const playerItem = player.inventories[player.activeShipId][good.id];
            const nameEl = clone.querySelector('[data-commodity-name]');
            nameEl.textContent = good.name;
            if (playerItem.quantity > 0) {
                nameEl.innerHTML += ` <span class='text-cyan-300'>(${playerItem.quantity})</span>`;
            }

            clone.querySelector('[data-price]').textContent = formatCredits(market.prices[currentLocationId][good.id]);
            clone.querySelector('[data-availability]').innerHTML = `Avail: ${market.inventory[currentLocationId][good.id].quantity}`;
            
            clone.querySelectorAll('button, input').forEach(ctrl => ctrl.dataset.goodId = good.id);
            fragment.appendChild(clone);
        });

        this.cache.marketPrices.innerHTML = '';
        this.cache.marketPrices.appendChild(fragment);

        this.renderInventoryList(state);
        this.renderStationServices(state);
    }
    
    renderInventoryList(state) {
        const inventory = state.player.inventories[state.player.activeShipId];
        const ownedGoods = Object.entries(inventory).filter(([, item]) => item.quantity > 0);
        this.cache.playerInventory.classList.toggle('hidden', ownedGoods.length === 0);
        if (ownedGoods.length > 0) {
            this.cache.inventoryList.innerHTML = ownedGoods.map(([goodId, item]) => {
                const good = COMMODITIES.find(c => c.id === goodId);
                return `<div class="p-2 rounded-lg border-2 ${good.styleClass}" title="Avg Cost: ${formatCredits(item.avgCost, false)}"><div class="font-semibold text-sm">${good.name}</div><div class="text-lg text-center">(${item.quantity})</div></div>`;
            }).join('');
        }
    }

    renderStationServices(state) {
        this.cache.servicesCreditMirror.innerHTML = `<span>${formatCredits(state.player.credits)}</span>`;
    }

    renderTravelView(state) {
        const { player, currentLocationId, TRAVEL_DATA } = state;
        this.cache.locationsGrid.innerHTML = MARKETS
            .filter(loc => player.unlockedLocationIds.includes(loc.id))
            .map(location => {
                const isCurrent = location.id === currentLocationId;
                const travelInfo = isCurrent ? null : TRAVEL_DATA[currentLocationId][location.id];
                return `
                <div class="location-card p-6 rounded-lg text-center flex flex-col ${isCurrent ? 'highlight-current' : ''} ${location.color} ${location.bg}" data-action="travel" data-location-id="${location.id}">
                    <h3 class="text-2xl font-orbitron">${location.name}</h3>
                    <p class="text-gray-300 mt-2 flex-grow">${location.description}</p>
                    <div class="location-card-footer mt-auto pt-3 border-t border-cyan-100/10">
                    ${isCurrent 
                        ? '<p class="text-yellow-300 font-bold mt-2">(Currently Docked)</p>' 
                        : `<div class="flex justify-around items-center text-center">
                                <div><span class="font-bold text-lg">${travelInfo.time}</span><span class="block text-xs">Days</span></div>
                                <div><span class="font-bold text-lg">${travelInfo.fuelCost}</span><span class="block text-xs">Fuel</span></div>
                           </div>`
                    }
                    </div>
                </div>`;
        }).join('');
    }

    queueModal(modalId, title, description, callback = null, options = {}) {
        this.modalQueue.push({ modalId, title, description, callback, options });
        if (!document.querySelector('.modal-backdrop:not(.hidden)')) {
            this.processModalQueue();
        }
    }

    processModalQueue() {
        if (this.modalQueue.length === 0) return;
        const { modalId, title, description, callback, options } = this.modalQueue.shift();
        const modal = document.getElementById(modalId);
        if (!modal) return this.processModalQueue();

        modal.querySelector('#' + modalId.replace('-modal', '-title')).innerHTML = title;
        modal.querySelector('#' + modalId.replace('-modal', '-description')).innerHTML = description;

        const closeHandler = () => {
            modal.classList.add('modal-hiding');
            modal.addEventListener('animationend', () => {
                modal.classList.add('hidden');
                modal.classList.remove('modal-hiding');
                if (callback) callback();
                this.processModalQueue();
            }, { once: true });
        };

        const btnContainer = modal.querySelector('#' + modalId.replace('-modal', '-button-container'));
        let button;

        if (btnContainer) {
            btnContainer.innerHTML = ''; // Clear previous buttons
            button = document.createElement('button');
            btnContainer.appendChild(button);
        } else {
            button = modal.querySelector('#' + modalId.replace('-modal', '-ok-button'));
        }
        
        button.className = 'btn px-6 py-2';
        if (options.buttonClass) button.classList.add(options.buttonClass);
        button.innerHTML = options.buttonText || 'Understood';
        button.onclick = closeHandler;

        modal.classList.remove('hidden');
        modal.classList.add('modal-visible');
    }
    
    createFloatingText(text, x, y, color = '#fde047') {
        const el = document.createElement('div');
        el.textContent = text;
        el.className = 'floating-text';
        el.style.left = `${x - 20}px`;
        el.style.top = `${y - 40}px`;
        el.style.color = color;
        document.body.appendChild(el);
        setTimeout(() => el.remove(), 2450);
    }
}

export default UIManager;