// js/services/EventManager.js
import { formatCredits } from '../utils.js';
import { SHIPS, COMMODITIES, MARKETS } from '../data/gamedata.js';
import { calculateInventoryUsed } from '../utils.js';

export class EventManager {
    constructor(gameState, simulationService, uiManager) {
        this.gameState = gameState;
        this.simulationService = simulationService;
        this.uiManager = uiManager;
        
        this.refuelInterval = null;
        this.repairInterval = null;
        this.activeTooltipTarget = null;
    }

    bindEvents() {
        document.body.addEventListener('click', (e) => this._handleClick(e));
        document.body.addEventListener('dblclick', (e) => e.preventDefault()); // Prevent double-tap zoom
        document.body.addEventListener('mouseover', (e) => this._handleMouseOver(e));
        document.body.addEventListener('mouseout', (e) => this._handleMouseOut(e));
        document.addEventListener('keydown', (e) => this._handleKeyDown(e));

        const refuelBtn = document.getElementById('refuel-btn');
        refuelBtn.addEventListener('mousedown', (e) => this._startRefueling(e));
        refuelBtn.addEventListener('touchstart', (e) => { e.preventDefault(); this._startRefueling(e); });

        const repairBtn = document.getElementById('repair-btn');
        repairBtn.addEventListener('mousedown', (e) => this._startRepairing(e));
        repairBtn.addEventListener('touchstart', (e) => { e.preventDefault(); this._startRepairing(e); });

        ['mouseup', 'mouseleave', 'touchend'].forEach(evt => {
            document.addEventListener(evt, () => {
                this._stopRefueling();
                this._stopRepairing();
            });
        });

        window.addEventListener('resize', () => {
             if(this.gameState.currentView === 'market-view') {
                 this.uiManager.renderMarketView(this.gameState.getState());
             }
        });

        window.addEventListener('scroll', () => {
            if (this.uiManager.isMobile && this.activeTooltipTarget) {
                this.uiManager.hideGraph();
                this.uiManager.hideGenericTooltip();
                this.activeTooltipTarget = null;
            }
        }, { passive: true });
    }

