// js/services/SimulationService.js
import { CONFIG } from '../data/config.js';
import { SHIPS, COMMODITIES, MARKETS, RANDOM_EVENTS, AGE_EVENTS, PERKS } from '../data/gamedata.js';
import { DATE_CONFIG } from '../data/dateConfig.js';
import { calculateInventoryUsed, formatCredits } from '../utils.js';

export class SimulationService {
    constructor(gameState, uiManager) {
        this.gameState = gameState;
        this.uiManager = uiManager;
    }

    // --- Core Game Actions ---
    setView(viewId) {
        this.gameState.setState({ currentView: viewId });
    }

    travelTo(locationId) {
        const state = this.gameState.getState();
        if (state.isGameOver || state.pendingTravel) return;
        if (state.currentLocationId === locationId) {
            this.setView('market-view');
            return;
        }

        let baseTravelInfo = { ...state.TRAVEL_DATA[state.currentLocationId][locationId] };
        if (state.player.activePerks.navigator) {
            baseTravelInfo.fuelCost = Math.round(baseTravelInfo.fuelCost * PERKS.navigator.fuelMod);
        }

        const activeShip = this._getActiveShip();
        if (activeShip.maxFuel < baseTravelInfo.fuelCost) {
            this.uiManager.queueModal('event-modal', "Fuel Capacity Insufficient", `Your ship's fuel tank is too small. This trip requires ${baseTravelInfo.fuelCost} fuel, but you can only hold ${activeShip.maxFuel}.`);
            return;
        }
        if (activeShip.fuel < baseTravelInfo.fuelCost) {
            this.uiManager.queueModal('event-modal', "Insufficient Fuel", `You need ${baseTravelInfo.fuelCost} fuel but only have ${Math.floor(activeShip.fuel)}.`);
            return;
        }

        if (this._checkForRandomEvent(locationId)) {
            return; // Event was triggered, travel is paused.
        }

        this.initiateTravel(locationId);
    }

