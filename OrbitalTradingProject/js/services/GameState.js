import { CONFIG } from '../data/config.js';
import { SHIPS, COMMODITIES, MARKETS } from '../data/gamedata.js';

function procedurallyGenerateTravelData(markets) {
    const travelData = {};
    const fuelScalar = 3;
    markets.forEach((fromMarket, i) => {
        travelData[fromMarket.id] = {};
        markets.forEach((toMarket, j) => {
            if (i === j) return;
            const distance = Math.abs(i - j);
            const fuelTime = distance * 2 + Math.floor(Math.random() * 3);
            let fuelCost = Math.round(fuelTime * fuelScalar * (1 + (j / markets.length) * 0.5));
            let travelTime;
            if ((fromMarket.id === 'loc_earth' && toMarket.id === 'loc_luna') || (fromMarket.id === 'loc_luna' && toMarket.id === 'loc_earth')) {
                travelTime = 1 + Math.floor(Math.random() * 3);
            } else {
                travelTime = 15 + (distance * 10) + Math.floor(Math.random() * 5);
            }
            travelData[fromMarket.id][toMarket.id] = { time: travelTime, fuelCost: Math.max(1, fuelCost) };
         });
    });
    return travelData;
}

function skewedRandom(min, max) {
    return min + Math.floor((max - min + 1) * Math.random());
}

function getTierAvailability(tier) {
    const tiers = {
        1: { min: 6, max: 240 }, 2: { min: 4, max: 200 }, 3: { min: 3, max: 120 },
        4: { min: 2, max: 40 }, 5: { min: 1, max: 20 }, 6: { min: 0, max: 20 }, 7: { min: 0, max: 10 }
    };
    return tiers[tier] || { min: 0, max: 5 };
}

class GameState {
    constructor() {
        this.state = {};
        this.subscribers = [];
        this.TRAVEL_DATA = procedurallyGenerateTravelData(MARKETS);
    }

    subscribe(callback) {
        this.subscribers.push(callback);
    }

    _notify() {
        this.subscribers.forEach(callback => callback(this.state));
    }

    setState(newState) {
        this.state = { ...this.state, ...newState };
        this._notify();
        this.saveGame();
    }

    getState() {
        return this.state;
    }

    saveGame() {
        try {
            const stateToSave = { ...this.state };
            delete stateToSave.TRAVEL_DATA;
            localStorage.setItem(CONFIG.SAVE_KEY, JSON.stringify(stateToSave));
        } catch (error) {
            console.error("Error saving game state:", error);
        }
    }

    loadGame() {
        try {
            const serializedState = localStorage.getItem(CONFIG.SAVE_KEY);
            if (serializedState === null) return false;
            
            this.state = JSON.parse(serializedState);
            this.state.TRAVEL_DATA = this.TRAVEL_DATA;
            this._notify();
            return true;
        } catch (error) {
            console.warn("Could not parse save data.", error);
            localStorage.removeItem(CONFIG.SAVE_KEY);
            return false;
        }
    }

    startNewGame(playerName) {
        const initialState = {
            TRAVEL_DATA: this.TRAVEL_DATA,
            day: 1, lastInterestChargeDay: 1, lastMarketUpdateDay: 1, currentLocationId: 'loc_mars', currentView: 'travel-view', isGameOver: false,
            player: {
                name: playerName, playerTitle: 'Captain', playerAge: 24, credits: CONFIG.STARTING_CREDITS, debt: CONFIG.STARTING_DEBT, weeklyInterestAmount: CONFIG.STARTING_DEBT_INTEREST,
                starportUnlocked: false, unlockedCommodityLevel: 1, unlockedLocationIds: ['loc_earth', 'loc_luna', 'loc_mars', 'loc_venus', 'loc_belt', 'loc_saturn'],
                activePerks: {}, seenEvents: [], activeShipId: 'starter', ownedShipIds: ['starter'],
                shipStates: {}, inventories: {}
            },
            market: { prices: {}, inventory: {}, galacticAverages: {} }
        };

        initialState.player.ownedShipIds.forEach(shipId => {
            const shipData = SHIPS[shipId];
            initialState.player.shipStates[shipId] = { health: shipData.maxHealth, fuel: shipData.maxFuel };
            initialState.player.inventories[shipId] = {};
            COMMODITIES.forEach(c => {
                initialState.player.inventories[shipId][c.id] = { quantity: 0, avgCost: 0 };
            });
        });
        
        MARKETS.forEach(m => {
            initialState.market.inventory[m.id] = {};
            COMMODITIES.forEach(c => {
                const avail = getTierAvailability(c.tier);
                initialState.market.inventory[m.id][c.id] = { quantity: skewedRandom(avail.min, avail.max) };
            });
        });
        
        this.state = initialState;
        this._calculateGalacticAverages();
        this._seedInitialMarketPrices();
        this.setState(this.state);
    }
    
    _calculateGalacticAverages() {
        this.state.market.galacticAverages = {};
        COMMODITIES.forEach(good => {
            this.state.market.galacticAverages[good.id] = (good.basePriceRange[0] + good.basePriceRange[1]) / 2;
        });
    }

    _seedInitialMarketPrices() {
        MARKETS.forEach(location => {
            this.state.market.prices[location.id] = {};
            COMMODITIES.forEach(good => {
                let price = this.state.market.galacticAverages[good.id] * (1 + (Math.random() - 0.5) * 0.5);
                price *= (location.modifiers[good.id] || 1.0);
                this.state.market.prices[location.id][good.id] = Math.max(1, Math.round(price));
            });
        });
    }
}

export const gameState = new GameState();