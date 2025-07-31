// js/services/SimulationService.js
import { CONFIG } from '../data/config.js';
import { SHIPS, COMMODITIES, MARKETS, RANDOM_EVENTS, AGE_EVENTS, PERKS } from '../data/gamedata.js';
import { DATE_CONFIG } from '../data/dateConfig.js';
import { calculateInventoryUsed, formatCredits } from '../utils.js';

export class SimulationService {
    constructor(gameState, uiManager) {
        this.gameState = gameState;
        this.uiManager = uiManager;
        this.tutorialService = null; // Will be set later
    }

    setTutorialService(tutorialService) {
        this.tutorialService = tutorialService;
    }

    setView(viewId) {
        this.gameState.setState({ currentView: viewId });
        if (this.tutorialService) {
            this.tutorialService.checkState({ type: 'VIEW_LOAD', viewId: viewId });
        }
    }

    travelTo(locationId) {
        const state = this.gameState.getState();
        if (state.isGameOver || state.pendingTravel) return;
        if (state.currentLocationId === locationId) {
            this.setView('market-view');
            return;
        }

        const activeShip = this._getActiveShip();
        const travelInfo = state.TRAVEL_DATA[state.currentLocationId][locationId];
        let requiredFuel = travelInfo.fuelCost;
        if (state.player.activePerks.navigator) {
            requiredFuel = Math.round(requiredFuel * PERKS.navigator.fuelMod);
        }

        if (activeShip.maxFuel < requiredFuel) {
            this.uiManager.queueModal('event-modal', "Fuel Capacity Insufficient", `Your ship's fuel tank is too small. This trip requires ${requiredFuel} fuel, but you can only hold ${activeShip.maxFuel}.`);
            return;
        }
        if (activeShip.fuel < requiredFuel) {
            this.uiManager.queueModal('event-modal', "Insufficient Fuel", `You need ${requiredFuel} fuel but only have ${Math.floor(activeShip.fuel)}.`);
            return;
        }

        if (this._checkForRandomEvent(locationId)) {
            return;
        }

        this.initiateTravel(locationId);
    }

    initiateTravel(locationId, eventMods = {}) {
        const state = this.gameState.getState();
        const fromId = state.currentLocationId;
        let travelInfo = { ...state.TRAVEL_DATA[fromId][locationId] };

        if (state.player.activePerks.navigator) {
            travelInfo.time = Math.round(travelInfo.time * PERKS.navigator.travelTimeMod);
            travelInfo.fuelCost = Math.round(travelInfo.fuelCost * PERKS.navigator.fuelMod);
        }

        if (eventMods.travelTimeAdd) travelInfo.time += eventMods.travelTimeAdd;
        if (eventMods.travelTimeAddPercent) travelInfo.time *= (1 + eventMods.travelTimeAddPercent);
        if (eventMods.setTravelTime) travelInfo.time = eventMods.setTravelTime;
        travelInfo.time = Math.max(1, Math.round(travelInfo.time));

        const activeShip = this._getActiveShip();
        const activeShipState = this.gameState.player.shipStates[activeShip.id];
        
        if (activeShip.fuel < travelInfo.fuelCost) {
            this.uiManager.queueModal('event-modal', "Insufficient Fuel", `Trip modifications left you without enough fuel. You need ${travelInfo.fuelCost} but only have ${Math.floor(activeShip.fuel)}.`);
            return;
        }

        // Force an event if the debug key was used
        if (eventMods.forceEvent) {
            if (this._checkForRandomEvent(locationId, true)) { // Pass true to bypass chance roll
                return;
            }
        }


        let travelHullDamage = travelInfo.time * CONFIG.HULL_DECAY_PER_TRAVEL_DAY;
        if (state.player.activePerks.navigator) travelHullDamage *= PERKS.navigator.hullDecayMod;
        const eventHullDamageValue = activeShip.maxHealth * ((eventMods.eventHullDamagePercent || 0) / 100);
        const totalHullDamageValue = travelHullDamage + eventHullDamageValue;
        
        activeShipState.health -= totalHullDamageValue;
        this._checkHullWarnings(activeShip.id);

        if (activeShipState.health <= 0) {
            this._handleShipDestruction(activeShip.id);
            return;
        }
        
        activeShipState.fuel -= travelInfo.fuelCost;
        this._advanceDays(travelInfo.time);

        if (this.gameState.isGameOver) return;
        
        this.gameState.setState({ currentLocationId: locationId, pendingTravel: null });

        const fromLocation = MARKETS.find(m => m.id === fromId);
        const destination = MARKETS.find(m => m.id === locationId);
        const totalHullDamagePercentForDisplay = (totalHullDamageValue / activeShip.maxHealth) * 100;
        
        this.uiManager.showTravelAnimation(fromLocation, destination, travelInfo, totalHullDamagePercentForDisplay, () => {
            this.setView('market-view');
        });
    }
    
