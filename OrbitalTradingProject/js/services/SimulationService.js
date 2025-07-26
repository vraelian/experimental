import { CONFIG } from '../data/config.js';
import { SHIPS, COMMODITIES, MARKETS } from '../data/gamedata.js';
import { calculateInventoryUsed } from '../utils.js';

class SimulationService {
    constructor(gameState, uiManager) {
        this.gameState = gameState;
        this.uiManager = uiManager;
    }

    setView(viewId) {
        const state = this.gameState.getState();
        state.currentView = viewId;
        this.gameState.setState(state);
    }

    travelTo(locationId) {
        const state = this.gameState.getState();
        if (state.currentLocationId === locationId) {
            return this.setView('market-view');
        }
        
        const travelInfo = state.TRAVEL_DATA[state.currentLocationId][locationId];
        const activeShip = this._getActiveShip(state);

        if (activeShip.fuel < travelInfo.fuelCost) {
            return this.uiManager.queueModal('event-modal', 'Insufficient Fuel', `You need ${travelInfo.fuelCost} fuel but only have ${Math.floor(activeShip.fuel)}.`);
        }
        
        this.initiateTravel(locationId);
    }
    
    initiateTravel(locationId) {
        const state = this.gameState.getState();
        const fromId = state.currentLocationId;
        const travelInfo = { ...state.TRAVEL_DATA[fromId][locationId] };
        
        const activeShipState = state.player.shipStates[state.player.activeShipId];
        activeShipState.fuel -= travelInfo.fuelCost;
        activeShipState.health -= travelInfo.time * CONFIG.HULL_DECAY_PER_TRAVEL_DAY;

        if (activeShipState.health <= 0) {
            // Placeholder for ship destruction
            activeShipState.health = 0; 
        }

        this._advanceDays(travelInfo.time);
        
        const currentState = this.gameState.getState(); // Get state again after advanceDays
        currentState.currentLocationId = locationId;
        this.setView('market-view');
    }

    buyItem(goodId, quantity) {
        const state = this.gameState.getState();
        const price = state.market.prices[state.currentLocationId][goodId];
        const totalCost = price * quantity;
        
        if (state.player.credits < totalCost) return false;
        
        const activeShip = this._getActiveShip(state);
        const inv = state.player.inventories[state.player.activeShipId];
        if (calculateInventoryUsed(inv) + quantity > activeShip.cargoCapacity) return false;

        state.player.credits -= totalCost;
        const item = inv[goodId];
        item.avgCost = ((item.avgCost * item.quantity) + totalCost) / (item.quantity + quantity);
        item.quantity += quantity;
        state.market.inventory[state.currentLocationId][goodId].quantity -= quantity;
        
        this.gameState.setState(state);
        return true;
    }

    sellItem(goodId, quantity) {
        const state = this.gameState.getState();
        const inv = state.player.inventories[state.player.activeShipId];
        const item = inv[goodId];

        if (!item || item.quantity < quantity) return false;

        const price = state.market.prices[state.currentLocationId][goodId];
        state.player.credits += price * quantity;
        item.quantity -= quantity;
        if (item.quantity === 0) item.avgCost = 0;
        
        state.market.inventory[state.currentLocationId][goodId].quantity += quantity;
        
        this.gameState.setState(state);
        return true;
    }

    _advanceDays(days) {
        const state = this.gameState.getState();
        for (let i = 0; i < days; i++) {
            if (state.isGameOver) return;
            state.day++;

            if ((state.day - state.lastMarketUpdateDay) >= 7) {
                this._evolveMarketPrices();
                state.lastMarketUpdateDay = state.day;
            }
            if (state.player.debt > 0 && (state.day - state.lastInterestChargeDay) >= CONFIG.INTEREST_INTERVAL) {
                state.player.debt += state.player.weeklyInterestAmount;
                state.lastInterestChargeDay = state.day;
            }
        }
        this.gameState.setState(state);
    }
    
    _evolveMarketPrices() {
        const state = this.gameState.getState();
        MARKETS.forEach(location => {
            COMMODITIES.forEach(good => {
                const yesterdayPrice = state.market.prices[location.id][good.id];
                const galacticAverage = state.market.galacticAverages[good.id];
                const localBaseline = galacticAverage * (location.modifiers[good.id] || 1.0);
                const volatility = (Math.random() - 0.5) * 2 * CONFIG.DAILY_PRICE_VOLATILITY;
                const reversionPull = (localBaseline - yesterdayPrice) * CONFIG.MEAN_REVERSION_STRENGTH;
                state.market.prices[location.id][good.id] = Math.max(1, Math.round(yesterdayPrice + (yesterdayPrice * volatility) + reversionPull));
            });
        });
    }

    _getActiveShip(state) {
        const activeId = state.player.activeShipId;
        return { id: activeId, ...SHIPS[activeId], ...state.player.shipStates[activeId] };
    }
}