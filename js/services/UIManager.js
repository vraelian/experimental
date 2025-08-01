// js/services/UIManager.js
import { CONFIG } from '../data/config.js';
import { SHIPS, COMMODITIES, MARKETS, LOCATION_VISUALS, PERKS, TUTORIAL_DATA } from '../data/gamedata.js';
import { formatCredits, calculateInventoryUsed, getDateFromDay } from '../utils.js';

export class UIManager {
    constructor() {
        this.isMobile = window.innerWidth <= 768;
        this.modalQueue = [];
        this.activeGraphAnchor = null;
        this.activeGenericTooltipAnchor = null;
        this.activeTutorialHighlight = null;
        this.navStructure = {
            ship: { label: 'Ship', screens: { status: 'Status', navigation: 'Navigation', services: 'Services' } },
            starport: { label: 'Starport', screens: { market: 'Market', cargo: 'Cargo', hangar: 'Hangar' } },
            admin: { label: 'Admin', screens: { missions: 'Missions', finance: 'Finance', intel: 'Intel' } }
        };
        this._cacheDOM();

        window.addEventListener('resize', () => {
            const wasMobile = this.isMobile;
            this.isMobile = window.innerWidth <= 768;
            if (wasMobile !== this.isMobile) {
                // Force a full re-render if the mobile breakpoint is crossed
                this.render(this.lastKnownState);
            }
        });
    }

    _cacheDOM() {
        this.cache = {
            gameContainer: document.getElementById('game-container'),
            navBar: document.getElementById('nav-bar'),
            subNavBar: document.getElementById('sub-nav-bar'),
            stickyBar: document.getElementById('sticky-bar'),
            
            // Screen Containers
            statusScreen: document.getElementById('status-screen'),
            navigationScreen: document.getElementById('navigation-screen'),
            servicesScreen: document.getElementById('services-screen'),
            marketScreen: document.getElementById('market-screen'),
            cargoScreen: document.getElementById('cargo-screen'),
            hangarScreen: document.getElementById('hangar-screen'),
            missionsScreen: document.getElementById('missions-screen'),
            financeScreen: document.getElementById('finance-screen'),
            intelScreen: document.getElementById('intel-screen'),
            
            // Modals and Toasts
            saveToast: document.getElementById('save-toast'),
            garnishmentToast: document.getElementById('garnishment-toast'),
            hullWarningToast: document.getElementById('hull-warning-toast'),
            debugToast: document.getElementById('debug-toast'),
            starportUnlockTooltip: document.getElementById('starport-unlock-tooltip'),
            graphTooltip: document.getElementById('graph-tooltip'),
            genericTooltip: document.getElementById('generic-tooltip'),

            // Tutorial System Elements
            tutorialToastContainer: document.getElementById('tutorial-toast-container'),
            tutorialToastText: document.getElementById('tutorial-toast-text'),
            tutorialToastSkipBtn: document.getElementById('tutorial-toast-skip-btn'),
            tutorialToastNextBtn: document.getElementById('tutorial-toast-next-btn'),
            skipTutorialModal: document.getElementById('skip-tutorial-modal'),
            skipTutorialConfirmBtn: document.getElementById('skip-tutorial-confirm-btn'),
            skipTutorialCancelBtn: document.getElementById('skip-tutorial-cancel-btn'),
            tutorialLogModal: document.getElementById('tutorial-log-modal'),
            tutorialLogList: document.getElementById('tutorial-log-list'),
        };
    }

    render(gameState) {
        if (!gameState || !gameState.player) return;
        this.lastKnownState = gameState; // Keep track of the state for re-renders
        
        const location = MARKETS.find(l => l.id === gameState.currentLocationId);
        if (location) {
            this.cache.gameContainer.className = `game-container p-4 md:p-8 ${location.bg}`;
        }
        
        this.renderNavigation(gameState);
        this.renderActiveScreen(gameState);
        this.renderStickyBar(gameState);
    }

    renderNavigation(gameState) {
        const { activeNav, activeScreen } = gameState;

        // Main Nav Bar
        const navButtons = Object.entries(this.navStructure).map(([navId, navData]) => {
            const isActive = navId === activeNav;
            const screenId = Object.keys(navData.screens)[0]; // Default to the first screen in the category
            return `
                <button class="btn btn-header ${isActive ? 'btn-nav-active' : ''}" 
                        data-action="set-screen" data-nav-id="${navId}" data-screen-id="${screenId}">
                    ${navData.label}
                </button>`;
        }).join('');
        this.cache.navBar.innerHTML = `<div class="flex justify-around w-full gap-2 md:gap-4">${navButtons}</div>`;

        // Sub Nav Bar
        const activeSubNav = this.navStructure[activeNav]?.screens || {};
        const subNavButtons = Object.entries(activeSubNav).map(([screenId, screenLabel]) => {
            const isActive = screenId === activeScreen;
            return `
                <button class="btn ${isActive ? 'btn-header-active' : ''}"
                        data-action="set-screen" data-nav-id="${activeNav}" data-screen-id="${screenId}">
                    ${screenLabel}
                </button>`;
        }).join('');
        this.cache.subNavBar.innerHTML = `<div class="flex justify-center w-full gap-2 md:gap-4 mt-3">${subNavButtons}</div>`;
    }

