// js/services/UIManager.js
import { CONFIG } from '../data/config.js';
import { SHIPS, COMMODITIES, MARKETS, LOCATION_VISUALS, PERKS } from '../data/gamedata.js';
import { formatCredits, calculateInventoryUsed, getDateFromDay } from '../utils.js';

export class UIManager {
    constructor() {
        this.isMobile = window.innerWidth <= 768;
        this.modalQueue = [];
        this.activeGraphAnchor = null;
        this._cacheDOM();

        window.addEventListener('resize', () => {
            this.isMobile = window.innerWidth <= 768;
            // This will require a re-render call from the main controller when the state is available
        });
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
            servicesCreditMirror: document.getElementById('services-credit-mirror'),
            debtContainer: document.getElementById('debt-container'),
            fuelPrice: document.getElementById('fuel-price'),
            repairCost: document.getElementById('repair-cost'),
            repairBtn: document.getElementById('repair-btn'),
            refuelBtn: document.getElementById('refuel-btn'),
            intelPurchaseContainer: document.getElementById('intel-purchase-container'),
            intelDisplay: document.getElementById('intel-display'),
            playerInventory: document.getElementById('player-inventory'),
            
            // Views
            marketView: document.getElementById('market-view'),
            travelView: document.getElementById('travel-view'),
            starportView: document.getElementById('starport-view'),

            // Modals & Toasts
            saveToast: document.getElementById('save-toast'),
            garnishmentToast: document.getElementById('garnishment-toast'),
            hullWarningToast: document.getElementById('hull-warning-toast'),
            debugToast: document.getElementById('debug-toast'),
            graphTooltip: document.getElementById('graph-tooltip'),
        };
    }

    render(gameState) {
        if (!gameState || !gameState.player) return;

        const location = MARKETS.find(l => l.id === gameState.currentLocationId);
        if (location) {
            this.cache.gameContainer.className = `game-container p-4 md:p-8 ${location.bg}`;
        }
        
        this.renderHeader(gameState);
        this.renderHUD(gameState);
        this.renderActiveView(gameState);
        this.updateLiveStats(gameState);
    }
    
    renderHeader(gameState) {
        const { currentView, currentLocationId } = gameState;
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
        this.renderHeaderNav(gameState);
    }

    renderHeaderNav(gameState) {
        const { currentView, player: { starportUnlocked } } = gameState;
        
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
    
    renderHUD(gameState) {
        const { player, day } = gameState;
        const activeShipId = player.activeShipId;
        const shipStatic = SHIPS[activeShipId];
        const shipDynamic = player.shipStates[activeShipId];
        const inventory = player.inventories[activeShipId];
        const cargoUsed = calculateInventoryUsed(inventory);

        this.cache.gameDay.textContent = day;
        this.cache.gameDate.textContent = getDateFromDay(day);
        
        this.cache.vesselDetails.innerHTML = `
            <div class="text-right">
                <p class="text-gray-400 text-sm tracking-wider">Vessel</p>
                <p>${shipStatic.name}</p>
                <p>Class: ${shipStatic.class}</p>
            </div>`;
        
        this.cache.shipHealth.textContent = `${Math.floor(shipDynamic.health)}%`;
        this.cache.cargoSpace.textContent = `${cargoUsed}/${shipStatic.cargoCapacity}`;
        this.cache.shipFuel.textContent = `${Math.floor(shipDynamic.fuel)}/${shipStatic.maxFuel}`;
        this.cache.shipFuelBar.style.width = `${(shipDynamic.fuel / shipStatic.maxFuel) * 100}%`;
        
        this.cache.captainInfo.innerHTML = `
            <span>${player.playerTitle} ${player.name}, ${player.playerAge}</span>
            <span class="graph-icon" data-action="show-finance-graph">📈</span>
        `;

        this.renderFinancePanel(gameState);
    }
    
    calculateWeeklyInterest(player) {
        if (!player || player.debt <= 0) return 0;
        if (player.weeklyInterestAmount > 0) return player.weeklyInterestAmount;
        return Math.ceil(player.debt * 0.01);
    }

    renderFinancePanel(gameState) {
        const { player } = gameState;
        if (player.debt > 0) {
            this.cache.financePanel.className = 'panel-border border border-slate-700 bg-black/30 p-4 rounded-lg mb-6 grid grid-cols-3 items-center text-center';
            this.cache.financePanel.innerHTML = `
                <div><span class="block text-sm text-cyan-400 uppercase tracking-wider">Credits</span><span class="text-xl font-bold font-roboto-mono text-cyan-300">${formatCredits(player.credits, false)}</span></div>
                <div><span class="block text-sm text-red-400 uppercase tracking-wider">Debt</span><span class="text-xl font-bold font-roboto-mono text-red-400">${formatCredits(player.debt, false)}</span></div>
                <div><span class="block text-sm text-red-400 uppercase tracking-wider">Interest / 7d</span><span class="text-xl font-bold font-roboto-mono text-red-400">${formatCredits(this.calculateWeeklyInterest(player), false)}</span></div>
            `;
        } else {
             this.cache.financePanel.className = 'panel-border border border-slate-700 bg-black/30 p-4 rounded-lg mb-6 grid grid-cols-1 items-center text-center';
             this.cache.financePanel.innerHTML = `<div><span class="block text-sm text-cyan-400 uppercase tracking-wider">Credits</span><span class="text-2xl font-bold font-roboto-mono text-cyan-300">${formatCredits(player.credits, false)}</span></div>`;
        }
    }

    renderActiveView(gameState) {
        const views = ['market-view', 'travel-view', 'starport-view'];
        views.forEach(viewId => {
            const el = document.getElementById(viewId);
            if (el) el.style.display = 'none';
        });

        const viewElement = document.getElementById(gameState.currentView);
        if (viewElement) {
            viewElement.style.display = 'block';
            if (gameState.currentView === 'market-view') this.renderMarketView(gameState);
            if (gameState.currentView === 'travel-view') this.renderTravelView(gameState);
            if (gameState.currentView === 'starport-view') this.renderStarportView(gameState);
        }
    }

    renderMarketView(gameState) {
        const availableCommodities = COMMODITIES.filter(c => c.unlockLevel <= gameState.player.unlockedCommodityLevel);
        
        const marketHtml = availableCommodities.map(good => {
            return this.isMobile ? this._getMarketItemHtmlMobile(good, gameState) : this._getMarketItemHtmlDesktop(good, gameState);
        }).join('');

        this.cache.marketPrices.innerHTML = marketHtml;

        this.renderInventoryList(gameState);
        this.renderStationServices(gameState);
        this.renderIntel(gameState);
    }
    
    _getMarketItemHtmlDesktop(good, gameState) {
        const { player, market, currentLocationId } = gameState;
        const playerItem = player.inventories[player.activeShipId][good.id];
        const price = this.getItemPrice(gameState, good.id);
        const sellPrice = this.getItemPrice(gameState, good.id, true);
        const galacticAvg = market.galacticAverages[good.id];
        const marketStock = market.inventory[currentLocationId][good.id];
        const currentLocation = MARKETS.find(m => m.id === currentLocationId);
        const isSpecialDemand = currentLocation.specialDemand && currentLocation.specialDemand[good.id];
        const buyDisabled = isSpecialDemand ? 'disabled' : '';
        const nameTooltip = isSpecialDemand ? `data-tooltip="${currentLocation.specialDemand[good.id].lore}"` : `data-tooltip="${good.lore}"`;
        const playerInvDisplay = playerItem && playerItem.quantity > 0 ? ` <span class='text-cyan-300'>(${playerItem.quantity})</span>` : '';
        const graphIcon = `<span class="graph-icon" data-action="show-price-graph" data-good-id="${good.id}">📈</span>`;
        const { marketIndicatorHtml, plIndicatorHtml } = this._getIndicatorHtml(price, sellPrice, galacticAvg, playerItem, false);

        return `
        <div class="item-card-container">
            <div class="bg-black/20 p-4 rounded-lg flex justify-between items-center border ${good.styleClass} transition-colors shadow-md h-32">
                <div class="flex flex-col h-full justify-between flex-grow self-start pt-1">
                    <div>
                         <p class="font-bold commodity-name text-outline commodity-name-tooltip" ${nameTooltip}>${good.name}${playerInvDisplay}</p>
                         <p class="font-roboto-mono text-xl font-bold text-left pt-2 price-text text-outline flex items-center">${formatCredits(price)}</p>
                    </div>
                    <div class="text-sm self-start pb-1 text-outline flex items-center gap-3">
                        <span>Avail: ${marketStock.quantity} ${graphIcon}</span>
                        <div class="flex items-center gap-2">
                            ${marketIndicatorHtml}
                            ${plIndicatorHtml}
                        </div>
                    </div>
                </div>
                <div class="flex items-center space-x-2">
                    <div class="flex flex-col items-center">
                        <div class="flex flex-col space-y-1">
                             <button class="btn item-btn" data-action="buy" data-good-id="${good.id}" ${buyDisabled}>Buy</button>
                             <button class="btn btn-sm item-btn" data-action="set-max-buy" data-good-id="${good.id}" ${buyDisabled}>Max</button>
                         </div>
                    </div>
                    <div class="flex flex-col items-center">
                          <button class="qty-btn" data-action="increment" data-good-id="${good.id}">+</button>
                         <input type="number" class="qty-input p-2 my-1" id="qty-${good.id}" data-good-id="${good.id}" value="1" min="1">
                        <button class="qty-btn" data-action="decrement" data-good-id="${good.id}">-</button>
                     </div>
                     <div class="flex flex-col items-center">
                        <div class="flex flex-col space-y-1">
                            <button class="btn item-btn" data-action="sell" data-good-id="${good.id}">Sell</button>
                            <button class="btn btn-sm item-btn" data-action="set-max-sell" data-good-id="${good.id}">Max</button>
                         </div>
                    </div>
                 </div>
              </div>
        </div>`;
    }

    _getMarketItemHtmlMobile(good, gameState) {
        const { player, market, currentLocationId } = gameState;
        const playerItem = player.inventories[player.activeShipId][good.id];
        const price = this.getItemPrice(gameState, good.id);
        const sellPrice = this.getItemPrice(gameState, good.id, true);
        const galacticAvg = market.galacticAverages[good.id];
        const marketStock = market.inventory[currentLocationId][good.id];
        const currentLocation = MARKETS.find(m => m.id === currentLocationId);
        const isSpecialDemand = currentLocation.specialDemand && currentLocation.specialDemand[good.id];
        const buyDisabled = isSpecialDemand ? 'disabled' : '';
        const nameTooltip = isSpecialDemand ? `data-tooltip="${currentLocation.specialDemand[good.id].lore}"` : `data-tooltip="${good.lore}"`;
        const playerInvDisplay = playerItem && playerItem.quantity > 0 ? ` <span class='text-cyan-300'>(${playerItem.quantity})</span>` : '';
        const graphIcon = `<span class="graph-icon" data-action="show-price-graph" data-good-id="${good.id}">📈</span>`;
        const { marketIndicatorHtml, plIndicatorHtml } = this._getIndicatorHtml(price, sellPrice, galacticAvg, playerItem, true);

        return `
        <div class="item-card-container">
            <div class="bg-black/20 p-4 rounded-lg flex flex-col border ${good.styleClass} shadow-md">
                <div class="flex justify-between items-start w-full mb-2">
                    <div class="flex-grow">
                        <p class="font-bold commodity-name text-outline commodity-name-tooltip" ${nameTooltip}>${good.name}${playerInvDisplay}</p>
                        <p class="font-roboto-mono text-xl font-bold text-left pt-2 price-text text-outline flex items-center">${formatCredits(price)}</p>
                    </div>
                    <div class="text-right text-sm flex-shrink-0 ml-2 text-outline">
                        Avail: ${marketStock.quantity} ${graphIcon}
                    </div>
                </div>
                <div class="flex justify-between items-end mt-2">
                     <div class="flex items-center space-x-3 text-sm text-outline">
                        ${marketIndicatorHtml}
                        ${plIndicatorHtml}
                    </div>
                    <div class="mobile-controls-wrapper">
                        <div class="flex flex-col items-center space-y-1">
                             <button class="btn item-btn" data-action="buy" data-good-id="${good.id}" ${buyDisabled}>Buy</button>
                             <button class="btn btn-sm item-btn" data-action="set-max-buy" data-good-id="${good.id}" ${buyDisabled}>Max</button>
                         </div>
                        <div class="flex flex-col items-center space-y-1">
                             <button class="qty-btn" data-action="increment" data-good-id="${good.id}">+</button>
                             <input type="number" class="qty-input" id="qty-${good.id}-mobile" data-good-id="${good.id}" value="1" min="1">
                             <button class="qty-btn" data-action="decrement" data-good-id="${good.id}">-</button>
                         </div>
                        <div class="flex flex-col items-center space-y-1">
                             <button class="btn item-btn" data-action="sell" data-good-id="${good.id}">Sell</button>
                              <button class="btn btn-sm item-btn" data-action="set-max-sell" data-good-id="${good.id}">Max</button>
                         </div>
                     </div>
                </div>
             </div>
        </div>`;
    }

    _getIndicatorHtml(price, sellPrice, galacticAvg, playerItem, isMobile) {
        const marketDiff = price - galacticAvg;
        const marketPct = galacticAvg > 0 ? Math.round((marketDiff / galacticAvg) * 100) : 0;
        const marketSign = marketPct > 0 ? '+' : '';
        let marketColor = marketPct < -15 ? 'text-red-400' : (marketPct > 15 ? 'text-green-400' : 'text-white');
        let marketArrowSVG = this._getArrowSvg(marketPct > 15 ? 'up' : marketPct < -15 ? 'down' : 'neutral', marketColor);

        const marketIndicatorHtml = isMobile 
            ? `<div class="flex items-center ${marketColor}"><span>MKT: ${marketSign}${marketPct}%</span> ${marketArrowSVG}</div>`
            : `<div class="flex items-center gap-2"><div class="market-indicator-stacked ${marketColor}"><span class="text-xs opacity-80">MKT</span><span>${marketSign}${marketPct}%</span></div>${marketArrowSVG}</div>`;
        
        let plIndicatorHtml = '';
        if (playerItem && playerItem.avgCost > 0) {
            const spreadPerUnit = sellPrice - playerItem.avgCost;
            if (Math.abs(spreadPerUnit) > 0.01) {
                const plPct = playerItem.avgCost > 0 ? Math.round((spreadPerUnit / playerItem.avgCost) * 100) : 0;
                const plColor = spreadPerUnit >= 0 ? 'text-green-400' : 'text-red-400';
                const plSign = plPct > 0 ? '+' : '';
                let plArrowSVG = this._getArrowSvg(spreadPerUnit > 0 ? 'up' : 'down', plColor);

                plIndicatorHtml = isMobile
                    ? `<div class="flex items-center ${plColor}"><span>P/L: ${plSign}${plPct}%</span> ${plArrowSVG}</div>`
                    : `<div class="flex items-center gap-2"><div class="market-indicator-stacked ${plColor}"><span class="text-xs opacity-80">P/L</span><span>${plSign}${plPct}%</span></div>${plArrowSVG}</div>`;
            }
        }
        
        return { marketIndicatorHtml, plIndicatorHtml };
    }

    _getArrowSvg(direction, colorClass) {
        const path = {
            up: 'M4 12l1.41 1.41L11 7.83V20h2V7.83l5.58 5.59L20 12l-8-8-8 8z',
            down: 'M20 12l-1.41-1.41L13 16.17V4h-2v12.17l-5.58-5.59L4 12l8 8 8-8z',
            neutral: ''
        };
        if (direction === 'neutral') {
             return `<svg class="indicator-arrow text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M5 12h14"/></svg>`;
        }
        return `<svg class="indicator-arrow" viewBox="0 0 24 24" fill="currentColor"><path d="${path[direction]}"/></svg>`;
    }

    getItemPrice(gameState, goodId, isSelling = false) {
        let price = gameState.market.prices[gameState.currentLocationId][goodId];
        const market = MARKETS.find(m => m.id === gameState.currentLocationId);
        if (isSelling && market.specialDemand && market.specialDemand[goodId]) {
            price *= market.specialDemand[good.id].bonus;
        }
        const intel = gameState.intel.active;
        if (intel && intel.targetMarketId === gameState.currentLocationId && intel.commodityId === goodId) {
            price *= (intel.type === 'demand') ? CONFIG.INTEL_DEMAND_MOD : CONFIG.INTEL_DEPRESSION_MOD;
        }
        return Math.max(1, Math.round(price));
    }
    
    renderInventoryList(gameState) {
        const inventory = gameState.player.inventories[gameState.player.activeShipId];
        const ownedGoods = Object.entries(inventory).filter(([, item]) => item.quantity > 0);
        this.cache.playerInventory.classList.toggle('hidden', ownedGoods.length === 0);
        if (ownedGoods.length > 0) {
            this.cache.inventoryList.innerHTML = ownedGoods.map(([goodId, item]) => {
                const good = COMMODITIES.find(c => c.id === goodId);
                const tooltipText = `${good.lore}\n\nAvg. Cost: ${formatCredits(item.avgCost, false)}`;
                return `<div class="p-2 rounded-lg border-2 ${good.styleClass} cargo-item-tooltip" style="filter: drop-shadow(0 4px 3px rgba(0, 0, 0, 0.4));" data-tooltip="${tooltipText}"><div class="font-semibold text-sm commodity-name text-outline">${good.name}</div><div class="text-lg text-center text-cyan-300 text-outline">(${item.quantity})</div></div>`;
            }).join('');
        }
    }

    renderStationServices(gameState) {
        const { player, currentLocationId } = gameState;
        
        this.cache.servicesCreditMirror.innerHTML = `<span class="text-cyan-400">⌬ </span><span class="font-bold text-cyan-300 ml-auto">${formatCredits(player.credits, false)}</span>`;

        this.cache.debtContainer.innerHTML = '';
        if (player.debt > 0) {
            let garnishmentTimerHtml = '';
            if (player.loanStartDate) {
                const daysRemaining = CONFIG.LOAN_GARNISHMENT_DAYS - (gameState.day - player.loanStartDate);
                if (daysRemaining > 0) {
                    garnishmentTimerHtml = `<p class="text-xs text-red-400/70 mt-2">Garnishment in ${daysRemaining} days</p>`;
                }
            }
            this.cache.debtContainer.innerHTML = `
               <h4 class="font-orbitron text-xl mb-2">Debt</h4>
               <button data-action="pay-debt" class="btn w-full py-3 bg-red-800/80 hover:bg-red-700/80 border-red-500" ${player.credits >= player.debt ? '' : 'disabled'}>
                   Pay Off ${formatCredits(player.debt, false)}
               </button>
               ${garnishmentTimerHtml}
               `;
       } else {
            this.cache.debtContainer.innerHTML = `<h4 class="font-orbitron text-xl mb-2">Financing</h4>`;
            const dynamicLoanAmount = Math.floor(player.credits * 3.5);
            const dynamicLoanFee = Math.floor(dynamicLoanAmount * 0.1);
            const dynamicLoanInterest = Math.floor(dynamicLoanAmount * 0.01);
            const dynamicLoanData = { amount: dynamicLoanAmount, fee: dynamicLoanFee, interest: dynamicLoanInterest };

            const loanButtonsHtml = [
                { key: '10000', amount: 10000, fee: 600, interest: 125 },
                { key: 'dynamic', ...dynamicLoanData }
            ].map((loan) => {
                const tooltipText = `Fee: ${formatCredits(loan.fee, false)}\nInterest: ${formatCredits(loan.interest, false)} / 7d`;
                return `<button class="btn btn-loan w-full p-2 mt-2 loan-btn-tooltip" data-action="take-loan" data-loan-details='${JSON.stringify(loan)}' ${player.credits < loan.fee ? 'disabled' : ''} data-tooltip="${tooltipText}">
                            <span class="font-orbitron text-cyan-300">⌬ ${formatCredits(loan.amount, false)}</span>
                        </button>`;
            }).join('');
            this.cache.debtContainer.innerHTML += `<div class="flex justify-center gap-4 w-full">${loanButtonsHtml}</div>`;
       }

        const currentMarket = MARKETS.find(m => m.id === currentLocationId);
        const ship = SHIPS[player.activeShipId];
        let fuelPrice = currentMarket.fuelPrice / 4;
        if (player.activePerks.venetian_syndicate && currentLocationId === 'loc_venus') {
            fuelPrice *= (1 - PERKS.venetian_syndicate.fuelDiscount);
        }
        this.cache.fuelPrice.textContent = formatCredits(fuelPrice, false);

        let costPerRepairTick = (ship.maxHealth * (CONFIG.REPAIR_AMOUNT_PER_TICK / 100)) * CONFIG.REPAIR_COST_PER_HP;
        if (player.activePerks.venetian_syndicate && currentLocationId === 'loc_venus') {
            costPerRepairTick *= (1 - PERKS.venetian_syndicate.repairDiscount);
        }
        this.cache.repairCost.textContent = formatCredits(costPerRepairTick, false);
    }
    
    renderIntel(gameState) {
        const { intel, player, currentLocationId, day } = gameState;
        this.cache.intelDisplay.classList.add('hidden');
        if (intel.active) {
            const daysLeft = intel.active.endDay - day;
            if (daysLeft > 0) {
                const targetMarket = MARKETS.find(m => m.id === intel.active.targetMarketId);
                const commodity = COMMODITIES.find(c => c.id === intel.active.commodityId);
                let intelText = (intel.active.type === 'demand') 
                    ? `A contact reports a <span class="hl-pulse-green">high demand</span> for <span class="font-bold text-yellow-300">${commodity.name}</span> at <span class="font-bold text-cyan-300">${targetMarket.name}</span>! The window is closing: <span class="font-bold">${daysLeft}</span> days left.` 
                    : `The market for <span class="font-bold text-yellow-300">${commodity.name}</span> at <span class="font-bold text-cyan-300">${targetMarket.name}</span> has crashed. Prices will be depressed for <span class="font-bold">${daysLeft}</span> days.`;
                this.cache.intelDisplay.className = intel.active.type === 'demand' ? 'p-3 rounded-lg my-4 text-center bg-cyan-900/40 border border-cyan-700' : 'p-3 rounded-lg my-4 text-center bg-red-900/40 border border-red-700';
                this.cache.intelDisplay.innerHTML = `<p>${intelText}</p>`;
                this.cache.intelDisplay.classList.remove('hidden');
            }
        }
        
        this.cache.intelPurchaseContainer.innerHTML = '';
        const alwaysHasIntel = ['loc_exchange', 'loc_kepler'].includes(currentLocationId);
        if ((alwaysHasIntel || intel.available[currentLocationId]) && !intel.active && player.credits >= CONFIG.INTEL_MIN_CREDITS) {
            const intelCost = Math.floor(player.credits * CONFIG.INTEL_COST_PERCENTAGE);
            this.cache.intelPurchaseContainer.innerHTML = `<button data-action="purchase-intel" class="btn btn-intel" data-cost="${intelCost}">Purchase Intel (${formatCredits(intelCost)})</button>`;
        }
    }

    renderTravelView(gameState) {
        const { player, currentLocationId, TRAVEL_DATA } = gameState;
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
                        : `<div class="flex justify-around items-center text-center"><div class="flex items-center space-x-2"><svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-gray-400" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-13a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V5z" clip-rule="evenodd" /></svg><div><span class="font-bold font-roboto-mono text-lg">${travelInfo.time}</span><span class="block text-xs text-gray-400">Days</span></div></div><div class="flex items-center space-x-2"><svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-sky-400" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clip-rule="evenodd" /></svg><div><span class="font-bold font-roboto-mono text-lg">${travelInfo.fuelCost}</span><span class="block text-xs text-gray-400">Fuel</span></div></div></div>`
                    }
                    </div>
                </div>`;
        }).join('');
    }
    
    renderStarportView(gameState) {
        const { player, currentLocationId } = gameState;
        const shipyardEl = document.getElementById('starport-shipyard');
        const hangarEl = document.getElementById('starport-hangar');
        shipyardEl.innerHTML = '';
        hangarEl.innerHTML = '';

        const commonShips = Object.entries(SHIPS).filter(([id, ship]) => !ship.isRare && ship.saleLocationId === currentLocationId && !player.ownedShipIds.includes(id));
        const rareShips = Object.entries(SHIPS).filter(([id, ship]) => ship.isRare && ship.saleLocationId === currentLocationId && !player.ownedShipIds.includes(id));

        const shipsForSale = [...commonShips];
        rareShips.forEach(shipEntry => {
            if (Math.random() < CONFIG.RARE_SHIP_CHANCE) {
                shipsForSale.push(shipEntry);
            }
        });
        
        if (shipsForSale.length > 0) {
            shipsForSale.forEach(([id, ship]) => {
                const canAfford = player.credits >= ship.price;
                shipyardEl.innerHTML += `<div class="ship-card p-4 flex flex-col space-y-3"><div class="flex justify-between items-start"><div><h3 class="text-xl font-orbitron text-cyan-300">${ship.name}</h3><p class="text-sm text-gray-400">Class ${ship.class}</p></div><div class="text-right"><p class="text-lg font-bold text-cyan-300">${formatCredits(ship.price)}</p></div></div><p class="text-sm text-gray-400 flex-grow">${ship.lore}</p><div class="grid grid-cols-3 gap-x-4 text-sm font-roboto-mono text-center pt-2"><div><span class="text-gray-500">Hull:</span> <span class="text-green-400">${ship.maxHealth}</span></div><div><span class="text-gray-500">Fuel:</span> <span class="text-sky-400">${ship.maxFuel}</span></div><div><span class="text-gray-500">Cargo:</span> <span class="text-amber-400">${ship.cargoCapacity}</span></div></div><button class="btn w-full mt-2" data-action="buy-ship" data-ship-id="${id}" ${!canAfford ? 'disabled' : ''}>Purchase</button></div>`;
            });
        } else {
            shipyardEl.innerHTML = '<p class="text-center text-gray-500">No new ships available at this location.</p>';
        }

        player.ownedShipIds.forEach(id => {
            const shipStatic = SHIPS[id];
            const shipDynamic = player.shipStates[id];
            const shipInventory = player.inventories[id];
            const cargoUsed = calculateInventoryUsed(shipInventory);

            const isActive = id === player.activeShipId;
            const canSell = player.ownedShipIds.length > 1 && !isActive;
            const salePrice = Math.floor(shipStatic.price * CONFIG.SHIP_SELL_MODIFIER);

            hangarEl.innerHTML += `<div class="ship-card p-4 flex flex-col space-y-3 ${isActive ? 'border-yellow-400' : ''}"><h3 class="text-xl font-orbitron ${isActive ? 'text-yellow-300' : 'text-cyan-300'} hanger-ship-name" data-tooltip="${shipStatic.lore}">${shipStatic.name}</h3><p class="text-sm text-gray-400 flex-grow">Class ${shipStatic.class}</p><div class="grid grid-cols-3 gap-x-4 text-sm font-roboto-mono text-center pt-2"><div><span class="text-gray-500">Hull:</span> <span class="text-green-400">${Math.floor(shipDynamic.health)}/${shipStatic.maxHealth}</span></div><div><span class="text-gray-500">Fuel:</span> <span class="text-sky-400">${Math.floor(shipDynamic.fuel)}/${shipStatic.maxFuel}</span></div><div><span class="text-gray-500">Cargo:</span> <span class="text-amber-400">${cargoUsed}/${shipStatic.cargoCapacity}</span></div></div><div class="grid grid-cols-2 gap-2 mt-2">${isActive ? '<button class="btn" disabled>ACTIVE</button>' : `<button class="btn" data-action="select-ship" data-ship-id="${id}">Select</button>`}<button class="btn" data-action="sell-ship" data-ship-id="${id}" ${!canSell ? 'disabled' : ''}>Sell (${formatCredits(salePrice, false)})</button></div></div>`;
        });
    }

    updateLiveStats(gameState) {
        if (!gameState || !gameState.player) return;
        const { player } = gameState;
        const ship = SHIPS[player.activeShipId];
        const shipState = player.shipStates[player.activeShipId];
        
        this.cache.shipFuel.textContent = `${Math.floor(shipState.fuel)}/${ship.maxFuel}`;
        this.cache.shipFuelBar.style.width = `${(shipState.fuel / ship.maxFuel) * 100}%`;
        document.getElementById('refuel-feedback-bar').style.width = `${(shipState.fuel / ship.maxFuel) * 100}%`;

        this.cache.shipHealth.textContent = `${Math.floor(shipState.health)}%`;
        document.getElementById('repair-feedback-bar').style.width = `${(shipState.health / ship.maxHealth) * 100}%`;
        
        this.cache.repairBtn.disabled = shipState.health >= ship.maxHealth;
        this.cache.refuelBtn.disabled = shipState.fuel >= ship.maxFuel;
        
        this.cache.servicesCreditMirror.innerHTML = `<span class="text-cyan-400">⌬ </span><span class="font-bold text-cyan-300 ml-auto">${formatCredits(player.credits, false)}</span>`;
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

        let stars = [];
        const numStars = 150;
        canvas.width = canvas.clientWidth;
        canvas.height = canvas.clientHeight;

        for (let i = 0; i < numStars; i++) {
            stars.push({
                x: Math.random() * canvas.width,
                y: Math.random() * canvas.height,
                radius: Math.random() * 1.5,
                speed: 0.2 + Math.random() * 0.8,
                alpha: 0.5 + Math.random() * 0.5
            });
        }

        const animationLoop = (currentTime) => {
            if (!startTime) startTime = currentTime;
            const elapsedTime = currentTime - startTime;
            let progress = Math.min(elapsedTime / duration, 1);

            progress = 1 - Math.pow(1 - progress, 3);

            canvas.width = canvas.clientWidth;
            canvas.height = canvas.clientHeight;
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            ctx.fillStyle = '#FFF';
            for (let i = 0; i < numStars; i++) {
                const star = stars[i];
                 if (progress < 1) {
                    star.x -= star.speed;
                    if (star.x < 0) star.x = canvas.width;
                }
                ctx.beginPath();
                ctx.arc(star.x, star.y, star.radius, 0, Math.PI * 2);
                ctx.globalAlpha = star.alpha;
                ctx.fill();
            }
            ctx.globalAlpha = 1.0;

            const padding = 60;
            const startX = padding;
            const endX = canvas.width - padding;
            const y = canvas.height / 2;

            ctx.font = '42px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(fromEmoji, startX, y);
            ctx.fillText(toEmoji, endX, y);

            const shipX = startX + (endX - startX) * progress;
            ctx.save();
            ctx.translate(shipX, y);
            ctx.font = '17px sans-serif';
            ctx.fillText(shipEmoji, 0, 0);
            ctx.restore();

            progressBar.style.width = `${progress * 100}%`;

            if (progress < 1) {
                animationFrameId = requestAnimationFrame(animationLoop);
            } else {
                statusText.textContent = `Arrived at ${to.name}`;
                arrivalLore.innerHTML = to.arrivalLore || "You have arrived.";

                infoText.innerHTML = `Time: ${travelInfo.time} Days | <span class="font-bold text-sky-300">Fuel: ${travelInfo.fuelCost}</span>`;
                hullDamageText.className = 'text-sm font-roboto-mono mt-1 font-bold text-green-300';
                hullDamageText.innerHTML = totalHullDamagePercent > 0.01 ? `Hull Integrity Decreased by ${totalHullDamagePercent.toFixed(2)}%` : '';

                arrivalLore.style.opacity = 1;
                progressContainer.classList.add('hidden');
                readoutContainer.classList.remove('hidden');
                confirmButton.classList.remove('hidden');

                setTimeout(() => {
                    readoutContainer.style.opacity = 1;
                    confirmButton.style.opacity = 1;
                }, 50);
            }
        }

        animationFrameId = requestAnimationFrame(animationLoop);

        confirmButton.onclick = () => {
            cancelAnimationFrame(animationFrameId);
            modal.classList.add('hidden');
            if (finalCallback) finalCallback();
        };
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

        const titleEl = modal.querySelector('#' + modalId.replace('-modal', '-title'));
        const descEl = modal.querySelector('#' + modalId.replace('-modal', '-description'));
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

        const btnContainer = modal.querySelector('#' + modalId.replace('-modal', '-button-container'));
        let button;

        if (btnContainer) {
            btnContainer.innerHTML = ''; // Clear previous buttons
            button = document.createElement('button');
            btnContainer.appendChild(button);
        } else {
            button = modal.querySelector('#' + modalId.replace('-modal', '-ok-button'));
        }
        
        if (button) {
            button.className = 'btn px-6 py-2';
            if (options.buttonClass) button.classList.add(options.buttonClass);
            button.innerHTML = options.buttonText || 'Understood';
            button.onclick = closeHandler;
        }

        modal.classList.remove('hidden');
        modal.classList.add('modal-visible');
    }

    showRandomEventModal(event, choicesCallback) {
        const modal = document.getElementById('random-event-modal');
        const titleEl = document.getElementById('random-event-title');
        const scenarioEl = document.getElementById('random-event-scenario');
        const choicesContainer = document.getElementById('random-event-choices-container');

        titleEl.innerHTML = event.title;
        scenarioEl.innerHTML = event.scenario;
        choicesContainer.innerHTML = '';

        event.choices.forEach((choice, index) => {
            const button = document.createElement('button');
            button.className = 'btn w-full text-left p-4 hover:bg-slate-700';
            button.innerHTML = choice.title;
            button.onclick = () => {
                this.hideModal('random-event-modal');
                choicesCallback(event.id, index);
            };
            choicesContainer.appendChild(button);
        });

        modal.classList.remove('hidden');
        modal.classList.add('modal-visible');
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
            button.onclick = () => {
                this.hideModal('age-event-modal');
                choiceCallback(choice);
            };
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
            }, { once: true });
        }
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

    showToast(toastId, message, duration = 3000) {
        const toast = this.cache[toastId];
        if (!toast) return;
        toast.textContent = message;
        toast.classList.remove('hidden');
        toast.style.opacity = '1';
        setTimeout(() => {
            toast.style.opacity = '0';
            setTimeout(() => toast.classList.add('hidden'), 300);
        }, duration);
    }
}