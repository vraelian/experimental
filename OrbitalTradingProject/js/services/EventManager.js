import { formatCredits } from '../utils.js';
import { SHIPS } from '../data/gamedata.js';

export class EventManager {
    constructor(gameState, simulationService, uiManager) {
        this.gameState = gameState;
        this.simulationService = simulationService;
        this.uiManager = uiManager;
        
        this.refuelInterval = null;
        this.repairInterval = null;
    }

    bindEvents() {
        document.body.addEventListener('click', (e) => this._handleClick(e));
        document.body.addEventListener('mouseover', (e) => this._handleMouseOver(e));
        document.body.addEventListener('mouseout', (e) => this._handleMouseOut(e));
        document.addEventListener('keydown', (e) => this._handleKeyDown(e));

        // Refuel and Repair Listeners
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
             //this.uiManager.updateGraphTooltipPosition();
        });
        window.addEventListener('scroll', () => this.uiManager.updateGraphTooltipPosition(), true);
    }

    _handleClick(e) {
        const state = this.gameState.getState();
        if (state.isGameOver) return;

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
                
                // Market actions
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
                case 'set-max-buy':
                case 'set-max-sell': {
                    const qtyInput = document.getElementById(`qty-${goodId}`) || document.getElementById(`qty-${goodId}-mobile`);
                    const activeShip = state.player.shipStates[state.player.activeShipId];
                    const shipData = SHIPS[state.player.activeShipId];
                    const inventory = state.player.inventories[state.player.activeShipId];
                    
                    if (action === 'set-max-sell') {
                        qtyInput.value = inventory[goodId] ? inventory[goodId].quantity : 0;
                    } else {
                        const price = this.uiManager.getItemPrice(state, goodId);
                        const spaceAvailable = shipData.cargoCapacity - calculateInventoryUsed(inventory);
                        const canAfford = price > 0 ? Math.floor(state.player.credits / price) : spaceAvailable;
                        const marketStock = state.market.inventory[state.currentLocationId][goodId].quantity;
                        qtyInput.value = Math.max(0, Math.min(spaceAvailable, canAfford, marketStock));
                    }
                    break;
                }
                case 'increment': case 'decrement': {
                    const qtyInput = document.getElementById(`qty-${goodId}`) || document.getElementById(`qty-${goodId}-mobile`);
                    let currentValue = parseInt(qtyInput.value) || 0;
                    qtyInput.value = (action === 'increment') ? currentValue + 1 : Math.max(1, currentValue - 1);
                    break;
                }
            }
        }

        // --- Tooltip Toggles ---
        const loreTrigger = e.target.closest('.lore-container, .tutorial-container');
        const wasClickInsideTooltip = e.target.closest('.lore-tooltip, .tutorial-tooltip');
        const visibleTooltip = document.querySelector('.lore-tooltip.visible, .tutorial-tooltip.visible');

        if (trigger) {
            const tooltip = trigger.querySelector('.lore-tooltip, .tutorial-tooltip');
            if (visibleTooltip && visibleTooltip !== tooltip) visibleTooltip.classList.remove('visible');
            if (tooltip) tooltip.classList.toggle('visible');
        } else if (visibleTooltip && !wasClickInsideTooltip) {
            visibleTooltip.classList.remove('visible');
        }
    }

    _handleMouseOver(e) {
        const graphTarget = e.target.closest('[data-action="show-price-graph"], [data-action="show-finance-graph"]');
        if (graphTarget) {
            this.uiManager.showGraph(graphTarget, this.gameState.getState());
        }
    }

    _handleMouseOut(e) {
        const graphTarget = e.target.closest('[data-action="show-price-graph"], [data-action="show-finance-graph"]');
        if (graphTarget) {
            this.uiManager.hideGraph();
        }
    }
    
    _handleKeyDown(e) {
        // Handle modal closing
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

        // Debug shortcuts
        if (this.gameState.isGameOver || e.ctrlKey || e.metaKey) return;
        let message = '';
        switch(e.key) {
             case '!': 
                this.simulationService._advanceDays(30);
                message = 'Debug: Time advanced 30 days.';
                break;
            case '@':
                this.gameState.player.credits += 1000000;
                message = 'Debug: +1M Credits.';
                break;
        }
        if (message) {
            this.uiManager.showToast('debugToast', message);
            this.gameState.setState({});
        }
    }

    _startRefueling(e) {
        if (this.gameState.isGameOver || this.refuelInterval) return;
        this.refuelButtonElement = e.currentTarget;
        this._refuelTick();
        this.refuelInterval = setInterval(() => this._refuelTick(), 200);
    }
    _stopRefueling() {
        clearInterval(this.refuelInterval);
        this.refuelInterval = null;
    }
    _refuelTick() {
        // Logic moved to SimulationService to keep state changes central
        this.simulationService.refuelTick();
    }

    _startRepairing(e) {
        if (this.gameState.isGameOver || this.repairInterval) return;
        this.repairButtonElement = e.currentTarget;
        this._repairTick();
        this.repairInterval = setInterval(() => this._repairTick(), 200);
    }
    _stopRepairing() {
        clearInterval(this.repairInterval);
        this.repairInterval = null;
    }
    _repairTick() {
        this.simulationService.repairTick();
    }
}