    renderActiveScreen(gameState) {
        // Hide all screens
        document.querySelectorAll('.screen').forEach(s => s.style.display = 'none');

        // Show the active one
        const activeScreenEl = document.getElementById(`${gameState.activeScreen}-screen`);
        if (activeScreenEl) {
            activeScreenEl.style.display = 'block';
        }

        // Call the specific renderer for the active screen
        switch (gameState.activeScreen) {
            case 'status': this.renderStatusScreen(gameState); break;
            case 'navigation': this.renderNavigationScreen(gameState); break;
            case 'services': this.renderServicesScreen(gameState); break;
            case 'market': this.renderMarketScreen(gameState); break;
            case 'cargo': this.renderCargoScreen(gameState); break;
            case 'hangar': this.renderHangarScreen(gameState); break;
            case 'missions': this.renderMissionsScreen(gameState); break;
            case 'finance': this.renderFinanceScreen(gameState); break;
            case 'intel': this.renderIntelScreen(gameState); break;
        }
    }

    renderStickyBar(gameState) {
        const { activeScreen, player } = gameState;
        this.cache.stickyBar.innerHTML = ''; // Clear it first
        const shipState = player.shipStates[player.activeShipId];
        const shipStatic = SHIPS[player.activeShipId];

        switch(activeScreen) {
            case 'navigation':
                const fuelPct = (shipState.fuel / shipStatic.maxFuel) * 100;
                this.cache.stickyBar.innerHTML = `
                    <div class="ship-hud p-2 mb-4">
                        <div class="flex items-center justify-between text-sm">
                             <div class="flex items-center space-x-2">
                                <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-sky-400" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clip-rule="evenodd" /></svg>
                                <span class="text-gray-400">Fuel:</span>
                            </div>
                            <span class="font-bold text-sky-300">${Math.floor(shipState.fuel)}/${shipStatic.maxFuel}</span>
                        </div>
                        <div class="mt-1">
                            <div class="hud-stat-bar"><div style="width: ${fuelPct}%" class="bg-sky-400"></div></div>
                        </div>
                    </div>
                `;
                break;
            case 'market':
            case 'cargo':
                const cargoUsed = calculateInventoryUsed(player.inventories[player.activeShipId]);
                this.cache.stickyBar.innerHTML = `
                     <div class="ship-hud p-2 mb-4 text-center">
                        <div class="flex justify-around items-center text-lg font-roboto-mono">
                            <span>${formatCredits(player.credits)}</span>
                            <span class="text-gray-500">|</span>
                            <span>Cargo: ${cargoUsed}/${shipStatic.cargoCapacity}</span>
                        </div>
                     </div>
                `;
                break;
        }
    }
    
    // --- Screen Renderers ---

    renderStatusScreen(gameState) {
        const { player, day } = gameState;
        const shipStatic = SHIPS[player.activeShipId];
        const shipState = player.shipStates[player.activeShipId];
        const inventory = player.inventories[player.activeShipId];
        const cargoUsed = calculateInventoryUsed(inventory);

        this.cache.statusScreen.innerHTML = `
            <div class="grid grid-cols-1 md:grid-cols-3 gap-4 bg-black/30 p-4 rounded-lg mb-6 items-start">
                <div class="md:col-span-2 h-full p-4 rounded-lg flex items-center justify-between transition-all duration-500 panel-border border border-slate-700">
                    <div class="text-left pl-4">
                        <span class="block text-lg text-gray-400 uppercase tracking-widest">Day</span>
                        <span class="text-8xl font-bold font-orbitron">${day}</span>
                    </div>
                    <div class="text-right flex flex-col items-end">
                        <p class="text-xs text-cyan-200/80 mb-2 font-roboto-mono text-right">${getDateFromDay(day)}</p>
                        <div class="mt-2 pt-2 border-t border-slate-500/50">
                            <div class="text-right">
                                <p class="text-gray-400 text-sm tracking-wider">Vessel</p>
                                <p>${shipStatic.name}</p>
                                <p>Class: ${shipStatic.class}</p>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="md:col-span-1 flex flex-col gap-4">
                    <div class="ship-hud">
                        <h4 class="font-orbitron text-xl text-center mb-3 text-cyan-300">Ship Status</h4>
                        <div class="flex flex-col gap-y-2 text-sm">
                            <div class="tooltip-container" data-tooltip="Ship integrity. Damaged by travel.">
                                <div class="flex items-center justify-between">
                                    <div class="flex items-center space-x-2">
                                        <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-green-400" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd" /></svg>
                                        <span class="text-gray-400">Hull:</span>
                                    </div>
                                    <span class="font-bold text-green-300">${Math.floor(shipState.health)}%</span>
                                </div>
                            </div>
                            <div class="tooltip-container" data-tooltip="Active ship's current/max cargo space.">
                                <div class="flex items-center justify-between">
                                    <div class="flex items-center space-x-2">
                                        <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-amber-400" viewBox="0 0 20 20" fill="currentColor"><path d="M5 8a1 1 0 011-1h8a1 1 0 110 2H6a1 1 0 01-1-1zm1 3a1 1 0 000 2h6a1 1 0 100-2H6z" /><path fill-rule="evenodd" d="M2 5a2 2 0 012-2h12a2 2 0 012 2v10a2 2 0 01-2-2H4a2 2 0 01-2-2V5zm2-1a1 1 0 00-1 1v10a1 1 0 001 1h12a1 1 0 001-1V5a1 1 0 00-1-1H4z" clip-rule="evenodd" /></svg>
                                        <span class="text-gray-400">Cargo:</span>
                                    </div>
                                    <span class="font-bold text-amber-300">${cargoUsed}/${shipStatic.cargoCapacity}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div class="text-center text-lg text-cyan-200 font-orbitron flex items-center justify-center gap-2">
                        <span>${player.playerTitle} ${player.name}, ${player.playerAge}</span>
                    </div>
                </div>
            </div>`;
    }