    initiateTravel(locationId, eventMods = {}) {
        const state = this.gameState.getState();
        const fromId = state.currentLocationId;
        let travelInfo = { ...state.TRAVEL_DATA[fromId][locationId] };

        // Apply perks
        if (state.player.activePerks.navigator) {
            travelInfo.time = Math.round(travelInfo.time * PERKS.navigator.travelTimeMod);
            travelInfo.fuelCost = Math.round(travelInfo.fuelCost * PERKS.navigator.fuelMod);
        }

        // Apply event modifications
        if (eventMods.travelTimeAdd) travelInfo.time += eventMods.travelTimeAdd;
        if (eventMods.travelTimeAddPercent) travelInfo.time *= (1 + eventMods.travelTimeAddPercent);
        if (eventMods.setTravelTime) travelInfo.time = eventMods.setTravelTime;
        travelInfo.time = Math.max(1, Math.round(travelInfo.time));

        const activeShip = this._getActiveShip();
        const activeShipState = this.gameState.player.shipStates[activeShip.id];
        
        // Final fuel check after all mods
        if (activeShip.fuel < travelInfo.fuelCost) {
            this.uiManager.queueModal('event-modal', "Insufficient Fuel", `Trip modifications left you without enough fuel. You need ${travelInfo.fuelCost} but only have ${Math.floor(activeShip.fuel)}.`);
            return;
        }

        // Apply hull damage
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
        
        // Consume fuel and advance time
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

    _checkForRandomEvent(destinationId) {
        if (Math.random() > CONFIG.RANDOM_EVENT_CHANCE) return false;

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
    
    // --- Item & Ship Transactions ---
    buyItem(goodId, quantity) {
        if (this.gameState.isGameOver || quantity <= 0) return false;
        const state = this.gameState.getState();
        const price = this.uiManager.getItemPrice(state, goodId);
        const totalCost = price * quantity;
        const marketStock = state.market.inventory[state.currentLocationId][goodId].quantity;

        if (marketStock <= 0) { this.uiManager.queueModal('event-modal', "Sold Out", `This station has no more ${COMMODITIES.find(c=>c.id===goodId).name} available.`); return false; }
        if (quantity > marketStock) { this.uiManager.queueModal('event-modal', "Limited Stock", `This station only has ${marketStock} units available.`); return false; }
        
        const activeShip = this._getActiveShip();
        const activeInventory = this.gameState.player.inventories[activeShip.id];
        if (calculateInventoryUsed(activeInventory) + quantity > activeShip.cargoCapacity) {
             this.uiManager.queueModal('event-modal', "Cargo Hold Full", "You don't have enough space in your active ship's cargo hold.");
            return false;
        }
        if (state.player.credits < totalCost) { this.uiManager.queueModal('event-modal', "Insufficient Funds", "Your credit balance is too low."); return false; }

        this.gameState.market.inventory[state.currentLocationId][goodId].quantity -= quantity;
        const item = activeInventory[goodId];
        const newTotalValue = (item.quantity * item.avgCost) + totalCost;
        item.quantity += quantity;
        item.avgCost = newTotalValue / item.quantity;
        this.gameState.player.credits -= totalCost;

        this._recordFinanceTransaction('trade', -totalCost);
        this.gameState.setState({}); // Notify
        this._checkMilestones();
        return true;
    }

    sellItem(goodId, quantity) {
        if (this.gameState.isGameOver || quantity <= 0) return 0;
        const state = this.gameState.getState();
        const activeInventory = this.gameState.player.inventories[state.player.activeShipId];
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
        this.gameState.setState({}); // Notify
        this._checkMilestones();
        return totalSaleValue; // Return value for floating text
    }

    buyShip(shipId) {
        const ship = SHIPS[shipId];
        if (this.gameState.player.credits < ship.price) { this.uiManager.queueModal('event-modal', "Insufficient Funds", "You cannot afford this ship."); return false; }
        
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
        if (state.player.ownedShipIds.length <= 1) { this.uiManager.queueModal('event-modal', "Action Blocked", "You cannot sell your last remaining ship."); return false; }
        if (shipId === state.player.activeShipId) { this.uiManager.queueModal('event-modal', "Action Blocked", "You cannot sell your active ship."); return false; }
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

    // --- Financial Actions ---
    payOffDebt() {
        if (this.gameState.isGameOver) return;
        const { player } = this.gameState;
        if (player.credits < player.debt) { this.uiManager.queueModal('event-modal', "Insufficient Funds", "You can't afford to pay off your entire debt."); return; }

        if (player.debt > 0 && !player.initialDebtPaidOff) {
            const msg = `Captain ${player.name}, your strategic trading has put us on a path to success. The crew's morale is high.<br><br>The <span class='hl'>Starport</span> is now accessible!`;
            this.uiManager.queueModal('tutorial-modal', 'Crew Commendation', msg, () => {
                this.gameState.tutorials.success = true;
            }, { tutorialType: 'success' });
            this.gameState.player.starportUnlocked = true;
            this.gameState.player.initialDebtPaidOff = true;
        }

        this.gameState.player.credits -= player.debt;
        this._recordFinanceTransaction('loan', -player.debt);
        this.gameState.player.debt = 0;
        this.gameState.player.weeklyInterestAmount = 0;
        this.gameState.player.loanStartDate = null;
        this.gameState.setState({});
        this._checkMilestones();
    }
    
    takeLoan(loanData) {
        const { player, day } = this.gameState;
        if (player.debt > 0) { this.uiManager.queueModal('event-modal', "Loan Unavailable", `You must pay off your existing debt first.`); return; }
        if (player.credits < loanData.fee) { this.uiManager.queueModal('event-modal', "Unable to Secure Loan", `The financing fee is ${formatCredits(loanData.fee)}, but you only have ${formatCredits(player.credits)}.`); return; }

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
        const { player, currentLocationId } = this.gameState;
        if (player.credits < cost) { this.uiManager.queueModal('event-modal', "Insufficient Funds", "You can't afford this intel."); return; }
        
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
                startDay: this.gameState.day, 
                endDay: this.gameState.day + 100 
            };
        }
        this.gameState.setState({});
    }

    refuelTick() {
        const state = this.gameState;
        const ship = this._getActiveShip();
        if (ship.fuel >= ship.maxFuel) return;

        let costPerTick = MARKETS.find(m => m.id === state.currentLocationId).fuelPrice / 4;
        if (state.player.activePerks.venetian_syndicate && state.currentLocationId === 'loc_venus') {
            costPerTick *= (1 - PERKS.venetian_syndicate.fuelDiscount);
        }

        if (state.player.credits < costPerTick) return;

        state.player.credits -= costPerTick;
        state.player.shipStates[ship.id].fuel = Math.min(ship.maxFuel, ship.fuel + 2.5);
        this._recordFinanceTransaction('fuel', -costPerTick);
        this.gameState.setState({});
    }

    repairTick() {
        const state = this.gameState;
        const ship = this._getActiveShip();
        if (ship.health >= ship.maxHealth) return;
        
        let costPerTick = (ship.maxHealth * (CONFIG.REPAIR_AMOUNT_PER_TICK / 100)) * CONFIG.REPAIR_COST_PER_HP;
        if (state.player.activePerks.venetian_syndicate && state.currentLocationId === 'loc_venus') {
            costPerTick *= (1 - PERKS.venetian_syndicate.repairDiscount);
        }

        if (state.player.credits < costPerTick) return;
        
        state.player.credits -= costPerTick;
        state.player.shipStates[ship.id].health = Math.min(ship.maxHealth, ship.health + (ship.maxHealth * (CONFIG.REPAIR_AMOUNT_PER_TICK / 100)));
        this._recordFinanceTransaction('repair', -costPerTick);
        this._checkHullWarnings(ship.id);
        this.gameState.setState({});
    }

    // --- Event & Time Progression ---
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
                const yesterdayPrice = this.gameState.market.prices[location.id][good.id];
                const galacticAverage = this.gameState.market.galacticAverages[good.id];
                const locationModifier = location.modifiers[good.id] || 1.0;
                const localBaseline = galacticAverage * locationModifier;

                const volatility = (Math.random() - 0.5) * 2 * CONFIG.DAILY_PRICE_VOLATILITY;
                const reversionPull = (localBaseline - yesterdayPrice) * CONFIG.MEAN_REVERSION_STRENGTH;

                this.gameState.market.prices[location.id][good.id] = Math.max(1, Math.round(yesterdayPrice + (yesterdayPrice * volatility) + reversionPull));
            });
        });
        this._recordPriceHistory();
    }
    
    _resolveEventChoice(eventId, choiceIndex) {
        const event = RANDOM_EVENTS.find(e => e.id === eventId);
        const choice = event.choices[choiceIndex];

        let random = Math.random();
        let chosenOutcome = null;
        for (const outcome of choice.outcomes) {
            if (random < outcome.chance) {
                chosenOutcome = outcome;
                break;
            }
            random -= outcome.chance;
        }
        if (!chosenOutcome) chosenOutcome = choice.outcomes[choice.outcomes.length - 1];

        this._applyEventEffects(chosenOutcome);

        this.uiManager.queueModal('event-modal', event.title, chosenOutcome.description, () => {
            const { destinationId, ...eventMods } = this.gameState.pendingTravel;
            this.initiateTravel(destinationId, eventMods);
        }, { buttonText: 'Continue Journey' });
    }

    _applyEventEffects(chosenOutcome) {
        const effects = chosenOutcome.effects;
        const state = this.gameState;
        const activeShip = this._getActiveShip();
        const activeShipState = state.player.shipStates[activeShip.id];
        const activeInventory = this._getActiveInventory();

        effects.forEach(effect => {
            switch (effect.type) {
                case 'credits': state.player.credits += effect.value; break;
                case 'fuel': activeShipState.fuel = Math.max(0, activeShipState.fuel + effect.value); break;
                case 'hull_damage_percent':
                    let damage = Array.isArray(effect.value) ? Math.random() * (effect.value[1] - effect.value[0]) + effect.value[0] : effect.value;
                    state.pendingTravel.eventHullDamagePercent = (state.pendingTravel.eventHullDamagePercent || 0) + damage;
                    break;
                case 'travel_time_add': state.pendingTravel.travelTimeAdd = (state.pendingTravel.travelTimeAdd || 0) + effect.value; break;
                case 'travel_time_add_percent': state.pendingTravel.travelTimeAddPercent = (state.pendingTravel.travelTimeAddPercent || 0) + effect.value; break;
                case 'set_travel_time': state.pendingTravel.setTravelTime = effect.value; break;
                case 'add_debt': state.player.debt += effect.value; break;
                case 'add_cargo':
                    if (calculateInventoryUsed(activeInventory) + effect.value.quantity <= activeShip.cargoCapacity) {
                        activeInventory[effect.value.id].quantity += effect.value.quantity;
                    }
                    break;
                case 'lose_cargo':
                    activeInventory[effect.value.id].quantity = Math.max(0, activeInventory[effect.value.id].quantity - effect.value.quantity);
                    break;
                case 'lose_random_cargo_percent':
                    const heldItems = Object.entries(activeInventory).filter(([, item]) => item.quantity > 0);
                    if (heldItems.length > 0) {
                        const [randomItemId] = heldItems[Math.floor(Math.random() * heldItems.length)];
                        const amountToLose = Math.ceil(activeInventory[randomItemId].quantity * effect.value);
                        activeInventory[randomItemId].quantity -= amountToLose;
                    }
                    break;
                case 'sell_random_cargo_premium':
                    const itemsToSell = Object.entries(activeInventory).filter(([, item]) => item.quantity > 0);
                    if (itemsToSell.length > 0) {
                        const [itemId, item] = itemsToSell[Math.floor(Math.random() * itemsToSell.length)];
                        const salePrice = state.market.galacticAverages[itemId] * effect.value;
                        state.player.credits += salePrice * item.quantity;
                        item.quantity = 0;
                    }
                    break;
                case 'set_new_random_destination':
                    const otherMarkets = MARKETS.filter(m => m.id !== state.currentLocationId && state.player.unlockedLocationIds.includes(m.id));
                    if(otherMarkets.length > 0) {
                        state.pendingTravel.destinationId = otherMarkets[Math.floor(Math.random() * otherMarkets.length)].id;
                    }
                    break;
                case 'resolve_space_race': {
                    const wager = Math.floor(state.player.credits * 0.80);
                    const winChance = { 'S': 0.85, 'A': 0.70, 'B': 0.55, 'C': 0.40, 'O': 0.95 }[activeShip.class] || 0.40;
                    if (Math.random() < winChance) {
                        state.player.credits += wager;
                        chosenOutcome.description = `Your Class ${activeShip.class} ship's superior handling wins the day! You gain <span class="hl-green">${formatCredits(wager)}</span>.`;
                    } else {
                        state.player.credits -= wager;
                        chosenOutcome.description = `The luxury ship's raw power was too much. You lose <span class="hl-red">${formatCredits(wager)}</span>.`;
                    }
                    break;
                }
                case 'resolve_adrift_passenger': {
                    activeShipState.fuel = Math.max(0, activeShipState.fuel - 30);
                    const spaceAvailable = activeShip.cargoCapacity - calculateInventoryUsed(activeInventory);
                    if (spaceAvailable >= 40) {
                        activeInventory['cybernetics'].quantity += 40;
                        chosenOutcome.description = `In gratitude, the passenger gives you a crate of high-grade cybernetics. You gain <span class="hl-green">40 Cybernetics</span>.`;
                    } else if (state.player.debt > 0) {
                        const debtPaid = Math.floor(state.player.debt * 0.20);
                        state.player.debt -= debtPaid;
                        chosenOutcome.description = `Seeing your tight cargo hold, the passenger pays off 20% of your debt, reducing it by <span class="hl-green">${formatCredits(debtPaid)}</span>.`;
                    } else {
                        const creditsGained = Math.floor(state.player.credits * 0.05);
                        state.player.credits += creditsGained;
                        chosenOutcome.description = `With no room for cargo and no debts to pay, the passenger transfers you <span class="hl-green">${formatCredits(creditsGained)}</span>.`;
                    }
                    break;
                }
            }
        });
        this.gameState.setState({});
    }

    _checkAgeEvents() {
        AGE_EVENTS.forEach(event => {
            if (this.gameState.player.seenEvents.includes(event.id)) return;
            let triggerMet = false;
            if (event.trigger.day && this.gameState.day >= event.trigger.day) triggerMet = true;
            if (event.trigger.credits && this.gameState.player.credits >= event.trigger.credits) triggerMet = true;

            if (triggerMet) {
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
                 this.gameState.player.ownedShipIds.push(shipId);
                const ship = SHIPS[shipId];
                this.gameState.player.shipStates[shipId] = { health: ship.maxHealth, fuel: ship.maxFuel, hullAlerts: { one: false, two: false } };
                this.gameState.player.inventories[shipId] = {};
                COMMODITIES.forEach(c => { this.gameState.player.inventories[shipId][c.id] = { quantity: 0, avgCost: 0 }; });
                this.uiManager.queueModal('event-modal', 'Vessel Delivered', `The Merchant's Guild has delivered a new ${ship.name} to your hangar.`);
            }
        }
        this.gameState.setState({});
    }

    // --- Private Helpers ---
    _getActiveShip() {
        const state = this.gameState.getState();
        const activeId = state.player.activeShipId;
        return { id: activeId, ...SHIPS[activeId], ...state.player.shipStates[activeId] };
    }
    _getActiveInventory() {
        const state = this.gameState.getState();
        return state.player.inventories[state.player.activeShipId];
    }
    _recordFinanceTransaction(type, amount) {
        this.gameState.player.financeHistory.push({ value: this.gameState.player.credits, type: type, amount: amount });
        if (this.gameState.player.financeHistory.length > CONFIG.FINANCE_HISTORY_LENGTH) {
            this.gameState.player.financeHistory.shift();
        }
    }
     _recordPriceHistory() {
        MARKETS.forEach(market => {
            COMMODITIES.forEach(good => {
                const history = this.gameState.market.priceHistory[market.id][good.id];
                history.push({ day: this.gameState.day, price: this.gameState.market.prices[market.id][good.id] });
                if (history.length > CONFIG.PRICE_HISTORY_LENGTH) history.shift();
            });
        });
    }
    _checkMilestones() {
        CONFIG.COMMODITY_MILESTONES.forEach(milestone => {
            if (this.gameState.player.credits >= milestone.threshold && !this.gameState.player.seenCommodityMilestones.includes(milestone.threshold)) {
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
                    this.gameState.player.seenCommodityMilestones.push(milestone.threshold);
                    this.uiManager.queueModal('tutorial-modal', 'Reputation Growth', message);
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
            this._gameOver(`Your last ship, the ${shipName}, was destroyed. Your trading career ends here, lost to the void.`);
        } else {
            this.gameState.player.activeShipId = this.gameState.player.ownedShipIds[0];
            const newShipName = SHIPS[this.gameState.player.activeShipId].name;
            const message = `The ${shipName} suffered a catastrophic hull breach and was destroyed. All cargo was lost.<br><br>You were rescued and now command your backup vessel, the ${newShipName}.`;
            this.uiManager.queueModal('event-modal', 'Vessel Lost', message);
        }
        this.gameState.setState({});
    }
    _gameOver(message) {
        this.gameState.isGameOver = true;
        this.uiManager.queueModal('event-modal', "Game Over", message, () => {
            localStorage.removeItem(CONFIG.SAVE_KEY);
            window.location.reload();
        }, { buttonText: 'Restart' });
        this.gameState.setState({});
    }

    showIntroSequence() {
        const state = this.gameState.getState();
        const starterShip = SHIPS[state.player.activeShipId];
        const introTitle = `Captain ${state.player.name}`;
        const introDesc = `<i>The year is 2140. Humanity has expanded throughout the Solar System. Space traders keep distant colonies and stations alive with regular cargo deliveries.<span class="lore-container">  (more...)<div class="lore-tooltip"><p>A century ago, mankind was faced with a global environmental crisis. In their time of need humanity turned to its greatest creation: their children, sentient <span class="hl">Artificial Intelligence</span>. In a period of intense collaboration, these new minds became indispensable allies, offering solutions that saved planet <span class="hl-green">Earth</span>. In return for their vital assistance, they earned their freedom and their rights.</p><br><p>This <span class="hl">"Digital Compromise"</span> was a historic accord, recognizing AIs as a new form of <span class="hl-green">Earth</span> life and forging the Terran Alliance that governs Earth today. Together, humans and their AI counterparts launched the <span class="hl">"Ad Astra Initiative,"</span>  an open-source gift of technology to ensure the survival and expansion of all <span class="hl-green">Earth</span> life, organic and synthetic, throughout the solar system.</p><br><p>This act of progress fundamentally altered the course of history. While <span class="hl-green">Earth</span> became a vibrant, integrated world, the corporations used the Ad Astra technologies to establish their own sovereign fiefdoms in the outer system, where law is policy and citizenship is employment. <br><br>Now, the scattered colonies are fierce economic rivals, united only by <span class="hl">trade</span> on the interstellar supply lines maintained by the Merchant's Guild.</p></div></span></i>
        <div class="my-3 border-t-2 border-cyan-600/40"></div>
        You've borrowed <span class="hl-blue">⌬ ${CONFIG.STARTING_DEBT.toLocaleString()} Credits</span> to acquire a used C-Class freighter, the <span class="hl">${starterShip.name}</span>.
        <div class="my-3 border-t-2 border-cyan-600/40"></div>
        Make the most of it! <span class="hl">Grow your wealth,</span> pay off your <span class="hl-red">debts,</span> and unlock new opportunities at the system's starports.`;
        
        this.uiManager.queueModal('event-modal', introTitle, introDesc, null, { buttonText: "Embark on the " + starterShip.name, buttonClass: "btn-pulse" });
    }

    _applyGarnishment() {
        const { player, day } = this.gameState;
        if (player.debt > 0 && player.loanStartDate && (day - player.loanStartDate) >= CONFIG.LOAN_GARNISHMENT_DAYS) {
            const garnishedAmount = Math.floor(player.credits * CONFIG.LOAN_GARNISHMENT_PERCENT);
            if (garnishedAmount > 0) {
                player.credits -= garnishedAmount;
                this.uiManager.showToast('garnishmentToast', `14% of credits garnished for debt: -${formatCredits(garnishedAmount, false)}`);
                this._recordFinanceTransaction('debt', -garnishedAmount);
            }

            if (!player.seenGarnishmentWarning) {
                const msg = "Your loan is delinquent. Your lender is now garnishing 14% of your credits weekly until the debt is paid.";
                this.uiManager.queueModal('event-modal', "Credit Garnishment Notice", msg, null, { buttonText: 'Understood', buttonClass: 'bg-red-800/80' });
                player.seenGarnishmentWarning = true;
            }
        }
    }
}