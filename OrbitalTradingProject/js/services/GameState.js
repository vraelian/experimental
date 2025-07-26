import { CONFIG } from '../data/config.js';
import { SHIPS, COMMODITIES, MARKETS } from '../data/gamedata.js';
import { DATE_CONFIG } from '../data/dateConfig.js';
import { skewedRandom } from '../utils.js';

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

export class GameState {
    constructor() {
        this.state = {};
        this.subscribers = [];
        this.TRAVEL_DATA = procedurallyGenerateTravelData(MARKETS);
    }

    // --- Observer Pattern ---
    subscribe(callback) {
        this.subscribers.push(callback);
    }

    _notify() {
        // Deep copy state to prevent direct mutation by subscribers
        this.subscribers.forEach(callback => callback(JSON.parse(JSON.stringify(this))));
    }

    // --- State Management ---
    setState(partialState) {
        Object.assign(this, partialState);
        this._notify();
        this.saveGame();
    }
    
    getState() {
        return JSON.parse(JSON.stringify(this));
    }

    // --- Save/Load ---
    saveGame() {
        try {
            const stateToSave = { ...this };
            delete stateToSave.subscribers; // Don't save subscribers
            localStorage.setItem(CONFIG.SAVE_KEY, JSON.stringify(stateToSave));
        } catch (error) {
            console.error("Error saving game state:", error);
        }
    }

    loadGame() {
        try {
            const serializedState = localStorage.getItem(CONFIG.SAVE_KEY);
            if (serializedState === null) return false;
            
            const loadedState = JSON.parse(serializedState);
            Object.assign(this, loadedState);

            // Re-initialize non-serializable parts
            this.TRAVEL_DATA = procedurallyGenerateTravelData(MARKETS);
            
            this._notify();
            return true;
        } catch (error) {
            console.warn("Could not parse save data. Starting new game.", error);
            localStorage.removeItem(CONFIG.SAVE_KEY);
            return false;
        }
    }

    // --- Game Initialization ---
    startNewGame(playerName) {
        const initialState = {
            day: 1,
            lastInterestChargeDay: 1,
            lastMarketUpdateDay: 1,
            currentLocationId: 'loc_mars',
            currentView: 'travel-view',
            isGameOver: false,
            popupsDisabled: false,
            pendingTravel: null,
            player: {
                name: playerName,
                playerTitle: 'Captain',
                playerAge: 24,
                lastBirthdayYear: DATE_CONFIG.START_YEAR,
                birthdayProfitBonus: 0,
                credits: CONFIG.STARTING_CREDITS,
                debt: CONFIG.STARTING_DEBT,
                weeklyInterestAmount: CONFIG.STARTING_DEBT_INTEREST,
                loanStartDate: null,
                seenGarnishmentWarning: false,
                initialDebtPaidOff: false,
                starportUnlocked: false,
                unlockedCommodityLevel: 1,
                unlockedLocationIds: ['loc_earth', 'loc_luna', 'loc_mars', 'loc_venus', 'loc_belt', 'loc_saturn'],
                seenCommodityMilestones: [],
                financeHistory: [{ value: CONFIG.STARTING_CREDITS, type: 'start', amount: 0 }],
                activePerks: {},
                seenEvents: [],
                activeShipId: 'starter',
                ownedShipIds: ['starter'],
                shipStates: {},
                inventories: {}
            },
            market: {
                prices: {},
                inventory: {},
                galacticAverages: {},
                priceHistory: {},
            },
            intel: {
                active: null,
                available: {}
            },
            tutorials: {
                navigation: false,
                market: false,
                maintenance: false,
                success: false,
                starport: false
            }
        };

        // Initialize ship states and inventories
        initialState.player.ownedShipIds.forEach(shipId => {
            const shipData = SHIPS[shipId];
            initialState.player.shipStates[shipId] = { 
                health: shipData.maxHealth, 
                fuel: shipData.maxFuel,
                hullAlerts: { one: false, two: false }
            };
            initialState.player.inventories[shipId] = {};
            COMMODITIES.forEach(c => {
                initialState.player.inventories[shipId][c.id] = { quantity: 0, avgCost: 0 };
            });
        });

        // Initialize market data
        MARKETS.forEach(market => {
            initialState.market.priceHistory[market.id] = {};
            initialState.intel.available[market.id] = (Math.random() < CONFIG.INTEL_CHANCE);
            initialState.market.inventory[market.id] = {};
            COMMODITIES.forEach(c => {
                initialState.market.priceHistory[market.id][c.id] = [];
                const avail = this._getTierAvailability(c.tier);
                let quantity = skewedRandom(avail.min, avail.max);
                if (market.modifiers[c.id] && market.modifiers[c.id] > 1.0) quantity = Math.floor(quantity * 1.5);
                if (market.specialDemand && market.specialDemand[c.id]) quantity = 0;
                initialState.market.inventory[market.id][c.id] = { quantity: Math.max(0, quantity) };
            });
        });
        
        Object.assign(this, initialState);
        this._calculateGalacticAverages();
        this._seedInitialMarketPrices();
        this.setState({}); // Notify subscribers and save
    }

    _getTierAvailability(tier) {
        switch (tier) {
            case 1: return { min: 6, max: 240 };
            case 2: return { min: 4, max: 200 };
            case 3: return { min: 3, max: 120 };
            case 4: return { min: 2, max: 40 };
            case 5: return { min: 1, max: 20 };
            case 6: return { min: 0, max: 20 };
            case 7: return { min: 0, max: 10 };
            default: return { min: 0, max: 5 };
        }
    }

    _calculateGalacticAverages() {
        this.market.galacticAverages = {};
        COMMODITIES.forEach(good => {
            this.market.galacticAverages[good.id] = (good.basePriceRange[0] + good.basePriceRange[1]) / 2;
        });
    }

    _seedInitialMarketPrices() {
        MARKETS.forEach(location => {
            this.market.prices[location.id] = {};
            COMMODITIES.forEach(good => {
                let price = this.market.galacticAverages[good.id] * (1 + (Math.random() - 0.5) * 0.5);
                price *= (location.modifiers[good.id] || 1.0);
                this.market.prices[location.id][good.id] = Math.max(1, Math.round(price));
            });
        });
    }
}