    renderNavigationScreen(gameState) {
        const { player, currentLocationId, TRAVEL_DATA } = gameState;
        const location = MARKETS.find(m => m.id === currentLocationId);
        this.cache.navigationScreen.innerHTML = `
            <div class="text-center mb-4">
                 <h3 class="text-3xl font-orbitron">${location.name}</h3>
                 <p class="text-lg text-gray-400">${location.description}</p>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-6">
            ${MARKETS
                .filter(loc => player.unlockedLocationIds.includes(loc.id))
                .map(location => {
                    const isCurrent = location.id === currentLocationId;
                    const travelInfo = isCurrent ? null : TRAVEL_DATA[currentLocationId][location.id];
                    return `<div class="location-card p-6 rounded-lg text-center flex flex-col ${isCurrent ? 'highlight-current' : ''} ${location.color} ${location.bg}" data-action="travel" data-location-id="${location.id}">
                        <h3 class="text-2xl font-orbitron">${location.name}</h3>
                        <p class="text-gray-300 mt-2 flex-grow">${location.description}</p>
                        <div class="location-card-footer mt-auto pt-3 border-t border-cyan-100/10">
                        ${isCurrent 
                            ? '<p class="text-yellow-300 font-bold mt-2">(Currently Docked)</p>' 
                            : `<div class="flex justify-around items-center text-center">
                                   <div class="flex items-center space-x-2">
                                       <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-gray-400" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-13a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V5z" clip-rule="evenodd" /></svg>
                                       <div><span class="font-bold font-roboto-mono text-lg">${travelInfo.time}</span><span class="block text-xs text-gray-400">Days</span></div>
                                   </div>
                                   <div class="flex items-center space-x-2">
                                       <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-sky-400" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clip-rule="evenodd" /></svg>
                                       <div><span class="font-bold font-roboto-mono text-lg">${travelInfo.fuelCost}</span><span class="block text-xs text-gray-400">Fuel</span></div>
                                   </div>
                               </div>`
                        }
                        </div>
                    </div>`;
                }).join('')
            }
            </div>`;
    }

    renderServicesScreen(gameState) {
        const { player, currentLocationId } = gameState;
        const shipStatic = SHIPS[player.activeShipId];
        const shipState = player.shipStates[player.activeShipId];
        const currentMarket = MARKETS.find(m => m.id === currentLocationId);

        let fuelPrice = currentMarket.fuelPrice / 4;
        if (player.activePerks.venetian_syndicate && currentLocationId === 'loc_venus') {
            fuelPrice *= (1 - PERKS.venetian_syndicate.fuelDiscount);
        }
        
        let costPerRepairTick = (shipStatic.maxHealth * (CONFIG.REPAIR_AMOUNT_PER_TICK / 100)) * CONFIG.REPAIR_COST_PER_HP;
        if (player.activePerks.venetian_syndicate && currentLocationId === 'loc_venus') {
            costPerRepairTick *= (1 - PERKS.venetian_syndicate.repairDiscount);
        }

        const fuelPct = (shipState.fuel / shipStatic.maxFuel) * 100;
        const healthPct = (shipState.health / shipStatic.maxHealth) * 100;
        
        this.cache.servicesScreen.innerHTML = `
             <div class="text-center mb-4">
                <h3 class="text-2xl font-orbitron">Station Services at ${currentMarket.name}</h3>
                <div class="text-lg text-cyan-300 mt-2"><span class="text-cyan-400">⌬ </span><span class="font-bold text-cyan-300 ml-auto">${formatCredits(player.credits, false)}</span></div>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto">
                <div class="bg-black/20 p-4 rounded-lg text-center shadow-lg panel-border border border-slate-700">
                    <h4 class="font-orbitron text-xl mb-2">Refueling</h4>
                    <p class="mb-3">Price: <span class="font-bold text-cyan-300">${formatCredits(fuelPrice, false)}</span> / 2.5 units</p>
                    <button id="refuel-btn" class="btn btn-green w-full py-3" ${shipState.fuel >= shipStatic.maxFuel ? 'disabled' : ''}>Hold to Refuel</button>
                    <div class="w-full hud-stat-bar mt-2"><div style="width: ${fuelPct}%" class="bg-sky-400"></div></div>
                </div>
                <div class="bg-black/20 p-4 rounded-lg text-center shadow-lg panel-border border border-slate-700">
                    <h4 class="font-orbitron text-xl mb-2">Ship Maintenance</h4>
                    <p class="mb-3">Price: <span class="font-bold text-cyan-300">${formatCredits(costPerRepairTick, false)}</span> / 10% repair</p>
                    <button id="repair-btn" class="btn btn-blue w-full py-3" ${shipState.health >= shipStatic.maxHealth ? 'disabled' : ''}>Hold to Repair</button>
                    <div class="w-full hud-stat-bar mt-2"><div style="width: ${healthPct}%" class="bg-green-400"></div></div>
                </div>
            </div>`;
    }

    renderMarketScreen(gameState) {
        const availableCommodities = COMMODITIES.filter(c => c.unlockLevel <= gameState.player.unlockedCommodityLevel);
        const marketHtml = availableCommodities.map(good => {
            return this.isMobile ? this._getMarketItemHtmlMobile(good, gameState) : this._getMarketItemHtmlDesktop(good, gameState);
        }).join('');
        this.cache.marketScreen.innerHTML = `<div class="grid grid-cols-1 lg:grid-cols-2 gap-4">${marketHtml}</div>`;
    }

