// js/services/simulation/MarketService.js
import { CONFIG } from '../../data/config.js';
import { COMMODITIES, MARKETS } from '../../data/gamedata.js';
import { skewedRandom } from '../../utils.js';

export class MarketService {
    constructor(gameState) {
        this.gameState = gameState;
    }

    evolveMarketPrices() {
        MARKETS.forEach(location => {
            COMMODITIES.forEach(good => {
                if (good.unlockLevel > this.gameState.player.unlockedCommodityLevel) return;

                const price = this.gameState.market.prices[location.id][good.id];
                const avg = this.gameState.market.galacticAverages[good.id];
                const mod = location.modifiers[good.id] || 1.0;
                const baseline = avg * mod;

                const volatility = (Math.random() - 0.5) * 2 * CONFIG.DAILY_PRICE_VOLATILITY;
                const reversion = (baseline - price) * CONFIG.MEAN_REVERSION_STRENGTH;
                
                this.gameState.market.prices[location.id][good.id] = Math.max(1, Math.round(price + price * volatility + reversion));
            });
        });
        this._recordPriceHistory();
    }
    
    replenishMarketInventory() {
        MARKETS.forEach(market => {
            COMMODITIES.forEach(c => {
                 if (c.unlockLevel > this.gameState.player.unlockedCommodityLevel) return;

                const inventoryItem = this.gameState.market.inventory[market.id][c.id];
                const avail = this._getTierAvailability(c.tier);
                const maxStock = avail.max;
                const replenishRate = 0.1; // Replenish 10% of max stock per cycle

                if (inventoryItem.quantity < maxStock) {
                    inventoryItem.quantity = Math.min(maxStock, inventoryItem.quantity + Math.ceil(maxStock * replenishRate));
                }

                // Ensure special demand locations never have stock
                if (market.specialDemand && market.specialDemand[c.id]) {
                    inventoryItem.quantity = 0;
                }
            });
        });
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

    _recordPriceHistory() {
        if (!this.gameState || !this.gameState.market) return;
        MARKETS.forEach(market => {
            if (!this.gameState.market.priceHistory[market.id]) this.gameState.market.priceHistory[market.id] = {};
            COMMODITIES.forEach(good => {
                if (good.unlockLevel > this.gameState.player.unlockedCommodityLevel) return;
                if (!this.gameState.market.priceHistory[market.id][good.id]) this.gameState.market.priceHistory[market.id][good.id] = [];
                
                const history = this.gameState.market.priceHistory[market.id][good.id];
                const currentPrice = this.gameState.market.prices[market.id][good.id];
                
                history.push({ day: this.gameState.day, price: currentPrice });
                
                while (history.length > CONFIG.PRICE_HISTORY_LENGTH) {
                    history.shift();
                }
            });
        });
    }
}