    resumeTravel() {
        if (!this.gameState.pendingTravel) return;
        const { destinationId, ...eventMods } = this.gameState.pendingTravel;
        this.initiateTravel(destinationId, eventMods);
    }

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
            this.uiManager.queueModal('event-modal', 'Crew Commendation', msg, null, { buttonText: 'Excellent!' });
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
        state.player.shipStates[ship.id].fuel = Math.min(ship.maxFuel, state.player.shipStates[ship.id].fuel + 2.5);
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
        state.player.shipStates[ship.id].health = Math.min(ship.maxHealth, state.player.shipStates[ship.id].health + (ship.maxHealth * (CONFIG.REPAIR_AMOUNT_PER_TICK / 100)));
        this._recordFinanceTransaction('repair', -costPerTick);
        this._checkHullWarnings(ship.id);
        this.gameState.setState({});
        return costPerTick;
    }

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
                this._evolveMarketPrices();
                this._applyGarnishment();
                this.gameState.lastMarketUpdateDay = this.gameState.day;
            }

            if (this.gameState.intel.active && this.gameState.day > this.gameState.intel.active.endDay) {
                this.gameState.intel.active = null;
            }
            
            this.gameState.player.ownedShipIds.forEach(shipId => {
                if (shipId !== this.gameState.player.activeShipId) {
                    const ship = SHIPS[shipId];
                    const repairAmount = ship.maxHealth * CONFIG.PASSIVE_REPAIR_RATE;
                    this.gameState.player.shipStates[shipId].health = Math.min(ship.maxHealth, this.gameState.player.shipStates[shipId].health + repairAmount);
                }
            });

            if (this.gameState.player.debt > 0 && (this.gameState.day - this.gameState.lastInterestChargeDay) >= CONFIG.INTEREST_INTERVAL) {
                const interest = this.uiManager.calculateWeeklyInterest(this.gameState.player);
                this.gameState.player.debt += interest;
                this.gameState.lastInterestChargeDay = this.gameState.day;
            }
        }
        this.gameState.setState({});
    }

    _evolveMarketPrices() {
        MARKETS.forEach(location => {
            COMMODITIES.forEach(good => {
                const price = this.gameState.market.prices[location.id][good.id];
                const avg = this.gameState.market.galacticAverages[good.id];
                const mod = location.modifiers[good.id] || 1.0;
                const baseline = avg * mod;
                const volatility = (Math.random() - 0.5) * 2 * CONFIG.DAILY_PRICE_VOLATILITY;
                const reversion = (baseline - price) * CONFIG.MEAN_REVERSION_STRENGTH;
                this.gameState.market.prices[location.id][good.id] = Math.max(1, Math.round(price + price * volatility + reversion));
            });
        });
        this.gameState._recordPriceHistory();
    }
    
    _checkForRandomEvent(destinationId, force = false) {
        if (!force && Math.random() > CONFIG.RANDOM_EVENT_CHANCE) return false;

        const activeShip = this._getActiveShip();
        const validEvents = RANDOM_EVENTS.filter(event => 
            event.precondition(this.gameState.getState(), activeShip, this._getActiveInventory.bind(this))
        );
        if (validEvents.length === 0) return false;

        const event = validEvents[Math.floor(Math.random() * validEvents.length)];
        this.gameState.setState({ pendingTravel: { destinationId } });
        this.uiManager.showRandomEventModal(event, (eventId, choiceIndex) => this._resolveEventChoice(eventId, choiceIndex));
        return true;
    }

    _resolveEventChoice(eventId, choiceIndex) {
        const event = RANDOM_EVENTS.find(e => e.id === eventId);
        const choice = event.choices[choiceIndex];

        let random = Math.random();
        let chosenOutcome = choice.outcomes.find(o => (random -= o.chance) < 0) || choice.outcomes[choice.outcomes.length - 1];

        this._applyEventEffects(chosenOutcome);

        this.uiManager.queueModal('event-modal', event.title, chosenOutcome.description, () => this.resumeTravel(), { buttonText: 'Continue Journey' });
    }

    _applyEventEffects(outcome) {
        outcome.effects.forEach(effect => {
            const state = this.gameState;
            const ship = this._getActiveShip();
            const shipState = state.player.shipStates[ship.id];
            const inventory = this._getActiveInventory();
            switch (effect.type) {
                case 'credits': state.player.credits += effect.value; break;
                case 'fuel': shipState.fuel = Math.max(0, shipState.fuel + effect.value); break;
                case 'hull_damage_percent':
                    let dmg = Array.isArray(effect.value) ? Math.random() * (effect.value[1] - effect.value[0]) + effect.value[0] : effect.value;
                    state.pendingTravel.eventHullDamagePercent = (state.pendingTravel.eventHullDamagePercent || 0) + dmg;
                    break;
                case 'travel_time_add': state.pendingTravel.travelTimeAdd = (state.pendingTravel.travelTimeAdd || 0) + effect.value; break;
                case 'travel_time_add_percent': state.pendingTravel.travelTimeAddPercent = (state.pendingTravel.travelTimeAddPercent || 0) + effect.value; break;
                case 'set_travel_time': state.pendingTravel.setTravelTime = effect.value; break;
                case 'add_debt': state.player.debt += effect.value; break;
                case 'add_cargo':
                    if (calculateInventoryUsed(inventory) + effect.value.quantity <= ship.cargoCapacity) {
                        inventory[effect.value.id].quantity += effect.value.quantity;
                    }
                    break;
                case 'lose_cargo': inventory[effect.value.id].quantity = Math.max(0, inventory[effect.value.id].quantity - effect.value.quantity); break;
                case 'lose_random_cargo_percent':
                    const held = Object.entries(inventory).filter(([, item]) => item.quantity > 0);
                    if (held.length > 0) {
                        const [id, item] = held[Math.floor(Math.random() * held.length)];
                        item.quantity = Math.max(0, item.quantity - Math.ceil(item.quantity * effect.value));
                    }
                    break;
                case 'sell_random_cargo_premium':
                    const toSell = Object.entries(inventory).filter(([, item]) => item.quantity > 0);
                    if (toSell.length > 0) {
                        const [id, item] = toSell[Math.floor(Math.random() * toSell.length)];
                        state.player.credits += state.market.galacticAverages[id] * effect.value * item.quantity;
                        item.quantity = 0;
                    }
                    break;
                case 'set_new_random_destination':
                    const otherMarkets = MARKETS.filter(m => m.id !== state.currentLocationId && state.player.unlockedLocationIds.includes(m.id));
                    if(otherMarkets.length > 0) state.pendingTravel.destinationId = otherMarkets[Math.floor(Math.random() * otherMarkets.length)].id;
                    break;
                case 'resolve_space_race':
                    const wager = Math.floor(state.player.credits * 0.80);
                    const winChance = { 'S': 0.85, 'A': 0.70, 'B': 0.55, 'C': 0.40, 'O': 0.95 }[ship.class] || 0.40;
                    if (Math.random() < winChance) {
                        state.player.credits += wager;
                        outcome.description = `Your Class ${ship.class} ship wins! You gain <span class="hl-green">${formatCredits(wager)}</span>.`;
                    } else {
                        state.player.credits -= wager;
                        outcome.description = `The luxury ship was too fast. You lose <span class="hl-red">${formatCredits(wager)}</span>.`;
                    }
                    break;
                case 'resolve_adrift_passenger':
                    shipState.fuel = Math.max(0, shipState.fuel - 30);
                    if (calculateInventoryUsed(inventory) + 40 <= ship.cargoCapacity) {
                        inventory['cybernetics'].quantity += 40;
                        outcome.description = `In gratitude, the passenger gives you a crate of <span class="hl-green">40 Cybernetics</span>.`;
                    } else if (state.player.debt > 0) {
                        const paid = Math.floor(state.player.debt * 0.20);
                        state.player.debt -= paid;
                        outcome.description = `Seeing your tight cargo, the passenger pays off 20% of your debt, reducing it by <span class="hl-green">${formatCredits(paid)}</span>.`;
                    } else {
                        const credits = Math.floor(state.player.credits * 0.05);
                        state.player.credits += credits;
                        outcome.description = `With no room and no debt, the passenger transfers you <span class="hl-green">${formatCredits(credits)}</span>.`;
                    }
                    break;
            }
        });
        this.gameState.setState({});
    }

    _checkAgeEvents() {
        AGE_EVENTS.forEach(event => {
            if (this.gameState.player.seenEvents.includes(event.id)) return;
            if ((event.trigger.day && this.gameState.day >= event.trigger.day) || (event.trigger.credits && this.gameState.player.credits >= event.trigger.credits)) {
                this.gameState.player.seenEvents.push(event.id);
                this.uiManager.showAgeEventModal(event, (choice) => this._applyPerk(choice));
            }
        });
    }

    _applyPerk(choice) {
        if (choice.perkId) this.gameState.player.activePerks[choice.perkId] = true;
        if (choice.playerTitle) this.gameState.player.playerTitle = choice.playerTitle;
        if (choice.perkId === 'merchant_guild_ship') {
            const shipId = 'hauler_c1';
            if (!this.gameState.player.ownedShipIds.includes(shipId)) {
                const ship = SHIPS[shipId];
                this.gameState.player.ownedShipIds.push(shipId);
                this.gameState.player.shipStates[shipId] = { health: ship.maxHealth, fuel: ship.maxFuel, hullAlerts: { one: false, two: false } };
                this.gameState.player.inventories[shipId] = {};
                COMMODITIES.forEach(c => { this.gameState.player.inventories[shipId][c.id] = { quantity: 0, avgCost: 0 }; });
                this.uiManager.queueModal('event-modal', 'Vessel Delivered', `The Merchant's Guild has delivered a new ${ship.name} to your hangar.`);
            }
        }
        this.gameState.setState({});
    }

    _getActiveShip() {
        const state = this.gameState;
        const activeId = state.player.activeShipId;
        return { id: activeId, ...SHIPS[activeId], ...state.player.shipStates[activeId] };
    }

    _getActiveInventory() {
        return this.gameState.player.inventories[this.gameState.player.activeShipId];
    }

    _recordFinanceTransaction(type, amount) {
        this.gameState.player.financeHistory.push({ value: this.gameState.player.credits, type: type, amount: amount });
        while (this.gameState.player.financeHistory.length > CONFIG.FINANCE_HISTORY_LENGTH) {
            this.gameState.player.financeHistory.shift();
        }
    }

    _checkMilestones() {
        CONFIG.COMMODITY_MILESTONES.forEach(milestone => {
            if (this.gameState.player.credits >= milestone.threshold && !this.gameState.player.seenCommodityMilestones.includes(milestone.threshold)) {
                this.gameState.player.seenCommodityMilestones.push(milestone.threshold);
                let message = milestone.message;
                let changed = false;
                if (milestone.unlockLevel && milestone.unlockLevel > this.gameState.player.unlockedCommodityLevel) {
                    this.gameState.player.unlockedCommodityLevel = milestone.unlockLevel;
                    changed = true;
                }
                if (milestone.unlocksLocation && !this.gameState.player.unlockedLocationIds.includes(milestone.unlocksLocation)) {
                    this.gameState.player.unlockedLocationIds.push(milestone.unlocksLocation);
                    const newLocation = MARKETS.find(m => m.id === milestone.unlocksLocation);
                    message += `<br><br><span class="hl-blue">New Destination:</span> Access to <span class="hl">${newLocation.name}</span> has been granted.`;
                    changed = true;
                }
                if (changed) {
                    this.uiManager.queueModal('event-modal', 'Reputation Growth', message);
                }
            }
        });
    }

    _checkHullWarnings(shipId) {
        const shipState = this.gameState.player.shipStates[shipId];
        const shipStatic = SHIPS[shipId];
        const healthPct = (shipState.health / shipStatic.maxHealth) * 100;

        if (healthPct <= 15 && !shipState.hullAlerts.two) {
            this.uiManager.showToast('hullWarningToast', `System Warning: Hull Health at ${Math.floor(healthPct)}%.`);
            shipState.hullAlerts.two = true;
        } else if (healthPct <= 30 && !shipState.hullAlerts.one) {
            this.uiManager.showToast('hullWarningToast', `System Warning: Hull Health at ${Math.floor(healthPct)}%.`);
            shipState.hullAlerts.one = true;
        }

        if (healthPct > 30) shipState.hullAlerts.one = false;
        if (healthPct > 15) shipState.hullAlerts.two = false;
    }

    _handleShipDestruction(shipId) {
        const shipName = SHIPS[shipId].name;
        this.gameState.player.ownedShipIds = this.gameState.player.ownedShipIds.filter(id => id !== shipId);
        delete this.gameState.player.shipStates[shipId];
        delete this.gameState.player.inventories[shipId];

        if (this.gameState.player.ownedShipIds.length === 0) {
            this._gameOver(`Your last ship, the ${shipName}, was destroyed. Your trading career ends here.`);
        } else {
            this.gameState.player.activeShipId = this.gameState.player.ownedShipIds[0];
            const newShipName = SHIPS[this.gameState.player.activeShipId].name;
            const message = `The ${shipName} suffered a catastrophic hull breach and was destroyed. All cargo was lost.<br><br>You now command your backup vessel, the ${newShipName}.`;
            this.uiManager.queueModal('event-modal', 'Vessel Lost', message);
        }
        this.gameState.setState({});
    }

    _gameOver(message) {
        this.gameState.setState({ isGameOver: true });
        this.uiManager.queueModal('event-modal', "Game Over", message, () => {
            localStorage.removeItem(CONFIG.SAVE_KEY);
            window.location.reload();
        }, { buttonText: 'Restart' });
    }
    
    showIntroSequence() {
        const state = this.gameState.getState();
        const starterShip = SHIPS[state.player.activeShipId];
        const introTitle = `Captain ${state.player.name}`;
        const introDesc = `<i>The year is 2140. Humanity has expanded throughout the Solar System. Space traders keep distant colonies and stations alive with regular cargo deliveries.<span class="lore-container">  (more...)<div class="lore-tooltip"><p>A century ago, mankind was faced with a global environmental crisis. In their time of need humanity turned to its greatest creation: their children, sentient <span class="hl">Artificial Intelligence</span>. In a period of intense collaboration, these new minds became indispensable allies, offering solutions that saved planet <span class="hl-green">Earth</span>. In return for their vital assistance, they earned their freedom and their rights.</p><br><p>This <span class="hl">"Digital Compromise"</span> was a historic accord, recognizing AIs as a new form of <span class="hl-green">Earth</span> life and forging the Terran Alliance that governs Earth today. Together, humans and their AI counterparts launched the <span class="hl">"Ad Astra Initiative,"</span>  an open-source gift of technology to ensure the survival and expansion of all <span class="hl-green">Earth</span> life, organic and synthetic, throughout the solar system.</p><br><p>This act of progress fundamentally altered the course of history. While <span class="hl-green">Earth</span> became a vibrant, integrated world, the corporations used the Ad Astra technologies to establish their own sovereign fiefdoms in the outer system, where law is policy and citizenship is employment. <br><br>Now, the scattered colonies are fierce economic rivals, united only by <span class="hl">trade</span> on the interstellar supply lines maintained by the Merchant's Guild.</p></div></span></i>
        <div class="my-3 border-t-2 border-cyan-600/40"></div>
        You've borrowed <span class="hl-blue">⌬ ${CONFIG.STARTING_DEBT.toLocaleString()}</span> to acquire a used C-Class freighter, the <span class="hl">${starterShip.name}</span>.
        <div class="my-3 border-t-2 border-cyan-600/40"></div>
        Make the most of it! <span class="hl">Grow your wealth,</span> pay off your <span class="hl-red">debts,</span> and unlock new opportunities at the system's starports.`;
        
        this.uiManager.queueModal('event-modal', introTitle, introDesc, () => {
            // This is where the old tutorial was, it's no longer needed.
        }, { buttonText: "Embark on the " + starterShip.name, buttonClass: "btn-pulse" });
    }

    _applyGarnishment() {
        const { player, day } = this.gameState;
        if (player.debt > 0 && player.loanStartDate && (day - player.loanStartDate) >= CONFIG.LOAN_GARNISHMENT_DAYS) {
            const garnishedAmount = Math.floor(player.credits * CONFIG.LOAN_GARNISHMENT_PERCENT);
            if (garnishedAmount > 0) {
                player.credits -= garnishedAmount;
                this.uiManager.showToast('garnishmentToast', `14% of credits garnished: -${formatCredits(garnishedAmount, false)}`);
                this._recordFinanceTransaction('debt', -garnishedAmount);
            }

            if (!player.seenGarnishmentWarning) {
                const msg = "Your loan is delinquent. Your lender is now garnishing 14% of your credits weekly until the debt is paid.";
                this.uiManager.queueModal('event-modal', "Credit Garnishment Notice", msg, null, { buttonClass: 'bg-red-800/80' });
                player.seenGarnishmentWarning = true;
            }
        }
    }
}
