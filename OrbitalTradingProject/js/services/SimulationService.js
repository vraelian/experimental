// js/services/SimulationService.js
import { CONFIG } from '../data/config.js';
import { SHIPS, COMMODITIES, MARKETS, AGE_EVENTS, PERKS } from '../data/gamedata.js';
import { DATE_CONFIG } from '../data/dateConfig.js';
import { calculateInventoryUsed, formatCredits } from '../utils.js';
import { MarketService } from './simulation/MarketService.js';
import { TravelService } from './simulation/TravelService.js';

export class SimulationService {
    constructor(gameState, uiManager) {
        this.gameState = gameState;
        this.uiManager = uiManager;
        this.marketService = new MarketService(gameState);
        this.travelService = new TravelService(gameState, this, uiManager);
    }

    // --- View Management ---
    setView(viewId) {
        if (viewId === 'starport-view' && !this.gameState.tutorials.starport) {
            const desc = `This is the starport where you can purchase ships from the <span class="hl">Shipyard</span> and manage them in your <span class="hl">Hangar</span>.<br><br>Other stations offer different ships, but you can <span class="hl">access your hangar from any station.</span>`;
            setTimeout(() => {
                this.uiManager.queueModal('tutorial-modal', 'Ship Management', desc, () => { this.gameState.tutorials.starport = true; });
            }, 1000);
        }
        this.gameState.setState({ currentView: viewId });
    }