    _handleClick(e) {
        const state = this.gameState.getState();
        if (state.isGameOver) return;

        // --- Mobile Tooltip Handling ---
        if (this.uiManager.isMobile) {
            const graphTarget = e.target.closest('[data-action="show-price-graph"], [data-action="show-finance-graph"]');
            const commodityTooltipTarget = e.target.closest('.commodity-name-tooltip');
            const cargoTooltipTarget = e.target.closest('.cargo-item-tooltip');
            const hangerTooltipTarget = e.target.closest('.hanger-ship-name');

            const newTarget = graphTarget || commodityTooltipTarget || cargoTooltipTarget || hangerTooltipTarget;

            if (this.activeTooltipTarget) {
                const isClickingSameTarget = this.activeTooltipTarget === newTarget;
                this.uiManager.hideGraph();
                this.uiManager.hideGenericTooltip();
                this.activeTooltipTarget = null;
                if (isClickingSameTarget) {
                    return; 
                }
            }
            
            if (newTarget) {
                if (newTarget.dataset.action?.includes('show-price-graph') || newTarget.dataset.action?.includes('show-finance-graph')) {
                    this.uiManager.showGraph(newTarget, this.gameState.getState());
                } else {
                    const tooltipText = newTarget.dataset.tooltip;
                    if (tooltipText) {
                        this.uiManager.showGenericTooltip(newTarget, tooltipText);
                    }
                }
                this.activeTooltipTarget = newTarget;
                return;
            }
        }
        
        // --- Lore/Tutorial Tooltip Handling (All Devices) ---
        const loreTrigger = e.target.closest('.lore-container, .tutorial-container');
        if (loreTrigger) {
            const tooltip = loreTrigger.querySelector('.lore-tooltip, .tutorial-tooltip');
            if (tooltip) tooltip.classList.toggle('visible');
            return;
        }
        const wasClickInsideTooltip = e.target.closest('.lore-tooltip, .tutorial-tooltip');
        const visibleTooltip = document.querySelector('.lore-tooltip.visible, .tutorial-tooltip.visible');
        if (visibleTooltip && !wasClickInsideTooltip) {
            visibleTooltip.classList.remove('visible');
        }

        // --- Standard Action Handling ---
        const actionTarget = e.target.closest('[data-action]');
        if (actionTarget) {
            const { action, goodId, locationId, viewId, shipId, loanDetails, cost } = actionTarget.dataset;
            
            switch(action) {
                case 'set-view': this.simulationService.setView(viewId); break;
                case 'travel': this.simulationService.travelTo(locationId); break;
                case 'buy-ship': 
                    if (this.simulationService.buyShip(shipId)) {
                        const price = SHIPS[shipId].price;
                        this.uiManager.createFloatingText(`-${formatCredits(price, false)}`, e.clientX, e.clientY, '#f87171');
                    }
                    break;
                case 'sell-ship':
                    const salePrice = this.simulationService.sellShip(shipId);
                    if (salePrice) {
                        this.uiManager.createFloatingText(`+${formatCredits(salePrice, false)}`, e.clientX, e.clientY, '#34d399');
                    }
                    break;
                case 'select-ship': this.simulationService.setActiveShip(shipId); break;
                case 'pay-debt': this.simulationService.payOffDebt(); break;
                case 'take-loan': this.simulationService.takeLoan(JSON.parse(loanDetails)); break;
                case 'purchase-intel': this.simulationService.purchaseIntel(parseInt(cost)); break;
                case 'show-starport-locked-toast':
                    this.uiManager.showToast('starport-unlock-tooltip', "Pay off your initial loan to access the Starport!");
                    break;
                
                case 'buy': case 'sell': {
                    const qtyInput = document.getElementById(`qty-${goodId}`) || document.getElementById(`qty-${goodId}-mobile`);
                    const quantity = parseInt(qtyInput.value, 10) || 1;
                    if (quantity > 0) {
                        const result = (action === 'buy')
                            ? this.simulationService.buyItem(goodId, quantity)
                            : this.simulationService.sellItem(goodId, quantity);
                        
                        if (result) {
                            const value = (action === 'buy') ? this.uiManager.getItemPrice(state, goodId) * quantity : result;
                            const text = action === 'buy' ? `-${formatCredits(value, false)}` : `+${formatCredits(value, false)}`;
                            const color = action === 'buy' ? '#f87171' : '#34d399';
                            this.uiManager.createFloatingText(text, e.clientX, e.clientY, color);
                            qtyInput.value = '1';
                        }
                    }
                    break;
                }
                case 'set-max-buy': case 'set-max-sell': {
                    const qtyInput = document.getElementById(`qty-${goodId}`) || document.getElementById(`qty-${goodId}-mobile`);
                    const ship = this.simulationService._getActiveShip();
                    const inventory = this.simulationService._getActiveInventory();
                    
                    if (action === 'set-max-sell') {
                        qtyInput.value = inventory[goodId] ? inventory[goodId].quantity : 0;
                    } else {
                        const price = this.uiManager.getItemPrice(state, goodId);
                        const space = ship.cargoCapacity - calculateInventoryUsed(inventory);
                        const canAfford = price > 0 ? Math.floor(state.player.credits / price) : space;
                        const stock = state.market.inventory[state.currentLocationId][goodId].quantity;
                        qtyInput.value = Math.max(0, Math.min(space, canAfford, stock));
                    }
                    break;
                }
                case 'increment': case 'decrement': {
                    const qtyInput = document.getElementById(`qty-${goodId}`) || document.getElementById(`qty-${goodId}-mobile`);
                    let val = parseInt(qtyInput.value) || 0;
                    qtyInput.value = (action === 'increment') ? val + 1 : Math.max(1, val - 1);
                    break;
                }
            }
        }
    }

    _handleMouseOver(e) {
        if (this.uiManager.isMobile) return;
        const graphTarget = e.target.closest('[data-action="show-price-graph"], [data-action="show-finance-graph"]');
        if (graphTarget) {
            this.uiManager.showGraph(graphTarget, this.gameState.getState());
        }
    }

    _handleMouseOut(e) {
        if (this.uiManager.isMobile) return;
        const graphTarget = e.target.closest('[data-action="show-price-graph"], [data-action="show-finance-graph"]');
        if (graphTarget) {
            this.uiManager.hideGraph();
        }
    }
    
