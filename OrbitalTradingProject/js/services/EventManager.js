import { formatCredits } from '../utils.js';

class EventManager {
    constructor(gameState, simulationService, uiManager) {
        this.gameState = gameState;
        this.simulationService = simulationService;
        this.uiManager = uiManager;
    }

    bindEvents() {
        document.body.addEventListener('click', (e) => this.handleClick(e));
    }

    handleClick(event) {
        const actionTarget = event.target.closest('[data-action]');
        if (!actionTarget) return;

        const { action, goodId, locationId, viewId } = actionTarget.dataset;
        const state = this.gameState.getState();

        switch (action) {
            case 'set-view':
                this.simulationService.setView(viewId);
                break;
            case 'travel':
                if (locationId) this.simulationService.travelTo(locationId);
                break;
            case 'buy':
            case 'sell': {
                const itemCard = actionTarget.closest('.item-card-container');
                if (!itemCard) return;
                const qtyInput = itemCard.querySelector('[data-qty-input]');
                const quantity = parseInt(qtyInput.value, 10) || 1;
                
                if (quantity > 0) {
                    const success = (action === 'buy')
                        ? this.simulationService.buyItem(goodId, quantity)
                        : this.simulationService.sellItem(goodId, quantity);
                    
                    if (success) {
                        const cost = state.market.prices[state.currentLocationId][goodId] * quantity;
                        const text = action === 'buy' ? `-${formatCredits(cost, false)}` : `+${formatCredits(cost, false)}`;
                        const color = action === 'buy' ? '#f87171' : '#34d399';
                        this.uiManager.createFloatingText(text, event.clientX, event.clientY, color);
                        qtyInput.value = '1';
                    }
                }
                break;
            }
            case 'increment':
            case 'decrement': {
                const itemCard = actionTarget.closest('.item-card-container');
                if (!itemCard) return;
                const qtyInput = itemCard.querySelector('[data-qty-input]');
                let currentValue = parseInt(qtyInput.value, 10) || 0;
                qtyInput.value = (action === 'increment') ? currentValue + 1 : Math.max(1, currentValue - 1);
                break;
            }
        }
    }
}

export default EventManager;