    // --- Player Actions ---
    travelTo(locationId) { this.travelService.travelTo(locationId); }
    buyItem(goodId, quantity) {
        const state = this.gameState.getState();
        if (state.isGameOver || quantity <= 0) return false;
        
        const price = this.uiManager.getItemPrice(state, goodId);
        const totalCost = price * quantity;
        const marketStock = state.market.inventory[state.currentLocationId][goodId].quantity;

        if (marketStock <= 0) { this.uiManager.queueModal('event-modal', "Sold Out", `This station has no more ${COMMODITIES.find(c=>c.id===goodId).name} available.`); return false; }
        if (quantity > marketStock) { this.uiManager.queueModal('event-modal', "Limited Stock", `This station only has ${marketStock} units available.`); return false; }
        
        const activeShip = this._getActiveShip();
        const activeInventory = this._getActiveInventory();
        if (calculateInventoryUsed(activeInventory) + quantity > activeShip.cargoCapacity) {
             this.uiManager.queueModal('event-modal', "Cargo Hold Full", "You don't have enough space.");
            return false;
        }
        if (state.player.credits < totalCost) { this.uiManager.queueModal('event-modal', "Insufficient Funds", "Your credit balance is too low."); return false; }

        this.gameState.market.inventory[state.currentLocationId][goodId].quantity -= quantity;
        const item = activeInventory[goodId];
        item.avgCost = ((item.quantity * item.avgCost) + totalCost) / (item.quantity + quantity);
        item.quantity += quantity;
        this.gameState.player.credits -= totalCost;

        this._recordFinanceTransaction('trade', -totalCost);
        this._checkMilestones();
        this.gameState.setState({});
        return true;
    }
    sellItem(goodId, quantity) {
        const state = this.gameState.getState();
        if (state.isGameOver || quantity <= 0) return 0;
        
        const activeInventory = this._getActiveInventory();
        const item = activeInventory[goodId];
        if (!item || item.quantity < quantity) return 0;

        this.gameState.market.inventory[state.currentLocationId][goodId].quantity += quantity;
        const price = this.uiManager.getItemPrice(state, goodId, true);
        let totalSaleValue = price * quantity;

        const profit = totalSaleValue - (item.avgCost * quantity);
        if (profit > 0) {
            let totalBonus = (state.player.activePerks.trademaster ? PERKS.trademaster.profitBonus : 0) + (state.player.birthdayProfitBonus || 0);
            totalSaleValue += profit * totalBonus;
        }

        this.gameState.player.credits += totalSaleValue;
        item.quantity -= quantity;
        if (item.quantity === 0) item.avgCost = 0;
        
        this._recordFinanceTransaction('trade', totalSaleValue);
        this._checkMilestones();
        this.gameState.setState({});
        return totalSaleValue;
    }
    buyShip(shipId) {
        const ship = SHIPS[shipId];
        if (this.gameState.player.credits < ship.price) {
            this.uiManager.queueModal('event-modal', "Insufficient Funds", "You cannot afford this ship.");
            return false;
        }
        
        this.gameState.player.credits -= ship.price;
        this._recordFinanceTransaction('ship', -ship.price);
        this.gameState.player.ownedShipIds.push(shipId);
        this.gameState.player.shipStates[shipId] = { health: ship.maxHealth, fuel: ship.maxFuel, hullAlerts: { one: false, two: false } };
        this.gameState.player.inventories[shipId] = {};
        COMMODITIES.forEach(c => { this.gameState.player.inventories[shipId][c.id] = { quantity: 0, avgCost: 0 }; });
        
        this.uiManager.queueModal('event-modal', "Acquisition Complete", `The ${ship.name} has been transferred to your hangar.`);
        this.gameState.setState({});
        return true;
    }
    sellShip(shipId) {
        const state = this.gameState.getState();
        if (state.player.ownedShipIds.length <= 1) {
            this.uiManager.queueModal('event-modal', "Action Blocked", "You cannot sell your last remaining ship.");
            return false;
        }
        if (shipId === state.player.activeShipId) {
            this.uiManager.queueModal('event-modal', "Action Blocked", "You cannot sell your active ship.");
            return false;
        }
        if (calculateInventoryUsed(state.player.inventories[shipId]) > 0) {
            this.uiManager.queueModal('event-modal', 'Cannot Sell Ship', 'This vessel\'s cargo hold is not empty.');
            return false;
        }

        const ship = SHIPS[shipId];
        const salePrice = Math.floor(ship.price * CONFIG.SHIP_SELL_MODIFIER);
        this.gameState.player.credits += salePrice;
        this._recordFinanceTransaction('ship', salePrice);
        
        this.gameState.player.ownedShipIds = this.gameState.player.ownedShipIds.filter(id => id !== shipId);
        delete this.gameState.player.shipStates[shipId];
        delete this.gameState.player.inventories[shipId];
        
        this.uiManager.queueModal('event-modal', "Vessel Sold", `You sold the ${ship.name} for ${formatCredits(salePrice)}.`);
        this.gameState.setState({});
        return salePrice;
    }
    setActiveShip(shipId) {
        if (!this.gameState.player.ownedShipIds.includes(shipId)) return;
        this.gameState.player.activeShipId = shipId;
        this.gameState.setState({});
    }
    payOffDebt() {
        if (this.gameState.isGameOver) return;
        const { player } = this.gameState;
        if (player.credits < player.debt) {
            this.uiManager.queueModal('event-modal', "Insufficient Funds", "You can't afford to pay off your entire debt.");
            return;
        }

        if (player.debt > 0 && !player.initialDebtPaidOff) {
            const msg = `Captain ${player.name}, your strategic trading has put us on a path to success. The crew's morale is high.<br><br>The <span class='hl'>Starport</span> is now accessible!`;
            this.uiManager.queueModal('tutorial-modal', 'Crew Commendation', msg, () => {
                this.gameState.tutorials.success = true;
            }, { tutorialType: 'success' });
            player.starportUnlocked = true;
            player.initialDebtPaidOff = true;
        }

        player.credits -= player.debt;
        this._recordFinanceTransaction('loan', -player.debt);
        player.debt = 0;
        player.weeklyInterestAmount = 0;
        player.loanStartDate = null;
        this._checkMilestones();
        this.gameState.setState({});
    }
    takeLoan(loanData) {
        const { player, day } = this.gameState;
        if (player.debt > 0) {
            this.uiManager.queueModal('event-modal', "Loan Unavailable", `You must pay off your existing debt first.`);
            return;
        }
        if (player.credits < loanData.fee) {
            this.uiManager.queueModal('event-modal', "Unable to Secure Loan", `The financing fee is ${formatCredits(loanData.fee)}, but you only have ${formatCredits(player.credits)}.`);
            return;
        }

        player.credits -= loanData.fee;
        this._recordFinanceTransaction('loan', -loanData.fee);
        player.credits += loanData.amount;
        this._recordFinanceTransaction('loan', loanData.amount);
        player.debt += loanData.amount;
        player.weeklyInterestAmount = loanData.interest;
        player.loanStartDate = day;
        player.seenGarnishmentWarning = false;

        const loanDesc = `You've acquired a loan of <span class="hl-blue">${formatCredits(loanData.amount)}</span>.<br>A financing fee of <span class="hl-red">${formatCredits(loanData.fee)}</span> was deducted.`;
        this.uiManager.queueModal('event-modal', "Loan Acquired", loanDesc);
        this.gameState.setState({});
    }
    purchaseIntel(cost) {
        const { player, currentLocationId, day } = this.gameState;
        if (player.credits < cost) {
            this.uiManager.queueModal('event-modal', "Insufficient Funds", "You can't afford this intel.");
            return;
        }
        
        player.credits -= cost;
        this._recordFinanceTransaction('intel', -cost);
        this.gameState.intel.available[currentLocationId] = false;

        const otherMarkets = MARKETS.filter(m => m.id !== currentLocationId && player.unlockedLocationIds.includes(m.id));
        if (otherMarkets.length === 0) return;

        const targetMarket = otherMarkets[Math.floor(Math.random() * otherMarkets.length)];
        const availableCommodities = COMMODITIES.filter(c => c.unlockLevel <= player.unlockedCommodityLevel);
        const commodity = availableCommodities[Math.floor(Math.random() * availableCommodities.length)];
        
        if (commodity) {
            this.gameState.intel.active = { 
                targetMarketId: targetMarket.id,
                commodityId: commodity.id, 
                type: 'demand',
                startDay: day,
                endDay: day + 100 
            };
        }
        this.gameState.setState({});
    }
    refuelTick() {
        const state = this.gameState;
        const ship = this._getActiveShip();
        if (ship.fuel >= ship.maxFuel) return 0;

        let costPerTick = MARKETS.find(m => m.id === state.currentLocationId).fuelPrice / 4;
        if (state.player.activePerks.venetian_syndicate && state.currentLocationId === 'loc_venus') {
            costPerTick *= (1 - PERKS.venetian_syndicate.fuelDiscount);
        }
        if (state.player.credits < costPerTick) return 0;

        state.player.credits -= costPerTick;
        state.player.shipStates[ship.id].fuel = Math.min(ship.maxFuel, ship.fuel + 2.5);
        this._recordFinanceTransaction('fuel', -costPerTick);
        this.gameState.setState({});
        return costPerTick;
    }
    repairTick() {
        const state = this.gameState;
        const ship = this._getActiveShip();
        if (ship.health >= ship.maxHealth) return 0;
        
        let costPerTick = (ship.maxHealth * (CONFIG.REPAIR_AMOUNT_PER_TICK / 100)) * CONFIG.REPAIR_COST_PER_HP;
        if (state.player.activePerks.venetian_syndicate && state.currentLocationId === 'loc_venus') {
            costPerTick *= (1 - PERKS.venetian_syndicate.repairDiscount);
        }
        if (state.player.credits < costPerTick) return 0;
        
        state.player.credits -= costPerTick;
        state.player.shipStates[ship.id].health = Math.min(ship.maxHealth, ship.health + (ship.maxHealth * (CONFIG.REPAIR_AMOUNT_PER_TICK / 100)));
        this._recordFinanceTransaction('repair', -costPerTick);
        this._checkHullWarnings(ship.id);
        this.gameState.setState({});
        return costPerTick;
    }