    renderCargoScreen(gameState) {
        const inventory = gameState.player.inventories[gameState.player.activeShipId];
        const ownedGoods = Object.entries(inventory).filter(([, item]) => item.quantity > 0);
        
        let content;
        if (ownedGoods.length > 0) {
            content = `<div class="flex justify-center flex-wrap gap-4">
                ${ownedGoods.map(([goodId, item]) => {
                    const good = COMMODITIES.find(c => c.id === goodId);
                    const tooltipText = `${good.lore}\n\nAvg. Cost: ${formatCredits(item.avgCost, false)}`;
                    return `<div class="p-2 rounded-lg border-2 ${good.styleClass} cargo-item-tooltip" style="filter: drop-shadow(0 4px 3px rgba(0, 0, 0, 0.4));" data-tooltip="${tooltipText}"><div class="font-semibold text-sm commodity-name text-outline">${good.name}</div><div class="text-lg text-center text-cyan-300 text-outline">(${item.quantity})</div></div>`;
                }).join('')}
            </div>`;
        } else {
            content = '<p class="text-center text-gray-500 text-lg">Your cargo hold is empty.</p>';
        }

        this.cache.cargoScreen.innerHTML = `
            <div class="mt-8 pt-6">
                <h3 class="text-2xl font-orbitron text-center mb-4">Active Ship Cargo Manifest</h3>
                ${content}
            </div>`;
    }

    renderHangarScreen(gameState) {
        const { player, currentLocationId } = gameState;
        
        // Shipyard Content
        const commonShips = Object.entries(SHIPS).filter(([id, ship]) => !ship.isRare && ship.saleLocationId === currentLocationId && !player.ownedShipIds.includes(id));
        const rareShips = Object.entries(SHIPS).filter(([id, ship]) => ship.isRare && ship.saleLocationId === currentLocationId && !player.ownedShipIds.includes(id));
        const shipsForSale = [...commonShips];
        rareShips.forEach(shipEntry => { if (Math.random() < CONFIG.RARE_SHIP_CHANCE) shipsForSale.push(shipEntry); });

        let shipyardHtml;
        if (shipsForSale.length > 0) {
            shipyardHtml = shipsForSale.map(([id, ship]) => {
                const canAfford = player.credits >= ship.price;
                return `<div class="ship-card p-4 flex flex-col space-y-3"><div class="flex justify-between items-start"><div><h3 class="text-xl font-orbitron text-cyan-300">${ship.name}</h3><p class="text-sm text-gray-400">Class ${ship.class}</p></div><div class="text-right"><p class="text-lg font-bold text-cyan-300">${formatCredits(ship.price)}</p></div></div><p class="text-sm text-gray-400 flex-grow">${ship.lore}</p><div class="grid grid-cols-3 gap-x-4 text-sm font-roboto-mono text-center pt-2"><div><span class="text-gray-500">Hull:</span> <span class="text-green-400">${ship.maxHealth}</span></div><div><span class="text-gray-500">Fuel:</span> <span class="text-sky-400">${ship.maxFuel}</span></div><div><span class="text-gray-500">Cargo:</span> <span class="text-amber-400">${ship.cargoCapacity}</span></div></div><button class="btn w-full mt-2" data-action="buy-ship" data-ship-id="${id}" ${!canAfford ? 'disabled' : ''}>Purchase</button></div>`;
            }).join('');
        } else {
            shipyardHtml = '<p class="text-center text-gray-500">No new ships available at this location.</p>';
        }

        // Hangar Content
        const hangarHtml = player.ownedShipIds.map(id => {
            const shipStatic = SHIPS[id];
            const shipDynamic = player.shipStates[id];
            const shipInventory = player.inventories[id];
            const cargoUsed = calculateInventoryUsed(shipInventory);
            const isActive = id === player.activeShipId;
            const canSell = player.ownedShipIds.length > 1 && !isActive;
            const salePrice = Math.floor(shipStatic.price * CONFIG.SHIP_SELL_MODIFIER);
            return `<div class="ship-card p-4 flex flex-col space-y-3 ${isActive ? 'border-yellow-400' : ''}"><h3 class="text-xl font-orbitron ${isActive ? 'text-yellow-300' : 'text-cyan-300'} hanger-ship-name" data-tooltip="${shipStatic.lore}">${shipStatic.name}</h3><p class="text-sm text-gray-400 flex-grow">Class ${shipStatic.class}</p><div class="grid grid-cols-3 gap-x-4 text-sm font-roboto-mono text-center pt-2"><div><span class="text-gray-500">Hull:</span> <span class="text-green-400">${Math.floor(shipDynamic.health)}/${shipStatic.maxHealth}</span></div><div><span class="text-gray-500">Fuel:</span> <span class="text-sky-400">${Math.floor(shipDynamic.fuel)}/${shipStatic.maxFuel}</span></div><div><span class="text-gray-500">Cargo:</span> <span class="text-amber-400">${cargoUsed}/${shipStatic.cargoCapacity}</span></div></div><div class="grid grid-cols-2 gap-2 mt-2">${isActive ? '<button class="btn" disabled>ACTIVE</button>' : `<button class="btn" data-action="select-ship" data-ship-id="${id}">Select</button>`}<button class="btn" data-action="sell-ship" data-ship-id="${id}" ${!canSell ? 'disabled' : ''}>Sell (${formatCredits(salePrice, false)})</button></div></div>`;
        }).join('');

        // Final Assembly
        this.cache.hangarScreen.innerHTML = `
            <div class="grid grid-cols-1 lg:grid-cols-2 gap-x-8 relative">
                <div id="starport-shipyard-panel">
                    <h2 class="text-3xl font-orbitron text-cyan-300 mb-4 text-center">Shipyard</h2>
                    <div class="starport-panel space-y-4">${shipyardHtml}</div>
                </div>
                <div class="w-full my-4 border-t-2 border-slate-600 lg:hidden"></div>
                <div class="absolute left-1/2 top-0 h-full w-px bg-slate-600 hidden lg:block"></div>
                <div id="starport-hangar-panel">
                    <h2 class="text-3xl font-orbitron text-cyan-300 mb-4 text-center">Hangar</h2>
                    <div class="starport-panel space-y-4">${hangarHtml}</div>
                </div>
            </div>`;
    }