    _handleKeyDown(e) {
        if (e.key === 'Escape') {
            this.gameState.popupsDisabled = !this.gameState.popupsDisabled;
            this.uiManager.showToast('debugToast', `Pop-ups ${this.gameState.popupsDisabled ? 'Disabled' : 'Enabled'}`);
            return;
        }

        const activeModal = document.querySelector('.modal-backdrop:not(.hidden):not(.age-event-modal)');
        if (activeModal && (e.code === 'Space' || e.key === 'Enter')) {
             e.preventDefault();
             const okButton = activeModal.querySelector('button');
             if(okButton) okButton.click();
             return;
        }

        if (this.gameState.isGameOver || e.ctrlKey || e.metaKey) return;
        let message = '';
        switch(e.key) {
            case '!':
                this.gameState.player.credits += 500000000000;
                message = 'Debug: +500B Credits.';
                break;
            case '@':
                const ship = this.simulationService._getActiveShip();
                this.gameState.player.shipStates[ship.id].fuel = ship.maxFuel;

                const possibleDestinations = MARKETS.filter(m => m.id !== this.gameState.currentLocationId && this.gameState.player.unlockedLocationIds.includes(m.id));
                if (possibleDestinations.length > 0) {
                    const randomDestination = possibleDestinations[Math.floor(Math.random() * possibleDestinations.length)];
                    this.simulationService.initiateTravel(randomDestination.id, { forceEvent: true });
                    message = `Debug: Refilled fuel & force-traveling to ${randomDestination.name} with event.`;
                } else {
                    message = `Debug: No available destinations.`;
                }
                break;
            case '#':
                this.gameState.player.starportUnlocked = true;
                Object.keys(SHIPS).forEach(shipId => {
                    if (!this.gameState.player.ownedShipIds.includes(shipId)) {
                        const newShip = SHIPS[shipId];
                        this.gameState.player.ownedShipIds.push(shipId);
                        this.gameState.player.shipStates[shipId] = { health: newShip.maxHealth, fuel: newShip.maxFuel, hullAlerts: { one: false, two: false } };
                        this.gameState.player.inventories[shipId] = {};
                        COMMODITIES.forEach(c => { this.gameState.player.inventories[shipId][c.id] = { quantity: 0, avgCost: 0 }; });
                    }
                });
                message = 'Debug: Starport unlocked & all ships added.';
                break;
            case '$':
                this.simulationService._advanceDays(366);
                message = `Debug: Time advanced 1 year and 1 day.`;
                break;
        }
        if (message) {
            this.uiManager.showToast('debugToast', message);
            this.gameState.setState({});
        }
    }

    _startRefueling(e) {
        if (this.gameState.isGameOver || this.refuelInterval) return;
        const buttonElement = e.currentTarget;
        this._refuelTick(buttonElement); 
        this.refuelInterval = setInterval(() => this._refuelTick(buttonElement), 200);
    }

    _stopRefueling() {
        clearInterval(this.refuelInterval);
        this.refuelInterval = null;
    }

    _refuelTick(buttonElement) {
        const cost = this.simulationService.refuelTick();
        if (cost > 0) {
            const rect = buttonElement.getBoundingClientRect();
            const x = rect.left + (rect.width / 2) + (Math.random() * 40 - 20);
            const y = rect.top + (Math.random() * 20 - 10);
            this.uiManager.createFloatingText(`-${formatCredits(cost, false)}`, x, y, '#f87171');
        } else {
            this._stopRefueling();
        }
    }

    _startRepairing(e) {
        if (this.gameState.isGameOver || this.repairInterval) return;
        const buttonElement = e.currentTarget;
        this._repairTick(buttonElement);
        this.repairInterval = setInterval(() => this._repairTick(buttonElement), 200);
    }

    _stopRepairing() {
        clearInterval(this.repairInterval);
        this.repairInterval = null;
    }

    _repairTick(buttonElement) {
        const cost = this.simulationService.repairTick();
        if (cost > 0) {
            const rect = buttonElement.getBoundingClientRect();
            const x = rect.left + (rect.width / 2) + (Math.random() * 40 - 20);
            const y = rect.top + (Math.random() * 20 - 10);
            this.uiManager.createFloatingText(`-${formatCredits(cost, false)}`, x, y, '#f87171');
        } else {
            this._stopRepairing();
        }
    }
}