    // --- Time & Event Progression ---
    _advanceDays(days) {
        for (let i = 0; i < days; i++) {
            if (this.gameState.isGameOver) return;
            this.gameState.day++;
            const dayOfYear = (this.gameState.day - 1) % 365;
            const currentYear = DATE_CONFIG.START_YEAR + Math.floor((this.gameState.day - 1) / 365);
            if (dayOfYear === 11 && currentYear > this.gameState.player.lastBirthdayYear) {
                this.gameState.player.playerAge++;
                this.gameState.player.birthdayProfitBonus += 0.01;
                this.gameState.player.lastBirthdayYear = currentYear;
                this.uiManager.queueModal('event-modal', `Captain ${this.gameState.player.name}`, `You are now ${this.gameState.player.playerAge}. You feel older and wiser.<br><br>Your experience now grants you an additional 1% profit on all trades.`);
            }

            this._checkAgeEvents();

            if ((this.gameState.day - this.gameState.lastMarketUpdateDay) >= 7) {
                this.marketService.evolveMarketPrices();
                this.marketService.replenishMarketInventory();
                this._applyGarnishment();
                this.gameState.lastMarketUpdateDay = this.gameState.day;
            }

            if (this.gameState.intel.active && this.gameState.day > this.gameState.intel.active.endDay) this.gameState.intel.active = null;
            
            this.gameState.player.ownedShipIds.forEach(shipId => {
                if (shipId !== this.gameState.player.activeShipId) {
                    const ship = SHIPS[shipId];
                    const repairAmount = ship.maxHealth * CONFIG.PASSIVE_REPAIR_RATE;
                    this.gameState.player.shipStates[shipId].health = Math.min(ship.maxHealth, this.gameState.player.shipStates[shipId].health + repairAmount);
                }
            });

            if (this.gameState.player.debt > 0 && (this.gameState.day - this.gameState.lastInterestChargeDay) >= CONFIG.INTEREST_INTERVAL) {
                const interest = this.uiManager.hudManager.calculateWeeklyInterest(this.gameState.player);
                this.gameState.player.debt += interest;
                this.gameState.lastInterestChargeDay = this.gameState.day;
            }
        }
        this.gameState.setState({});
    }
    _resolveEventChoice(eventId, choiceIndex) { /* ... implementation unchanged ... */ }
    _applyEventEffects(outcome) { /* ... implementation unchanged ... */ }
    _checkAgeEvents() { /* ... implementation unchanged ... */ }
    _applyPerk(choice) { /* ... implementation unchanged ... */ }

    // --- Helpers & Internal Logic ---
    _getActiveShip() {
        const state = this.gameState;
        const activeId = state.player.activeShipId;
        return { id: activeId, ...SHIPS[activeId], ...state.player.shipStates[activeId] };
    }
    _getActiveInventory() { return this.gameState.player.inventories[this.gameState.player.activeShipId]; }
    _recordFinanceTransaction(type, amount) {
        this.gameState.player.financeHistory.push({ value: this.gameState.player.credits, type: type, amount: amount });
        while (this.gameState.player.financeHistory.length > CONFIG.FINANCE_HISTORY_LENGTH) {
            this.gameState.player.financeHistory.shift();
        }
    }
    _checkMilestones() { /* ... implementation unchanged ... */ }
    _checkHullWarnings(shipId) { /* ... implementation unchanged ... */ }
    _handleShipDestruction(shipId) { /* ... implementation unchanged ... */ }
    _gameOver(message) { /* ... implementation unchanged ... */ }
    showIntroSequence() { /* ... implementation unchanged ... */ }
    _applyGarnishment() { /* ... implementation unchanged ... */ }
}