    renderMissionsScreen(gameState) {
        this.cache.missionsScreen.innerHTML = `
            <div class="text-center p-8">
                <h2 class="text-3xl font-orbitron text-cyan-300 mb-4">Missions</h2>
                <p class="text-lg text-gray-500">Feature coming soon.</p>
            </div>
        `;
    }

    renderFinanceScreen(gameState) {
        const { player, day } = gameState;

        // Loan Interface
        let loanHtml;
        if (player.debt > 0) {
            let garnishmentTimerHtml = '';
            if (player.loanStartDate) {
                const daysRemaining = CONFIG.LOAN_GARNISHMENT_DAYS - (day - player.loanStartDate);
                if (daysRemaining > 0) {
                    garnishmentTimerHtml = `<p class="text-xs text-red-400/70 mt-2">Garnishment in ${daysRemaining} days</p>`;
                }
            }
            loanHtml = `
               <h4 class="font-orbitron text-xl mb-2">Debt</h4>
               <p class="text-2xl font-bold font-roboto-mono text-red-400 mb-2">${formatCredits(player.debt, false)}</p>
               <button data-action="pay-debt" class="btn w-full py-3 bg-red-800/80 hover:bg-red-700/80 border-red-500" ${player.credits >= player.debt ? '' : 'disabled'}>
                   Pay Off Full Amount
               </button>
               ${garnishmentTimerHtml}`;
        } else {
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
            loanHtml = `<h4 class="font-orbitron text-xl mb-2">Financing</h4><div class="flex justify-center gap-4 w-full">${loanButtonsHtml}</div>`;
        }

        // Transaction Log
        const logEntries = [...player.financeLog].reverse().map(entry => {
            const amountColor = entry.amount > 0 ? 'text-green-400' : 'text-red-400';
            const sign = entry.amount > 0 ? '+' : '';
            return `
                <div class="grid grid-cols-4 gap-2 p-2 border-b border-slate-700 text-sm">
                    <span class="text-gray-400">${entry.day}</span>
                    <span class="col-span-2">${entry.description}</span>
                    <span class="${amountColor} text-right">${sign}${formatCredits(entry.amount, false)}</span>
                </div>
            `;
        }).join('');

        this.cache.financeScreen.innerHTML = `
            <div class="grid grid-cols-1 md:grid-cols-3 gap-8">
                <div class="md:col-span-1 bg-black/20 p-4 rounded-lg flex flex-col items-center justify-center space-y-2 shadow-lg panel-border border border-slate-700 text-center">
                    ${loanHtml}
                </div>
                <div class="md:col-span-2">
                     <h3 class="text-2xl font-orbitron text-center mb-4">Transaction Log</h3>
                     <div class="bg-black/20 p-4 rounded-lg shadow-lg panel-border border border-slate-700 h-96 overflow-y-auto">
                        <div class="grid grid-cols-4 gap-2 p-2 border-b-2 border-slate-500 font-bold text-gray-300">
                           <span>Day</span>
                           <span class="col-span-2">Description</span>
                           <span class="text-right">Amount</span>
                        </div>
                        ${logEntries || '<p class="text-center text-gray-500 p-4">No transactions recorded.</p>'}
                     </div>
                </div>
            </div>
        `;
    }

    renderIntelScreen(gameState) {
        this.cache.intelScreen.innerHTML = `
            <div class="text-center p-8 flex flex-col items-center gap-4">
                 <div id="tutorial-button-container" class="tutorial-container relative">
                    <button class="btn btn-header">Tutorial Log</button>
                    <div id="tutorial-log-modal" class="tutorial-tooltip">
                        <h3 id="tutorial-log-title" class="text-2xl font-orbitron mb-4 text-center">Tutorial Log</h3>
                        <ul id="tutorial-log-list" class="space-y-2"></ul>
                    </div>
                </div>
                 <div id="lore-button-container" class="lore-container relative">
                    <button class="btn btn-header">Story So Far...</button>
                    <div class="lore-tooltip">
                        <p>The year 2140 is the result of a single, massive corporate takeover. A century ago, the "Ad Astra Initiative" released advanced technology to all of humanity, a gift from the new Human-AI Alliance on Earth designed to kickstart our expansion into the stars. It was a promise of a new beginning, an open-source key to the solar system, ensuring the survival of all Earth life, both organic and synthetic.</p><br><p>But a gift to everyone is a business opportunity for the few. The hyper-corporations, already positioned in space, immediately patented the most efficient manufacturing processes and proprietary components for this new technology. This maneuver ensured that while anyone could build a Folded-Space Drive, only the corporations could supply the high-performance parts needed to make it truly effective, creating a system-wide technological dependency that persists to this day. This technological monopoly created the "Drive-Divide," the central pillar of the new class system. Nearly all ships run on older, less efficient hardware. Very few ships employ these coveted Folded-Space Drives.</p><br><p>The major hubs beyond Earth are sovereign, corporate-run territories where law is policy and your rights are listed in an employment contract. These scattered colonies are fierce rivals, engaged in constant economic warfare, all propped up by the interstellar supply lines maintained by the Merchant's Guild. For them, you are just another cog in the great machine of commerce.</p><br><p>In a system owned by corporations, possessing your own ship is the only true form of freedom. Every credit earned, every successful trade, is a bet on your own skill and a step toward true sovereignty on the razor's edge of a cargo manifest.</p>
                    </div>
                </div>
            </div>`;
    }


    // --- Helper functions for Market Screen ---

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
                        <div class="flex items-center gap-2">${marketIndicatorHtml}${plIndicatorHtml}</div>
                    </div>
                </div>
                <div class="flex items-center space-x-2">
                    <div class="flex flex-col items-center"><div class="flex flex-col space-y-1">
                        <button class="btn item-btn" data-action="buy" data-good-id="${good.id}" ${buyDisabled}>Buy</button>
                        <button class="btn btn-sm item-btn" data-action="set-max-buy" data-good-id="${good.id}" ${buyDisabled}>Max</button>
                    </div></div>
                    <div class="flex flex-col items-center">
                        <button class="qty-btn" data-action="increment" data-good-id="${good.id}">+</button>
                        <input type="number" class="qty-input p-2 my-1" id="qty-${good.id}" data-good-id="${good.id}" value="1" min="1">
                        <button class="qty-btn" data-action="decrement" data-good-id="${good.id}">-</button>
                    </div>
                    <div class="flex flex-col items-center"><div class="flex flex-col space-y-1">
                        <button class="btn item-btn" data-action="sell" data-good-id="${good.id}">Sell</button>
                        <button class="btn btn-sm item-btn" data-action="set-max-sell" data-good-id="${good.id}">Max</button>
                    </div></div>
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
        const { marketIndicatorHtml } = this._getIndicatorHtml(price, sellPrice, galacticAvg, playerItem, true);
        return `
        <div class="item-card-container">
            <div class="bg-black/20 p-4 rounded-lg flex flex-col border ${good.styleClass} shadow-md">
                <div class="flex justify-between items-start w-full mb-2">
                    <div class="flex-grow">
                        <p class="font-bold commodity-name text-outline commodity-name-tooltip" ${nameTooltip}>${good.name}${playerInvDisplay}</p>
                        <p class="font-roboto-mono text-xl font-bold text-left pt-2 price-text text-outline flex items-center">${formatCredits(price)}</p>
                    </div>
                    <div class="text-right text-sm flex-shrink-0 ml-2 text-outline">Avail: ${marketStock.quantity} ${graphIcon}</div>
                </div>
                ${marketIndicatorHtml}
                <div class="flex justify-end items-end mt-2">
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
        let marketArrowSVG = this._getArrowSvg(marketPct > 15 ? 'up' : marketPct < -15 ? 'down' : 'neutral');

        if (isMobile) {
            let mobileHtml = `<div class="mobile-indicator-wrapper text-sm text-outline">`;
            mobileHtml += `<div class="flex items-center ${marketColor}"><span>MKT: ${marketSign}${marketPct}%</span> ${marketArrowSVG}</div>`;
            
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
        const path = {
            up: 'M4 12l1.41 1.41L11 7.83V20h2V7.83l5.58 5.59L20 12l-8-8-8 8z',
            down: 'M20 12l-1.41-1.41L13 16.17V4h-2v12.17l-5.58-5.59L4 12l8 8 8-8z',
            neutral: 'M5 12h14'
        };
        const fill = direction === 'neutral' ? 'none' : 'currentColor';
        const stroke = direction === 'neutral' ? 'currentColor' : 'none';
        const strokeWidth = direction === 'neutral' ? '3' : '0';
        return `<svg class="indicator-arrow" viewBox="0 0 24 24" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"><path d="${path[direction]}"/></svg>`;
    }

    getItemPrice(gameState, goodId, isSelling = false) {
        let price = gameState.market.prices[gameState.currentLocationId][goodId];
        const market = MARKETS.find(m => m.id === gameState.currentLocationId);
        if (isSelling && market.specialDemand && market.specialDemand[goodId]) {
            price *= market.specialDemand[goodId].bonus;
        }
        const intel = gameState.intel.active;
        if (intel && intel.targetMarketId === gameState.currentLocationId && intel.commodityId === goodId) {
            price *= (intel.type === 'demand') ? CONFIG.INTEL_DEMAND_MOD : CONFIG.INTEL_DEPRESSION_MOD;
        }
        return Math.max(1, Math.round(price));
    }

    // --- Utility & Modal Methods (largely unchanged, but grouped here) ---

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
            stars.push({ x: Math.random() * canvas.width, y: Math.random() * canvas.height, radius: Math.random() * 1.5, speed: 0.2 + Math.random() * 0.8, alpha: 0.5 + Math.random() * 0.5 });
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
                infoText.innerHTML = `
                    <div class="text-center ${this.isMobile ? 'travel-info-mobile' : ''}">
                        <div>Journey Time: ${travelInfo.time} Days</div>
                        <div><span class="font-bold text-sky-300">Fuel Expended: ${travelInfo.fuelCost}</span></div>
                    </div>`;
                hullDamageText.className = 'text-sm font-roboto-mono mt-1 font-bold text-red-400';
                if (totalHullDamagePercent > 0.01) {
                    hullDamageText.innerHTML = `Hull Integrity -${totalHullDamagePercent.toFixed(2)}%`;
                    if (this.isMobile) {
                        infoText.querySelector('div').appendChild(hullDamageText);
                    }
                } else {
                    hullDamageText.innerHTML = '';
                }
                
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
        if (!modal) {
            console.error(`Modal with ID ${modalId} not found.`);
            return this.processModalQueue();
        }

        const titleEl = modal.querySelector('#' + modalId.replace('-modal', '-title'));
        const descEl = modal.querySelector('#' + modalId.replace('-modal', '-description')) || modal.querySelector('#' + modalId.replace('-modal', '-scenario'));
        
        if(titleEl) titleEl.innerHTML = title;
        if(descEl) descEl.innerHTML = description;

        const closeHandler = () => {
            this.hideModal(modalId);
            if (callback) callback();
            this.processModalQueue();
        };

        if (options.customSetup) {
            options.customSetup(modal, closeHandler);
        } else {
            const btnContainer = modal.querySelector('#' + modalId.replace('-modal', '-button-container'));
            let button;
            if (btnContainer) {
                btnContainer.innerHTML = '';
                button = document.createElement('button');
                btnContainer.appendChild(button);
            } else {
                 button = modal.querySelector('button');
            }
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
                    button.className = 'btn w-full text-left p-4 hover:bg-slate-700';
                    button.innerHTML = choice.title;
                    button.onclick = () => {
                        choicesCallback(event.id, index);
                        closeHandler();
                    };
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
    
    showGraph(anchorEl, gameState) {
        this.activeGraphAnchor = anchorEl;
        const tooltip = this.cache.graphTooltip;
        const action = anchorEl.dataset.action;

        if (action === 'show-price-graph') {
            const goodId = anchorEl.dataset.goodId;
            const playerItem = gameState.player.inventories[gameState.player.activeShipId][goodId];
            tooltip.innerHTML = this._renderPriceGraph(goodId, gameState, playerItem);
        } else if (action === 'show-finance-graph') {
            tooltip.innerHTML = this._renderFinanceGraph(gameState);
        }
        
        tooltip.style.display = 'block';
        this.updateGraphTooltipPosition();
    }

    hideGraph() {
        if (this.activeGraphAnchor) {
            this.cache.graphTooltip.style.display = 'none';
            this.activeGraphAnchor = null;
        }
    }
    
    updateGraphTooltipPosition() {
        if (!this.activeGraphAnchor) return;
        const tooltip = this.cache.graphTooltip;
        if (tooltip.style.display === 'none') return;
        
        const rect = this.activeGraphAnchor.getBoundingClientRect();
        const tooltipWidth = tooltip.offsetWidth;
        const tooltipHeight = tooltip.offsetHeight;
        let leftPos, topPos;
        
        if (this.isMobile) {
            leftPos = (window.innerWidth / 2) - (tooltipWidth / 2);
            topPos = rect.top - tooltipHeight - 10;
             if (topPos < 10) {
                topPos = rect.bottom + 10;
            }
        } else {
            if (this.activeGraphAnchor.dataset.action === 'show-finance-graph') {
                leftPos = rect.left - tooltipWidth - 10;
                topPos = rect.top + (rect.height / 2) - (tooltipHeight / 2);
            } else {
                leftPos = rect.left + (rect.width / 2) - (tooltipWidth / 2);
                topPos = rect.bottom + 5;
            }
        }
        
        if (leftPos < 10) leftPos = 10;
        if (leftPos + tooltipWidth > window.innerWidth) leftPos = window.innerWidth - tooltipWidth - 10;
        if (topPos < 10) topPos = 10;
        if (topPos + tooltipHeight > window.innerHeight) topPos = rect.top - tooltipHeight - 5;
        
        tooltip.style.left = `${leftPos}px`;
        tooltip.style.top = `${topPos}px`;
    }

    showGenericTooltip(anchorEl, content) {
        this.activeGenericTooltipAnchor = anchorEl;
        const tooltip = this.cache.genericTooltip;
        tooltip.innerHTML = content;
        tooltip.style.display = 'block';
        this.updateGenericTooltipPosition();
    }

    hideGenericTooltip() {
        if (this.activeGenericTooltipAnchor) {
            this.cache.genericTooltip.style.display = 'none';
            this.activeGenericTooltipAnchor = null;
        }
    }

    updateGenericTooltipPosition() {
        if (!this.activeGenericTooltipAnchor) return;
        const tooltip = this.cache.genericTooltip;
        const rect = this.activeGenericTooltipAnchor.getBoundingClientRect();
        const tooltipWidth = tooltip.offsetWidth;
        const tooltipHeight = tooltip.offsetHeight;

        let leftPos = (window.innerWidth / 2) - (tooltipWidth / 2); // Center horizontally on mobile
        let topPos = rect.top - tooltipHeight - 10; // Position above by default

        if (topPos < 10) { // If it's off the top, move it below
            topPos = rect.bottom + 10;
        }
        if (leftPos < 10) { // Ensure it's not off the left edge
            leftPos = 10;
        }
        if (leftPos + tooltipWidth > window.innerWidth) { // Ensure it's not off the right edge
            leftPos = window.innerWidth - tooltipWidth - 10;
        }

        tooltip.style.left = `${leftPos}px`;
        tooltip.style.top = `${topPos}px`;
    }

    _renderPriceGraph(goodId, gameState, playerItem) {
        const history = gameState.market.priceHistory[gameState.currentLocationId]?.[goodId];
        if (!history || history.length < 2) return `<div class="text-gray-400 text-sm p-4">Check back next week!!</div>`;
        const good = COMMODITIES.find(c => c.id === goodId);
        const staticAvg = (good.basePriceRange[0] + good.basePriceRange[1]) / 2;
        const width = 280, height = 140, padding = 35;
        const prices = history.map(p => p.price);
        const playerBuyPrice = playerItem?.avgCost > 0 ? playerItem.avgCost : null;
        let allValues = [...prices, staticAvg];
        if (playerBuyPrice) allValues.push(playerBuyPrice);
        const minVal = Math.min(...allValues), maxVal = Math.max(...allValues);
        const valueRange = maxVal - minVal > 0 ? maxVal - minVal : 1;
        const getX = i => (i / (history.length - 1)) * (width - padding * 2) + padding;
        const getY = v => height - padding - ((v - minVal) / valueRange) * (height - padding * 2.5);
        const pricePoints = prices.map((p, i) => `${getX(i)},${getY(p)}`).join(' ');
        const buyPriceY = playerBuyPrice ? getY(playerBuyPrice) : null;
        const staticAvgY = getY(staticAvg);
        let svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#0c101d" />`;
        svg += `<line x1="${padding}" y1="${staticAvgY}" x2="${width - padding}" y2="${staticAvgY}" stroke="#facc15" stroke-width="1.5" stroke-dasharray="4 2" /><text x="${width - padding + 2}" y="${staticAvgY + 4}" fill="#facc15" font-size="10" font-family="Roboto Mono" text-anchor="start">Avg</text>`;
        if (buyPriceY) svg += `<line x1="${padding}" y1="${buyPriceY}" x2="${width - padding}" y2="${buyPriceY}" stroke="#34d399" stroke-width="1" stroke-dasharray="3 3" /><text x="${width - padding + 2}" y="${buyPriceY + 4}" fill="#34d399" font-size="10" font-family="Roboto Mono" text-anchor="start">Paid</text>`;
        svg += `<polyline fill="none" stroke="#60a5fa" stroke-width="2" points="${pricePoints}" /><text x="${getX(prices.length - 1)}" y="${getY(prices[prices.length - 1]) - 5}" fill="#60a5fa" font-size="10" font-family="Roboto Mono" text-anchor="middle">Price</text>`;
        svg += `<text x="${padding - 5}" y="${getY(minVal) + 4}" fill="#d0d8e8" font-size="10" font-family="Roboto Mono" text-anchor="end">${formatCredits(minVal, false)}</text><text x="${padding - 5}" y="${getY(maxVal) + 4}" fill="#d0d8e8" font-size="10" font-family="Roboto Mono" text-anchor="end">${formatCredits(maxVal, false)}</text></svg>`;
        return svg;
    }

    // --- Tutorial System Methods ---

    showTutorialToast({ step, onSkip, onNext }) {
        const { text, highlightElementId, position, size, completion } = step;
        const toast = this.cache.tutorialToastContainer;
        
        this.cache.tutorialToastText.innerHTML = text;
        this.applyTutorialHighlight(highlightElementId);

        // Positioning
        toast.className = 'hidden fixed p-4 rounded-lg shadow-2xl transition-all duration-300 pointer-events-auto'; // Reset classes
        toast.classList.add(`tt-${this.isMobile ? 'mobile' : position.desktop}`);
        
        // Size
        toast.style.width = size?.width || 'auto';

        toast.classList.remove('hidden');
        
        // Button visibility and actions
        const isInfoStep = completion.type === 'INFO';
        this.cache.tutorialToastNextBtn.style.display = isInfoStep ? 'inline-block' : 'inline-block'; // Always show for now
        this.cache.tutorialToastNextBtn.onclick = onNext;
        this.cache.tutorialToastSkipBtn.onclick = onSkip;
    }

    hideTutorialToast() {
        this.cache.tutorialToastContainer.classList.add('hidden');
        this.applyTutorialHighlight(null); // Remove any active highlight
    }
    
    applyTutorialHighlight(elementId) {
        // Remove from previous element
        if (this.activeTutorialHighlight) {
            this.activeTutorialHighlight.classList.remove('tutorial-highlight');
        }

        // Add to new element
        if (elementId) {
            const element = document.getElementById(elementId);
            if (element) {
                element.classList.add('tutorial-highlight');
                this.activeTutorialHighlight = element;
                element.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        } else {
            this.activeTutorialHighlight = null;
        }
    }

    showSkipTutorialModal(onConfirm) {
        const modal = this.cache.skipTutorialModal;
        modal.classList.remove('hidden');
        
        const confirmHandler = () => {
            onConfirm();
            this.hideModal('skip-tutorial-modal');
        };

        const cancelHandler = () => {
            this.hideModal('skip-tutorial-modal');
        };

        this.cache.skipTutorialConfirmBtn.onclick = confirmHandler;
        this.cache.skipTutorialCancelBtn.onclick = cancelHandler;
    }

    showTutorialLogModal({ seenBatches, onSelect }) {
        const logModal = this.cache.tutorialLogModal;
        const list = this.cache.tutorialLogList;
        list.innerHTML = ''; // Clear previous entries

        if (seenBatches.length === 0) {
            list.innerHTML = `<li class="text-gray-400 p-2 text-center">No tutorials viewed yet.</li>`;
        } else {
            seenBatches.forEach(batchId => {
                const batchData = TUTORIAL_DATA[batchId];
                if (batchData) {
                    const li = document.createElement('li');
                    li.innerHTML = `<button class="btn w-full text-center">${batchData.title}</button>`;
                    li.onclick = () => {
                        logModal.classList.remove('visible'); // Close the modal first
                        onSelect(batchId); // Then trigger the tutorial
                    };
                    list.appendChild(li);
                }
            });
        }
        logModal.classList.add('visible');
    }
}