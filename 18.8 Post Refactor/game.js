document.addEventListener('DOMContentLoaded', () => {

    let gameState = {};
    let refuelInterval = null;
    let repairInterval = null;
    let refuelButtonElement = null;
    let repairButtonElement = null;
    let tutorialTimeout = null;
    let TRAVEL_DATA = {};
    let activeGraphAnchor = null;
    let modalQueue = [];

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

    function getActiveShip() {
        if (!gameState || !gameState.player) return null;
        const activeId = gameState.player.activeShipId;
        if (!activeId || !gameState.player.shipStates[activeId]) return null;
        const staticData = SHIPS[activeId];
        const dynamicState = gameState.player.shipStates[activeId];
        return { id: activeId, ...staticData, ...dynamicState };
    }

    function getActiveInventory() {
        if (!gameState || !gameState.player || !gameState.player.inventories) return {};
        return gameState.player.inventories[gameState.player.activeShipId];
    }

    function formatCredits(amount, withSymbol = true) {
        const num = Math.floor(amount);
        const prefix = withSymbol ? '⌬ ' : '';
        if (num >= 1e12) return `${prefix}${(num / 1e12).toFixed(2)}T`;
        if (num >= 1e9) return `${prefix}${(num / 1e9).toFixed(2)}B`;
        if (num >= 1e6) return `${prefix}${(num / 1e6).toFixed(2)}M`;
        if (num >= 1e3) return `${prefix}${(num / 1e3).toFixed(1)}k`;
        return `${prefix}${num.toLocaleString()}`;
    }

    function calculateInventoryUsed(inventory) {
         if (!inventory) return 0;
        return Object.values(inventory).reduce((acc, item) => acc + item.quantity, 0);
    }

    function calculateWeeklyInterest() {
        if (!gameState || !gameState.player || gameState.player.debt <= 0) {
            return 0;
        }
        if (gameState.player.weeklyInterestAmount > 0) {
            return gameState.player.weeklyInterestAmount;
        }
        if (gameState.player.debt === CONFIG.STARTING_DEBT) {
            return CONFIG.STARTING_DEBT_INTEREST;
        }
        return Math.ceil(gameState.player.debt * 0.01);
    }

    function calculateGalacticAverages() {
        gameState.market.galacticAverages = {};
        COMMODITIES.forEach(good => {
            gameState.market.galacticAverages[good.id] = (good.basePriceRange[0] + good.basePriceRange[1]) / 2;
        });
    }

    function getTierAvailability(tier) {
        switch (tier) {
            case 1: return { min: 6, max: 240, skew: 250 };
            case 2: return { min: 4, max: 200, skew: 100 };
            case 3: return { min: 3, max: 120, skew: 32 };
            case 4: return { min: 2, max: 40, skew: 17 };
            case 5: return { min: 1, max: 20, skew: 13 };
            case 6: return { min: 0, max: 20, skew: 5 };
            case 7: return { min: 0, max: 10, skew: 1 };
            default: return { min: 0, max: 5, skew: 1 };
        }
    }

    function skewedRandom(min, max, skew) {
        let rand = (Math.random() + Math.random() + Math.random()) / 3;
        return Math.floor(min + (max - min) * Math.pow(rand, 0.5));
    }

    function showNamePrompt() {
        const modal = document.getElementById('name-modal');
        const buttonContainer = document.getElementById('name-modal-buttons');
        const nameInput = document.getElementById('player-name-input');
        buttonContainer.innerHTML = '';

        const confirmButton = document.createElement('button');
        confirmButton.id = 'confirm-name-button';
        confirmButton.className = 'btn px-6 py-2 w-full sm:w-auto';
        confirmButton.textContent = 'Confirm';
        confirmButton.onclick = () => {
            const playerName = nameInput.value.trim() || 'Captain';
            modal.classList.add('hidden');
            startNewGame(playerName);
        };
        buttonContainer.appendChild(confirmButton);

        nameInput.addEventListener('keyup', (e) => {
            if (e.key === 'Enter') {
                confirmButton.click();
            }
        });
        modal.classList.remove('hidden');
        nameInput.focus();
    }

    function startNewGame(playerName) {
        TRAVEL_DATA = procedurallyGenerateTravelData(MARKETS);
        gameState = {
            day: 1, lastInterestChargeDay: 1, lastMarketUpdateDay: 1, currentLocationId: 'loc_mars', currentView: 'travel-view', isGameOver: false, popupsDisabled: false,
            pendingTravel: null,
            player: {
                name: playerName,
                playerTitle: 'Captain',
                playerAge: 24,
                lastBirthdayYear: DATE_CONFIG.START_YEAR, // NEW: Track last birthday
                birthdayProfitBonus: 0, // NEW: Track birthday bonus
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
                shipStates: {
                    'starter': { health: SHIPS.starter.maxHealth, fuel: SHIPS.starter.maxFuel, hullAlerts: { one: false, two: false } }
                },
                inventories: {
                    'starter': {}
                }
             },
            market: {
                prices: {},
                inventory: {},
                galacticAverages: {},
                priceHistory: {},
            },
            intel: { active: null, available: {} },
            tutorials: { navigation: false, market: false, maintenance: false, success: false, starport: false }
        };
        MARKETS.forEach(market => {
            gameState.market.priceHistory[market.id] = {};
            COMMODITIES.forEach(c => {
                gameState.market.priceHistory[market.id][c.id] = [];
            });
        });
        COMMODITIES.forEach(c => {
            gameState.player.inventories.starter[c.id] = { quantity: 0, avgCost: 0 };
        });
        MARKETS.forEach(m => {
            gameState.intel.available[m.id] = (Math.random() < CONFIG.INTEL_CHANCE);
            gameState.market.inventory[m.id] = {};
            COMMODITIES.forEach(c => {
                const avail = getTierAvailability(c.tier);

                let quantity = skewedRandom(avail.min, avail.max, avail.skew);
                if (m.modifiers[c.id] && m.modifiers[c.id] > 1.0) quantity = Math.floor(quantity * 1.5);
                if (m.specialDemand && m.specialDemand[c.id]) quantity = 0;
                gameState.market.inventory[m.id][c.id] = { quantity: Math.max(0, quantity) };
             });
        });
        calculateGalacticAverages();
        seedInitialMarketPrices();
        recordPriceHistory();

        const introTitle = `Captain ${gameState.player.name}`;
        const starterShip = getActiveShip();
        const introDesc = `<i>The year is 2140. Humanity has expanded throughout the Solar System. Space traders keep distant colonies and stations alive with regular cargo deliveries.<span class="lore-container">  (more...)<div class="lore-tooltip"><p>A century ago, mankind was faced with a global environmental crisis. In their time of need humanity turned to its greatest creation: their children, sentient <span class="hl">Artificial Intelligence</span>. In a period of intense collaboration, these new minds became indispensable allies, offering solutions that saved planet <span class="hl-green">Earth</span>. In return for their vital assistance, they earned their freedom and their rights.</p><br><p>This <span class="hl">"Digital Compromise"</span> was a historic accord, recognizing AIs as a new form of <span class="hl-green">Earth</span> life and forging the Terran Alliance that governs Earth today. Together, humans and their AI counterparts launched the <span class="hl">"Ad Astra Initiative,"</span>  an open-source gift of technology to ensure the survival and expansion of all <span class="hl-green">Earth</span> life, organic and synthetic, throughout the solar system.</p><br><p>This act of progress fundamentally altered the course of history. While <span class="hl-green">Earth</span> became a vibrant, integrated world, the corporations used the Ad Astra technologies to establish their own sovereign fiefdoms in the outer system, where law is policy and citizenship is employment. <br><br>Now, the scattered colonies are fierce economic rivals, united only by <span class="hl">trade</span> on the interstellar supply lines maintained by the Merchant's Guild.</p></div></span></i>
        <div class="my-3 border-t-2 border-cyan-600/40"></div>
        You've borrowed <span class="hl-blue">⌬ ${CONFIG.STARTING_DEBT.toLocaleString()} Credits</span> to acquire a used C-Class freighter, the <span class="hl">${starterShip.name}</span>.
        <div class="my-3 border-t-2 border-cyan-600/40"></div>
        Make the most of it! <span class="hl">Grow your wealth,</span> pay off your <span class="hl-red">debts,</span> and unlock new opportunities at the system's starports.`;
        queueModal('event-modal', introTitle, introDesc, () => {
            showTravelView();
            const navDesc = `This is the navigational interface. <br>From here you may fly to other stations to <span class="hl">trade cargo</span> throughout the solar system.<br><br>Traveling between stations consumes <span class='hl-blue pulse-blue-glow'>fuel</span> and  wears down your vessel's <span class='hl-green pulse-green-glow'>hull</span>. Both can be restored at any station. Flying with a poorly maintained ship is <span class="hl-red">dangerous</span>. <br><br>You are currently docked at <span class="hl">Mars</span>.`;
            tutorialTimeout = setTimeout(() => {
                if (document.getElementById('travel-view').style.display !== 'none' && !gameState.tutorials.navigation) {
                    queueModal('tutorial-modal', 'Navigation', navDesc, () => { gameState.tutorials.navigation = true; }, { tutorialType: 'navigation', buttonText: 'Return to Navigation' });
                }
            }, 2000);
        }, { buttonText: "Embark on the " + starterShip.name, buttonClass: "btn-pulse" });
    }

    function travelTo(locationId) {
        if (gameState.isGameOver || gameState.pendingTravel) return;
        const fromId = gameState.currentLocationId;
        if (fromId === locationId) {
            showMarketView();
            return;
        }

        let baseTravelInfo = { ...TRAVEL_DATA[fromId][locationId] };
        if (gameState.player.activePerks.navigator) {
            baseTravelInfo.fuelCost = Math.round(baseTravelInfo.fuelCost * PERKS.navigator.fuelMod);
        }

        const activeShip = getActiveShip();
        if (activeShip.maxFuel < baseTravelInfo.fuelCost) {
            queueModal('event-modal', "Fuel Capacity Insufficient", `Your ship's fuel tank is too small for this journey. The trip requires ${baseTravelInfo.fuelCost} fuel, but your ship can only hold ${activeShip.maxFuel}.`);
            return;
        }
        if (activeShip.fuel < baseTravelInfo.fuelCost) {
            queueModal('event-modal', "Insufficient Fuel", `You do not have enough fuel for this journey. The trip requires ${baseTravelInfo.fuelCost} fuel, but you only have ${Math.floor(activeShip.fuel)}.`);
            return;
        }

        const eventTriggered = checkForRandomEvent(locationId);
        if (eventTriggered) {
            return;
        }

        initiateTravel(locationId);
    }

    function initiateTravel(locationId, eventMods = {}) {
        const fromId = gameState.currentLocationId;
        let travelInfo = { ...TRAVEL_DATA[fromId][locationId] };

        if (gameState.player.activePerks.navigator) {
            travelInfo.time = Math.round(travelInfo.time * PERKS.navigator.travelTimeMod);
            travelInfo.fuelCost = Math.round(travelInfo.fuelCost * PERKS.navigator.fuelMod);
        }

        if (eventMods.travelTimeAdd) travelInfo.time += eventMods.travelTimeAdd;
        if (eventMods.travelTimeAddPercent) travelInfo.time *= (1 + eventMods.travelTimeAddPercent);
        if (eventMods.setTravelTime) travelInfo.time = eventMods.setTravelTime;
        travelInfo.time = Math.max(1, Math.round(travelInfo.time));

        const activeShip = getActiveShip();
        if (activeShip.maxFuel < travelInfo.fuelCost) {
            queueModal('event-modal', "Fuel Capacity Insufficient", `Your ship's fuel tank is too small for this journey. The trip requires ${travelInfo.fuelCost} fuel, but your ship can only hold ${activeShip.maxFuel}.`);
            return;
        }
        if (activeShip.fuel < travelInfo.fuelCost) {
            queueModal('event-modal', "Insufficient Fuel", `You do not have enough fuel for this journey. The trip requires ${travelInfo.fuelCost} fuel, but you only have ${Math.floor(activeShip.fuel)}.`);
            return;
        }

        let travelHullDamage = travelInfo.time * CONFIG.HULL_DECAY_PER_TRAVEL_DAY;
        if (gameState.player.activePerks.navigator) {
            travelHullDamage *= PERKS.navigator.hullDecayMod;
        }

        const eventHullDamagePercent = eventMods.eventHullDamagePercent || 0;
        const eventHullDamageValue = activeShip.maxHealth * (eventHullDamagePercent / 100);

        const totalHullDamageValue = travelHullDamage + eventHullDamageValue;
        const activeShipState = gameState.player.shipStates[activeShip.id];
        activeShipState.health -= totalHullDamageValue;

        checkHullWarnings(activeShip.id);
        if (activeShipState.health <= 0) {
            handleShipDestruction(activeShip.id);
            return;
        }

        gameState.player.shipStates[activeShip.id].fuel -= travelInfo.fuelCost;
        advanceDays(travelInfo.time);

        if (gameState.isGameOver) return;

        gameState.currentLocationId = locationId;

        const fromLocation = MARKETS.find(m => m.id === fromId);
        const destination = MARKETS.find(m => m.id === locationId);

        const totalHullDamagePercentForDisplay = (totalHullDamageValue / activeShip.maxHealth) * 100;

        showTravelAnimation(fromLocation, destination, travelInfo, totalHullDamagePercentForDisplay, () => {
            showMarketView();
        });
    }

    function resumeTravel() {
        if (!gameState.pendingTravel) return;
        const { destinationId, ...eventMods } = gameState.pendingTravel;
        gameState.pendingTravel = null; // Clear pending state
        initiateTravel(destinationId, eventMods);
    }

    function checkForRandomEvent(destinationId) {
        if (Math.random() > CONFIG.RANDOM_EVENT_CHANCE) {
            return false;
        }

        const activeShip = getActiveShip();
        const validEvents = RANDOM_EVENTS.filter(event => {
            return event.precondition(gameState, activeShip);
        });

        if (validEvents.length === 0) {
            return false;
        }

        const event = validEvents[Math.floor(Math.random() * validEvents.length)];
        triggerEvent(event, destinationId);
        return true;
    }

    function triggerEvent(event, destinationId) {
        gameState.pendingTravel = { destinationId };

        const modal = document.getElementById('random-event-modal');
        const titleEl = document.getElementById('random-event-title');
        const scenarioEl = document.getElementById('random-event-scenario');
        const choicesContainer = document.getElementById('random-event-choices-container');

        titleEl.innerHTML = event.title;
        scenarioEl.innerHTML = event.scenario;
        choicesContainer.innerHTML = '';

        event.choices.forEach((choice, index) => {
            const button = document.createElement('button');
            button.className = 'btn w-full text-left p-4 hover:bg-slate-700';
            button.innerHTML = choice.title;
            button.onclick = () => resolveEventChoice(event.id, index);
            choicesContainer.appendChild(button);
        });

        modal.classList.remove('hidden');
        modal.classList.add('modal-visible');
    }

    function resolveEventChoice(eventId, choiceIndex) {
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

        applyEventEffects(chosenOutcome);

        const modal = document.getElementById('random-event-modal');
        modal.classList.add('modal-hiding');
        modal.addEventListener('animationend', () => {
            modal.classList.add('hidden');
            modal.classList.remove('modal-hiding');
            queueModal('event-modal', event.title, chosenOutcome.description, resumeTravel, { buttonText: 'Continue Journey' });
        }, { once: true });
    }

    function applyEventEffects(chosenOutcome) {
        const effects = chosenOutcome.effects;
        const activeShip = getActiveShip();
        const activeShipState = gameState.player.shipStates[activeShip.id];
        const activeInventory = getActiveInventory();

        effects.forEach(effect => {
            switch (effect.type) {
                case 'credits':
                    gameState.player.credits += effect.value;
                    break;
                case 'fuel':
                    activeShipState.fuel = Math.max(0, activeShipState.fuel + effect.value);
                    break;
                case 'hull_damage_percent':
                    let damagePercent = Array.isArray(effect.value)
                        ? Math.random() * (effect.value[1] - effect.value[0]) + effect.value[0]
                        : effect.value;
                    gameState.pendingTravel.eventHullDamagePercent = (gameState.pendingTravel.eventHullDamagePercent || 0) + damagePercent;
                    break;
                case 'travel_time_add':
                    gameState.pendingTravel.travelTimeAdd = (gameState.pendingTravel.travelTimeAdd || 0) + effect.value;
                    break;
                case 'travel_time_add_percent':
                     gameState.pendingTravel.travelTimeAddPercent = (gameState.pendingTravel.travelTimeAddPercent || 0) + effect.value;
                    break;
                case 'set_travel_time':
                    gameState.pendingTravel.setTravelTime = effect.value;
                    break;
                case 'add_debt':
                    gameState.player.debt += effect.value;
                    break;
                case 'unlock_location':
                    if (!gameState.player.unlockedLocationIds.includes(effect.value)) {
                        gameState.player.unlockedLocationIds.push(effect.value);
                    }
                    break;
                case 'add_cargo':
                    if (calculateInventoryUsed(activeInventory) + effect.value.quantity <= activeShip.cargoCapacity) {
                        activeInventory[effect.value.id].quantity += effect.value.quantity;
                    }
                    break;
                case 'lose_cargo':
                    activeInventory[effect.value.id].quantity = Math.max(0, activeInventory[effect.value.id].quantity - effect.value.quantity);
                    break;
                case 'lose_random_cargo_percent':
                    const heldItems = Object.entries(activeInventory).filter(([id, item]) => item.quantity > 0);
                    if (heldItems.length > 0) {
                        const [randomItemId, randomItem] = heldItems[Math.floor(Math.random() * heldItems.length)];
                        const amountToLose = Math.ceil(randomItem.quantity * effect.value);
                        randomItem.quantity -= amountToLose;
                    }
                    break;
                case 'sell_random_cargo_premium':
                    const itemsToSell = Object.entries(activeInventory).filter(([id, item]) => item.quantity > 0);
                    if (itemsToSell.length > 0) {
                        const [itemId, item] = itemsToSell[Math.floor(Math.random() * itemsToSell.length)];
                        const galacticAvg = gameState.market.galacticAverages[itemId];
                        const salePrice = galacticAvg * effect.value;
                        const totalValue = salePrice * item.quantity;
                        gameState.player.credits += totalValue;
                        item.quantity = 0;
                    }
                    break;
                case 'set_new_random_destination':
                    const otherMarkets = MARKETS.filter(m => m.id !== gameState.currentLocationId && gameState.player.unlockedLocationIds.includes(m.id));
                    if(otherMarkets.length > 0) {
                        const newDest = otherMarkets[Math.floor(Math.random() * otherMarkets.length)];
                        gameState.pendingTravel.destinationId = newDest.id;
                    }
                    break;

                case 'resolve_space_race': {
                    const wager = Math.floor(gameState.player.credits * 0.80);
                    const classChances = { 'S': 0.85, 'A': 0.70, 'B': 0.55, 'C': 0.40, 'O': 0.95 };
                    const winChance = classChances[activeShip.class] || 0.40;

                    if (Math.random() < winChance) {
                        gameState.player.credits += wager;
                        chosenOutcome.description = `Your Class ${activeShip.class} ship's superior handling wins the day! You gain <span class="hl-green">${formatCredits(wager)}</span>.`;
                        recordFinanceTransaction('wager_win', wager);
                    } else {
                        gameState.player.credits -= wager;
                        chosenOutcome.description = `The luxury ship's raw power was too much for your Class ${activeShip.class} vessel. You lose <span class="hl-red">${formatCredits(wager)}</span>.`;
                         recordFinanceTransaction('wager_loss', -wager);
                    }
                    break;
                }

                case 'resolve_adrift_passenger': {
                    activeShipState.fuel = Math.max(0, activeShipState.fuel - 30);
                    const spaceAvailable = activeShip.cargoCapacity - calculateInventoryUsed(activeInventory);
                    if (spaceAvailable >= 40) {
                        activeInventory['cybernetics'].quantity += 40;
                        chosenOutcome.description = `In gratitude, the passenger gives you a crate of high-grade cybernetics. You gain <span class="hl-green">40 Cybernetics</span>, which have been added to your cargo.`;
                    } else if (gameState.player.debt > 0) {
                        const debtPaid = Math.floor(gameState.player.debt * 0.20);
                        gameState.player.debt -= debtPaid;
                         chosenOutcome.description = `Seeing your tight cargo hold, the passenger instead makes a call and pays off 20% of your debt, reducing it by <span class="hl-green">${formatCredits(debtPaid)}</span>.`;
                    } else {
                        const creditsGained = Math.floor(gameState.player.credits * 0.05);
                        gameState.player.credits += creditsGained;
                        chosenOutcome.description = `With no room for cargo and no debts to pay, the passenger simply transfers you a handsome sum of <span class="hl-green">${formatCredits(creditsGained)}</span> as thanks.`;
                    }
                    break;
                }
            }
        });
        updateUI();
    }

    function showTravelAnimation(from, to, travelInfo, totalHullDamagePercent, finalCallback) {
        const modal = document.getElementById('travel-animation-modal');
        const statusText = document.getElementById('travel-status-text');
        const arrivalLore = document.getElementById('travel-arrival-lore');
        const canvas = document.getElementById('travel-canvas');
        const ctx = canvas.getContext('2d');
        const progressContainer = document.getElementById('travel-progress-container');
        const progressBar = document.getElementById('travel-progress-bar');
        const readoutContainer = document.getElementById('travel-readout-container');
        const infoText = document.getElementById('travel-info-text');
        const hullDamageText = document.getElementById('travel-hull-damage');
        const confirmButton = document.getElementById('travel-confirm-button');
        let animationFrameId = null;

        statusText.textContent = `Traveling to ${to.name}...`;
        arrivalLore.textContent = '';
        arrivalLore.style.opacity = 0;
        readoutContainer.classList.add('hidden');
        readoutContainer.style.opacity = 0;
        confirmButton.classList.add('hidden');
        confirmButton.style.opacity = 0;
        progressContainer.classList.remove('hidden');
        progressBar.style.width = '0%';
        modal.classList.remove('hidden');

        const duration = 2500;
        let startTime = null;
        const fromEmoji = LOCATION_VISUALS[from.id] || '❓';
        const toEmoji = LOCATION_VISUALS[to.id] || '❓';
        const shipEmoji = '🚀';

        let stars = [];
        const numStars = 150;
        canvas.width = canvas.clientWidth;
        canvas.height = canvas.clientHeight;

        for (let i = 0; i < numStars; i++) {
            stars.push({
                x: Math.random() * canvas.width,
                y: Math.random() * canvas.height,
                radius: Math.random() * 1.5,
                speed: 0.2 + Math.random() * 0.8,
                alpha: 0.5 + Math.random() * 0.5
            });
        }

        function animationLoop(currentTime) {
            if (!startTime) startTime = currentTime;
            const elapsedTime = currentTime - startTime;
            let progress = Math.min(elapsedTime / duration, 1);

            progress = 1 - Math.pow(1 - progress, 3);

            canvas.width = canvas.clientWidth;
            canvas.height = canvas.clientHeight;
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            ctx.fillStyle = '#FFF';
            for (let i = 0; i < numStars; i++) {
                const star = stars[i];
                 if (progress < 1) {
                    star.x -= star.speed;
                    if (star.x < 0) star.x = canvas.width;
                }
                ctx.beginPath();
                ctx.arc(star.x, star.y, star.radius, 0, Math.PI * 2);
                ctx.globalAlpha = star.alpha;
                ctx.fill();
            }
            ctx.globalAlpha = 1.0;

            const padding = 60;
            const startX = padding;
            const endX = canvas.width - padding;
            const y = canvas.height / 2;

            ctx.font = '42px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(fromEmoji, startX, y);
            ctx.fillText(toEmoji, endX, y);

            const shipX = startX + (endX - startX) * progress;
            ctx.save();
            ctx.translate(shipX, y);
            ctx.font = '17px sans-serif';
            ctx.fillText(shipEmoji, 0, 0);
            ctx.restore();

            progressBar.style.width = `${progress * 100}%`;

            if (progress < 1) {
                animationFrameId = requestAnimationFrame(animationLoop);
            } else {
                statusText.textContent = `Arrived at ${to.name}`;
                arrivalLore.innerHTML = to.arrivalLore || "You have arrived.";

                infoText.innerHTML = `Time: ${travelInfo.time} Days | <span class="font-bold text-sky-300">Fuel: ${travelInfo.fuelCost}</span>`;
                hullDamageText.className = 'text-sm font-roboto-mono mt-1 font-bold text-green-300';
                hullDamageText.innerHTML = totalHullDamagePercent > 0.01 ? `Hull Integrity Decreased by ${totalHullDamagePercent.toFixed(2)}%` : '';

                arrivalLore.style.opacity = 1;
                progressContainer.classList.add('hidden');
                readoutContainer.classList.remove('hidden');
                confirmButton.classList.remove('hidden');

                setTimeout(() => {
                    readoutContainer.style.opacity = 1;
                    confirmButton.style.opacity = 1;
                }, 50);
            }
        }

        animationFrameId = requestAnimationFrame(animationLoop);

        confirmButton.onclick = () => {
            cancelAnimationFrame(animationFrameId);
            modal.classList.add('hidden');
            if (finalCallback) finalCallback();
        };
    }

    function recordPriceHistory() {
        if (!gameState || !gameState.market) return;
        MARKETS.forEach(market => {
            COMMODITIES.forEach(good => {
                if (!gameState.market.priceHistory[market.id]) {
                    gameState.market.priceHistory[market.id] = {};
                }
                if (!gameState.market.priceHistory[market.id][good.id]) {
                    gameState.market.priceHistory[market.id][good.id] = [];
                }

                const history = gameState.market.priceHistory[market.id][good.id];
                const currentPrice = getPrice(market.id, good.id);

                history.push({ day: gameState.day, price: currentPrice });

                while (history.length > CONFIG.PRICE_HISTORY_LENGTH) {
                    history.shift();
                }
            });
        });
    }

    function recordFinanceTransaction(type, amount) {
        if (!gameState.player.financeHistory) {
            gameState.player.financeHistory = [{ value: CONFIG.STARTING_CREDITS, type: 'start', amount: 0 }];
        }
        const history = gameState.player.financeHistory;
        history.push({
            value: gameState.player.credits,
            type: type,
            amount: amount
        });
        while (history.length > CONFIG.FINANCE_HISTORY_LENGTH) {
            history.shift();
        }
    }

    function applyGarnishment() {
        if (gameState.player.debt > 0 && gameState.player.loanStartDate && (gameState.day - gameState.player.loanStartDate) >= CONFIG.LOAN_GARNISHMENT_DAYS) {
            const garnishedAmount = Math.floor(gameState.player.credits * CONFIG.LOAN_GARNISHMENT_PERCENT);
            if (garnishedAmount > 0) {
                gameState.player.credits -= garnishedAmount;
                showGarnishmentToast(`7% of credits garnished for debt: -${formatCredits(garnishedAmount, false)}`);
                recordFinanceTransaction('debt', -garnishedAmount);
            }

            if (!gameState.player.seenGarnishmentWarning) {
                const msg = "Your loan has been delinquent for over a year. Your lender is now garnishing 7% of your total credits every week until the debt is paid in full.";
                queueModal('event-modal', "Credit Garnishment Notice", msg, null, { buttonText: 'Understood', buttonClass: 'bg-red-800/80' });
                gameState.player.seenGarnishmentWarning = true;
            }
        }
    }

    function advanceDays(days) {
        for (let i = 0; i < days; i++) {
            if (gameState.isGameOver) return;
            gameState.day++;

            const dayOfYear = (gameState.day - 1) % 365;
            const currentYear = DATE_CONFIG.START_YEAR + Math.floor((gameState.day - 1) / 365);
            if (dayOfYear === 11 && currentYear > gameState.player.lastBirthdayYear) {
                gameState.player.playerAge++;
                gameState.player.birthdayProfitBonus += 0.01;
                gameState.player.lastBirthdayYear = currentYear;

                const title = `${gameState.player.playerTitle} ${gameState.player.name}`;
                const desc = `You are now ${gameState.player.playerAge}. You feel older and wiser.<br><br>Your experience now grants you an additional 1% profit on all trades.`;
                queueModal('event-modal', title, desc);
            }

            checkEvents();

            if (gameState.day - gameState.lastMarketUpdateDay >= 7) {
                evolveMarketPrices();
                recordPriceHistory();
                applyGarnishment();
                gameState.lastMarketUpdateDay = gameState.day;
            }

            if (gameState.intel.active && gameState.day > gameState.intel.active.endDay) {
                gameState.intel.active = null;
            }

            gameState.player.ownedShipIds.forEach(shipId => {
                if (shipId !== gameState.player.activeShipId) {
                    const ship = SHIPS[shipId];
                    const repairAmount = ship.maxHealth * CONFIG.PASSIVE_REPAIR_RATE;
                    gameState.player.shipStates[shipId].health = Math.min(ship.maxHealth, gameState.player.shipStates[shipId].health + repairAmount);
                }
            });

            if (gameState.player.debt > 0 && (gameState.day - gameState.lastInterestChargeDay) >= CONFIG.INTEREST_INTERVAL) {
                const interest = calculateWeeklyInterest();
                gameState.player.debt += interest;
                gameState.lastInterestChargeDay = gameState.day;
            }
        }
    }

    function handleShipDestruction(shipId) {
        const shipName = SHIPS[shipId].name;
        gameState.player.ownedShipIds = gameState.player.ownedShipIds.filter(id => id !== shipId);
        delete gameState.player.shipStates[shipId];
        delete gameState.player.inventories[shipId];
        if (gameState.player.ownedShipIds.length === 0) {
            gameOver(`The hull of your last ship, the ${shipName}, failed catastrophically, destroying the vessel and all hands aboard. Your trading career ends here, lost to the void.`);
        } else {
            gameState.player.activeShipId = gameState.player.ownedShipIds[0];
            const newShipName = SHIPS[gameState.player.activeShipId].name;
            const message = `Due to poor <span class='hl-blue pulse-blue-glow'>hull</span> health, the <span class='hl'>${shipName}</span> suffered a catastrophic hull breach and was destroyed. All onboard cargo was lost.<br><br>You were rescued from a life pod adrift in space and now occupy your backup vessel, the <span class='hl'>${newShipName}</span>.`;
            queueModal('event-modal', 'Vessel Lost', message, () => {
                updateUI();
            });
        }
    }

    function gameOver(message) {
        gameState.isGameOver = true;
        queueModal('event-modal', "Game Over", message, () => {
            localStorage.removeItem(CONFIG.SAVE_KEY);
            window.location.reload();
        }, { buttonText: 'Restart', isGameOver: true });
    }

    function getPrice(marketId, goodId, isSelling = false) {
        let price = gameState.market.prices[marketId][goodId];

        const market = MARKETS.find(m => m.id === marketId);
        if (isSelling && market.specialDemand && market.specialDemand[goodId]) {
            price *= market.specialDemand[goodId].bonus;
        }

        const intel = gameState.intel.active;
        if (intel && intel.targetMarketId === marketId && intel.commodityId === goodId) {
            price *= (intel.type === 'demand') ? CONFIG.INTEL_DEMAND_MOD : CONFIG.INTEL_DEPRESSION_MOD;
        }

        return Math.max(1, Math.round(price));
    }

    function seedInitialMarketPrices() {
        MARKETS.forEach(location => {
            gameState.market.prices[location.id] = {};
            COMMODITIES.forEach(good => {
                let price = gameState.market.galacticAverages[good.id] * (1 + (Math.random() - 0.5) * 0.5);
                let modifier = location.modifiers[good.id] || 1.0;
                price *= modifier;
                gameState.market.prices[location.id][good.id] = Math.max(1, Math.round(price));
            });
        });
    }

    function evolveMarketPrices() {
        MARKETS.forEach(location => {
            COMMODITIES.forEach(good => {
                const yesterdayPrice = gameState.market.prices[location.id][good.id];
                const galacticAverage = gameState.market.galacticAverages[good.id];
                const locationModifier = location.modifiers[good.id] || 1.0;
                const localBaseline = galacticAverage * locationModifier;

                const volatility = (Math.random() - 0.5) * 2 * CONFIG.DAILY_PRICE_VOLATILITY;
                const volatilityChange = yesterdayPrice * volatility;

                const reversionPull = (localBaseline - yesterdayPrice) * CONFIG.MEAN_REVERSION_STRENGTH;

                let newPrice = yesterdayPrice + volatilityChange + reversionPull;

                gameState.market.prices[location.id][good.id] = Math.max(1, Math.round(newPrice));
            });
        });
    }

    function buyItem(goodId, quantity, event) {
        if (gameState.isGameOver || quantity <= 0) return;
        const marketStock = gameState.market.inventory[gameState.currentLocationId][goodId].quantity;
        if(marketStock <= 0){ queueModal('event-modal', "Sold Out", `This station has no more ${COMMODITIES.find(c=>c.id===goodId).name} available.`); return; }
        if(quantity > marketStock){ queueModal('event-modal', "Limited Stock", `This station only has ${marketStock} units available.`); return; }
        const activeShip = getActiveShip();
        const activeInventory = getActiveInventory();
        if (calculateInventoryUsed(activeInventory) + quantity > activeShip.cargoCapacity) {
             queueModal('event-modal', "Cargo Hold Full", "You don't have enough space in your active ship's cargo hold.");
            return;
        }
        const price = getPrice(gameState.currentLocationId, goodId);
        const totalCost = price * quantity;
        if (gameState.player.credits < totalCost) { queueModal('event-modal', "Insufficient Funds", "Your credit balance is too low."); return; }

        gameState.market.inventory[gameState.currentLocationId][goodId].quantity -= quantity;
        const item = activeInventory[goodId];
        const newTotalValue = (item.quantity * item.avgCost) + totalCost;
        item.quantity += quantity;
        item.avgCost = newTotalValue / item.quantity;
        gameState.player.credits -= totalCost;

        if (event) {
            createFloatingText(`-${formatCredits(totalCost, false)}`, event.clientX, event.clientY, '#f87171');
        }
        recordFinanceTransaction('trade', -totalCost);
        updateUI();
        checkMilestones();
    }

    function sellItem(goodId, quantity, event) {
        if (gameState.isGameOver || quantity <= 0) return;
        const activeInventory = getActiveInventory();
        const item = activeInventory[goodId];
        if (!item || item.quantity < quantity) return;

        gameState.market.inventory[gameState.currentLocationId][goodId].quantity += quantity;
        const price = getPrice(gameState.currentLocationId, goodId, true);
        let totalSaleValue = price * quantity;

        const profit = totalSaleValue - (item.avgCost * quantity);
        if (profit > 0) {
            let totalBonus = 0;
            if (gameState.player.activePerks.trademaster) {
                totalBonus += PERKS.trademaster.profitBonus;
            }
            if (gameState.player.birthdayProfitBonus) {
                totalBonus += gameState.player.birthdayProfitBonus;
            }
            totalSaleValue += profit * totalBonus;
        }

        gameState.player.credits += totalSaleValue;
        item.quantity -= quantity;
        if (item.quantity === 0) item.avgCost = 0;

        if (event) {
            createFloatingText(`+${formatCredits(totalSaleValue, false)}`, event.clientX, event.clientY, '#34d399');
        }
        recordFinanceTransaction('trade', totalSaleValue);
        updateUI();
        checkMilestones();
    }

    function payOffDebt() {
        if (gameState.isGameOver) return;
        const debtAmount = gameState.player.debt;
        if (gameState.player.credits < debtAmount) { queueModal('event-modal', "Insufficient Funds", "You can't afford to pay off your entire debt."); return; }

        if (debtAmount > 0 && !gameState.player.initialDebtPaidOff) {
            const commendationMessage = `Captain ${gameState.player.name}, your strategic trading has put us on a path to success. The crew's morale is high. We trust your command.<br><br>The <span class='hl'>Starport</span> is now accessible!`;
            queueModal('tutorial-modal', 'Crew Commendation', commendationMessage, () => { gameState.tutorials.success = true; }, { tutorialType: 'success' });
            gameState.player.starportUnlocked = true;
            gameState.player.initialDebtPaidOff = true;
        }

        gameState.player.credits -= debtAmount;
        recordFinanceTransaction('loan', -debtAmount);
        gameState.player.debt = 0;
        gameState.player.weeklyInterestAmount = 0;
        gameState.player.loanStartDate = null;
        updateUI();
        checkMilestones();
    }

    function takeLoan(loanData) {
        if (gameState.isGameOver) return;
        if (gameState.player.debt > 0) {
            queueModal('event-modal', "Loan Unavailable", `You must pay off your existing debt before taking another loan.`);
            return;
        }

        if (gameState.player.credits < loanData.fee) {
            queueModal('event-modal', "Unable to Secure Loan", `The financing fee for this loan is ${formatCredits(loanData.fee)}, but you only have ${formatCredits(gameState.player.credits)}.`);
            return;
        }
        gameState.player.credits -= loanData.fee;
        recordFinanceTransaction('loan', -loanData.fee);
        gameState.player.credits += loanData.amount;
        recordFinanceTransaction('loan', loanData.amount);
        gameState.player.debt += loanData.amount;
        gameState.player.weeklyInterestAmount = loanData.interest;
        gameState.player.loanStartDate = gameState.day;
        gameState.player.seenGarnishmentWarning = false;

        const loanDesc = `You've acquired a loan of <span class="hl-blue">${formatCredits(loanData.amount)}</span>.<br>A financing fee of <span class="hl-red">${formatCredits(loanData.fee)}</span> was deducted.`;
        queueModal('event-modal', "Loan Acquired", loanDesc);
        updateUI();
    }

    function purchaseIntel(buttonElement) {
        if (gameState.isGameOver || gameState.intel.active) return;
        const cost = parseInt(buttonElement.dataset.cost);
        if (gameState.player.credits < cost) { queueModal('event-modal', "Insufficient Funds", "You can't afford this intel."); return; }
        gameState.player.credits -= cost;
        recordFinanceTransaction('intel', -cost);
        gameState.intel.available[gameState.currentLocationId] = false;
        const otherMarkets = MARKETS.filter(m => m.id !== gameState.currentLocationId && gameState.player.unlockedLocationIds.includes(m.id));
        if (otherMarkets.length === 0) return;
        const targetMarket = otherMarkets[Math.floor(Math.random() * otherMarkets.length)];
        const availableCommodities = COMMODITIES.filter(c => c.unlockLevel <= gameState.player.unlockedCommodityLevel);
        const commodity = availableCommodities[Math.floor(Math.random() * availableCommodities.length)];
        if (commodity) {
            const duration = 100;
            gameState.intel.active = { targetMarketId: targetMarket.id, commodityId: commodity.id, type: 'demand', startDay: gameState.day, endDay: gameState.day + duration };
        }
        updateUI();
    }

    function checkMilestones() {
        if (!gameState || !gameState.player) return;
        CONFIG.COMMODITY_MILESTONES.forEach(milestone => {
            if (gameState.player.credits >= milestone.threshold && !gameState.player.seenCommodityMilestones.includes(milestone.threshold)) {
                let message = milestone.message;
                let somethingChanged = false;
                if (milestone.unlockLevel && milestone.unlockLevel > gameState.player.unlockedCommodityLevel) {
                    gameState.player.unlockedCommodityLevel = milestone.unlockLevel;
                    somethingChanged = true;
                }
                if (milestone.unlocksLocation && !gameState.player.unlockedLocationIds.includes(milestone.unlocksLocation)) {
                    gameState.player.unlockedLocationIds.push(milestone.unlocksLocation);
                    const newLocation = MARKETS.find(m => m.id === milestone.unlocksLocation);
                    message += `<br><br><span class="hl-blue">New Destination:</span> Access to <span class="hl">${newLocation.name}</span> has been granted.`;
                    somethingChanged = true;
                }
                if (somethingChanged) {
                    gameState.player.seenCommodityMilestones.push(milestone.threshold);
                    queueModal('tutorial-modal', 'Reputation Growth', message);
                    updateUI();
                }
            }
        });
    }

    function updateLiveStats() {
        if (!gameState || !gameState.player) return;
        const ship = getActiveShip();
        if (!ship) return;

        const shipFuelPointsEl = document.getElementById('ship-fuel-points');
        if (shipFuelPointsEl) shipFuelPointsEl.textContent = `${Math.floor(ship.fuel)}/${ship.maxFuel}`;

        const shipFuelBarEl = document.getElementById('ship-fuel-bar');
        if (shipFuelBarEl) shipFuelBarEl.style.width = `${(ship.fuel / ship.maxFuel) * 100}%`;

        const refuelFeedbackBarEl = document.getElementById('refuel-feedback-bar');
        if (refuelFeedbackBarEl) refuelFeedbackBarEl.style.width = `${(ship.fuel / ship.maxFuel) * 100}%`;

        const shipHealthEl = document.getElementById('ship-health');
        if (shipHealthEl) shipHealthEl.textContent = `${Math.floor(ship.health)}%`;

        const repairBarEl = document.getElementById('repair-feedback-bar');
        if(repairBarEl) repairBarEl.style.width = `${(ship.health / ship.maxHealth) * 100}%`;

        const creditMirrorEl = document.getElementById('services-credit-mirror');
        if (creditMirrorEl) {
            creditMirrorEl.innerHTML = `<span class="text-cyan-400">⌬ </span><span class="font-bold text-cyan-300 ml-auto">${formatCredits(gameState.player.credits, false)}</span>`;
        }
    }

    function updateUI() {
        if (gameState.isGameOver || !gameState.player) return;
        updateLiveStats();
        const ship = getActiveShip();
        if (!ship) {
            if(!gameState.isGameOver) console.error("Could not get active ship!");
            return;
        }
        const activeInventory = getActiveInventory();

        const financePanel = document.getElementById('finance-panel');
        if (gameState.player.debt > 0) {
            financePanel.className = 'panel-border border border-slate-700 bg-black/30 p-4 rounded-lg mb-6 grid grid-cols-3 items-center text-center';
            financePanel.innerHTML = `
                <div>
                    <span class="block text-sm text-cyan-400 uppercase tracking-wider">Credits</span>
                    <span class="text-xl font-bold font-roboto-mono text-cyan-300">${formatCredits(gameState.player.credits, false)}</span>
                </div>
                <div>
                    <span class="block text-sm text-red-400 uppercase tracking-wider">Debt</span>
                    <span class="text-xl font-bold font-roboto-mono text-red-400">${formatCredits(gameState.player.debt, false)}</span>
                </div>
                <div>
                    <span class="block text-sm text-red-400 uppercase tracking-wider">Interest / 7d</span>
                    <span class="text-xl font-bold font-roboto-mono text-red-400">${formatCredits(calculateWeeklyInterest(), false)}</span>
                </div>
            `;
        } else {
            financePanel.className = 'panel-border border border-slate-700 bg-black/30 p-4 rounded-lg mb-6 grid grid-cols-1 items-center text-center';
            financePanel.innerHTML = `
                <div>
                    <span class="block text-sm text-cyan-400 uppercase tracking-wider">Credits</span>
                    <span class="text-2xl font-bold font-roboto-mono text-cyan-300">${formatCredits(gameState.player.credits, false)}</span>
                </div>
            `;
        }

        document.getElementById('player-inventory-space').textContent = `${calculateInventoryUsed(activeInventory)}/${ship.cargoCapacity}`;
        const location = MARKETS.find(l => l.id === gameState.currentLocationId);
        if (location) document.getElementById('location-status-panel').className = `md:col-span-2 h-full p-4 rounded-lg flex items-center justify-between transition-all duration-500 panel-border border border-slate-700 ${location.bg} shadow-lg`;
        document.getElementById('game-day').textContent = gameState.day;
        document.getElementById('game-date-display').textContent = getDateFromDay(gameState.day);

        const captainPanel = document.getElementById('captain-info-panel');
        if (captainPanel) {
            captainPanel.innerHTML = `
                <span>${gameState.player.playerTitle || 'Captain'} ${gameState.player.name}, ${gameState.player.playerAge}</span>
                <span class="graph-icon" data-action="show-finance-graph">📈</span>
            `;
        }

        const vesselDetailsContainer = document.getElementById('vessel-details-container');
        if (vesselDetailsContainer) {
            vesselDetailsContainer.innerHTML = `
                <div class="text-right">
                     <p class="text-gray-400 text-sm tracking-wider">Vessel</p>
                    <p>${ship.name}</p>
                    <p>Class: ${ship.class}</p>
                </div>
             `;
        }

        const intelDisplay = document.getElementById('intel-display');
        if (gameState.intel.active) {
            const intel = gameState.intel.active;
            const targetMarket = MARKETS.find(m => m.id === intel.targetMarketId);
            const commodity = COMMODITIES.find(c => c.id === intel.commodityId);
            const daysLeft = intel.endDay - gameState.day;
            if (daysLeft > 0) {
                let intelText = (intel.type === 'demand') ? `A contact reports a <span class="hl-pulse-green">high demand</span> for <span class="font-bold text-yellow-300">${commodity.name}</span> at <span class="font-bold text-cyan-300">${targetMarket.name}</span>! The window is closing: <span class="font-bold">${daysLeft}</span> days left.` : `The market for <span class="font-bold text-yellow-300">${commodity.name}</span> at <span class="font-bold text-cyan-300">${targetMarket.name}</span> has crashed. Prices will be depressed for <span class="font-bold">${daysLeft}</span> days.`;
                intelDisplay.className = intel.type === 'demand' ? 'p-3 rounded-lg my-4 text-center bg-cyan-900/40 border border-cyan-700' : 'p-3 rounded-lg my-4 text-center bg-red-900/40 border border-red-700';
                intelDisplay.innerHTML = `<p>${intelText}</p>`;
                intelDisplay.classList.remove('hidden');
            } else {
                intelDisplay.classList.add('hidden');
            }
        } else {
            intelDisplay.classList.add('hidden');
        }
        if (tutorialTimeout) { clearTimeout(tutorialTimeout); tutorialTimeout = null; }

        const viewIds = ['market-view', 'travel-view', 'starport-view'];
        let currentView = gameState.currentView || null;
        if (!currentView) {
            for (const id of viewIds) {
                if (document.getElementById(id).style.display !== 'none') {
                    currentView = id;
                    break;
                }
            }
        }
        if (!currentView) {
            showTravelView();
            return;
        };

        updateHeaderNav();
        if(currentView === 'market-view') updateMarketViewUI();
        if(currentView === 'travel-view') updateTravelViewUI();
        if(currentView === 'starport-view') updateStarportViewUI();
        const inventoryPanel = document.getElementById('player-inventory');
        inventoryPanel.classList.toggle('hidden', calculateInventoryUsed(getActiveInventory()) === 0);
    }

    function updateMarketViewUI() {
        if (!gameState || !gameState.player) return;
        const marketPricesEl = document.getElementById('market-prices');
        marketPricesEl.innerHTML = '';
        let allMarketHtml = '';
        const debtContainer = document.getElementById('debt-container');
        debtContainer.innerHTML = '';

        if (gameState.player.debt > 0) {
             let garnishmentTimerHtml = '';
             if (gameState.player.loanStartDate) {
                 const daysRemaining = CONFIG.LOAN_GARNISHMENT_DAYS - (gameState.day - gameState.player.loanStartDate);
                 if (daysRemaining > 0) {
                     garnishmentTimerHtml = `<p class="text-xs text-red-400/70 mt-2">Garnishment in ${daysRemaining} days</p>`;
                 }
             }
             debtContainer.innerHTML = `
                <h4 class="font-orbitron text-xl mb-2">Debt</h4>
                <button id="pay-debt-btn" class="btn w-full py-3 bg-red-800/80 hover:bg-red-700/80 border-red-500" ${gameState.player.credits >= gameState.player.debt ? '' : 'disabled'}>
                    Pay Off ${formatCredits(gameState.player.debt, false)}
                </button>
                ${garnishmentTimerHtml}
                `;
        } else {
            debtContainer.innerHTML = `<h4 class="font-orbitron text-xl mb-2">Financing</h4>`;
            const dynamicLoanAmount = Math.floor(gameState.player.credits * 3.5);
            const dynamicLoanFee = Math.floor(dynamicLoanAmount * 0.1);
            const dynamicLoanInterest = Math.floor(dynamicLoanAmount * 0.01);
            const dynamicLoanData = { amount: dynamicLoanAmount, fee: dynamicLoanFee, interest: dynamicLoanInterest };

            const loanButtonsHtml = [
                { key: '10000', amount: 10000, fee: 600, interest: 125 },
                { key: 'dynamic', ...dynamicLoanData }
            ].map((loan) => {
                const tooltipText = `Fee: ${formatCredits(loan.fee, false)}\nInterest: ${formatCredits(loan.interest, false)} / 7d`;
                return `<button class="btn btn-loan w-full p-2 mt-2 loan-btn-tooltip" data-loan-key="${loan.key}" ${gameState.player.credits < loan.fee ? 'disabled' : ''} data-tooltip="${tooltipText}" data-loan-details='${JSON.stringify(loan)}'>
                            <span class="font-orbitron text-cyan-300">⌬ ${formatCredits(loan.amount, false)}</span>
                        </button>`;
            }).join('');

            debtContainer.innerHTML += `<div class="flex justify-center gap-4 w-full">${loanButtonsHtml}</div>`;
        }

        const currentMarket = MARKETS.find(m=>m.id === gameState.currentLocationId);
        let fuelPrice = currentMarket.fuelPrice / 4;
        if (gameState.player.activePerks.venetian_syndicate && gameState.currentLocationId === 'loc_venus') {
            fuelPrice *= PERKS.venetian_syndicate.fuelDiscount;
        }
        document.getElementById('fuel-price').textContent = formatCredits(fuelPrice, false);

        const ship = getActiveShip();
        let costPerRepairTick = (ship.maxHealth * (CONFIG.REPAIR_AMOUNT_PER_TICK / 100)) * CONFIG.REPAIR_COST_PER_HP;
        if (gameState.player.activePerks.venetian_syndicate && gameState.currentLocationId === 'loc_venus') {
            costPerRepairTick *= PERKS.venetian_syndicate.repairDiscount;
        }
        document.getElementById('repair-cost').textContent = formatCredits(costPerRepairTick, false);
        document.getElementById('repair-btn').disabled = ship.health >= ship.maxHealth;
        document.getElementById('repair-feedback-bar').style.width = `${(ship.health / ship.maxHealth) * 100}%`;

        const intelPurchaseContainer = document.getElementById('intel-purchase-container');
        intelPurchaseContainer.innerHTML = '';
        const alwaysHasIntel = ['loc_exchange', 'loc_kepler'].includes(gameState.currentLocationId);
        let intelAvailable = (alwaysHasIntel || gameState.intel.available[gameState.currentLocationId]) && !gameState.intel.active && gameState.player.credits >= CONFIG.INTEL_MIN_CREDITS;
        if (intelAvailable) {
            const intelCost = Math.floor(gameState.player.credits * CONFIG.INTEL_COST_PERCENTAGE);
            intelPurchaseContainer.innerHTML = `<button id="purchase-intel-btn" class="btn btn-intel" data-cost="${intelCost}">Purchase Intel (${formatCredits(intelCost)})</button>`;
        }
        const availableCommodities = COMMODITIES.filter(c => c.unlockLevel <= gameState.player.unlockedCommodityLevel);
        const currentLocation = MARKETS.find(m => m.id === gameState.currentLocationId);
        const activeInventory = getActiveInventory();

        const isMobile = window.innerWidth <= 768;
        availableCommodities.forEach(good => {
            const marketItem = gameState.market.inventory[gameState.currentLocationId][good.id];
            const playerItem = activeInventory[good.id];
            const price = getPrice(gameState.currentLocationId, good.id);
            const galacticAvg = gameState.market.galacticAverages[good.id];
            const marketDiff = price - galacticAvg;

            const marketPct = galacticAvg > 0 ? Math.round((marketDiff / galacticAvg) * 100) : 0;
            let marketColor = marketPct < -15 ? 'text-red-400' : (marketPct > 15 ? 'text-green-400' : 'text-white');
            const marketSign = marketPct > 0 ? '+' : '';

            let marketArrowSVG = '';
            if (marketPct > 15) {
                marketArrowSVG = `<svg class="indicator-arrow" viewBox="0 0 24 24" fill="currentColor"><path d="M4 12l1.41 1.41L11 7.83V20h2V7.83l5.58 5.59L20 12l-8-8-8 8z"/></svg>`;
            } else if (marketPct < -15) {
                marketArrowSVG = `<svg class="indicator-arrow" viewBox="0 0 24 24" fill="currentColor"><path d="M20 12l-1.41-1.41L13 16.17V4h-2v12.17l-5.58-5.59L4 12l8 8 8-8z"/></svg>`;
            }

            const isSpecialDemand = currentLocation.specialDemand && currentLocation.specialDemand[good.id];
            const buyDisabled = isSpecialDemand ? 'disabled' : '';
            const nameTooltip = isSpecialDemand ? `data-tooltip="${currentLocation.specialDemand[good.id].lore}"` : '';

            let plHtml = ``;
            if (playerItem && playerItem.avgCost > 0) {
                const spreadPerUnit = getPrice(gameState.currentLocationId, good.id, true) - playerItem.avgCost;
                if (Math.abs(spreadPerUnit) > 0.01) {
                    const plPct = playerItem.avgCost > 0 ? Math.round((spreadPerUnit / playerItem.avgCost) * 100) : 0;
                    const plColor = spreadPerUnit >= 0 ? 'text-green-400' : 'text-red-400';
                    const plSign = plPct > 0 ? '+' : '';
                    let plArrowSVG = '';
                    if (spreadPerUnit > 0) {
                        plArrowSVG = `<svg class="indicator-arrow" viewBox="0 0 24 24" fill="currentColor"><path d="M4 12l1.41 1.41L11 7.83V20h2V7.83l5.58 5.59L20 12l-8-8-8 8z"/></svg>`;
                    } else if (spreadPerUnit < 0) {
                        plArrowSVG = `<svg class="indicator-arrow" viewBox="0 0 24 24" fill="currentColor"><path d="M20 12l-1.41-1.41L13 16.17V4h-2v12.17l-5.58-5.59L4 12l8 8 8-8z"/></svg>`;
                    }
                    plHtml = `<div class="market-indicator-container"><div class="market-indicator ${plColor}" data-good-id="${good.id}">P/L: ${plSign}${plPct}% ${plArrowSVG}</div></div>`;
                }
            }
            const playerInvDisplay = playerItem && playerItem.quantity > 0 ? ` <span class='text-cyan-300'>(${playerItem.quantity})</span>` : '';
            const graphIcon = `<span class="graph-icon" data-action="show-price-graph" data-good-id="${good.id}">📈</span>`;

            let finalHtml = '';
            if (isMobile) {
                let plHtmlMobile = '';
                if (playerItem && playerItem.avgCost > 0) {
                    const spreadPerUnit = getPrice(gameState.currentLocationId, good.id, true) - playerItem.avgCost;
                    if (Math.abs(spreadPerUnit) > 0.01) {
                        const plPct = playerItem.avgCost > 0 ? Math.round((spreadPerUnit / playerItem.avgCost) * 100) : 0;
                        const plColor = spreadPerUnit >= 0 ? 'text-green-400' : 'text-red-400';
                        const plSign = plPct > 0 ? '+' : '';
                        let plArrowSVG = '';
                         if (spreadPerUnit > 0) {
                            plArrowSVG = `<svg class="indicator-arrow" viewBox="0 0 24 24" fill="currentColor"><path d="M4 12l1.41 1.41L11 7.83V20h2V7.83l5.58 5.59L20 12l-8-8-8 8z"/></svg>`;
                        } else if (spreadPerUnit < 0) {
                            plArrowSVG = `<svg class="indicator-arrow" viewBox="0 0 24 24" fill="currentColor"><path d="M20 12l-1.41-1.41L13 16.17V4h-2v12.17l-5.58-5.59L4 12l8 8 8-8z"/></svg>`;
                        }
                        plHtmlMobile = `<div class="flex items-center ${plColor}"><span>P/L: ${plSign}${plPct}%</span> ${plArrowSVG}</div>`;
                    }
                }

                const mobileIndicatorsHtml = `
                    <div class="flex items-center space-x-3 text-sm text-outline">
                        <div class="flex items-center ${marketColor}"><span>MKT: ${marketSign}${marketPct}%</span> ${marketArrowSVG}</div>
                        ${plHtmlMobile}
                    </div>
                `;

                finalHtml = `
                <div class="item-card-container">
                    <div class="bg-black/20 p-4 rounded-lg flex flex-col border ${good.styleClass} shadow-md">
                        <div class="flex justify-between items-start w-full mb-2">
                            <div class="flex-grow">
                                <p class="font-bold commodity-name text-outline commodity-name-tooltip" ${nameTooltip}>${good.name}${playerInvDisplay}</p>
                                <p class="font-roboto-mono text-xl font-bold text-left pt-2 price-text text-outline flex items-center">${formatCredits(price)}</p>
                            </div>
                            <div class="text-right text-sm flex-shrink-0 ml-2 text-outline">
                                Avail: ${marketItem.quantity} ${graphIcon}
                            </div>
                        </div>
                        <div class="flex justify-between items-end mt-2">
                            ${mobileIndicatorsHtml}
                            <div class="mobile-controls-wrapper">
                                <div class="flex flex-col items-center space-y-1">
                                     <button class="btn item-btn" data-good-id="${good.id}" data-action="buy" ${buyDisabled}>Buy</button>
                                     <button class="btn btn-sm item-btn" data-good-id="${good.id}" data-action="set-max-buy" ${buyDisabled}>Max</button>
                                 </div>
                                <div class="flex flex-col items-center space-y-1">
                                     <button class="qty-btn" data-good-id="${good.id}" data-action="increment">+</button>
                                     <input type="number" class="qty-input" id="qty-${good.id}" data-good-id="${good.id}" value="1" min="1">
                                     <button class="qty-btn" data-good-id="${good.id}" data-action="decrement">-</button>
                                 </div>
                                <div class="flex flex-col items-center space-y-1">
                                     <button class="btn item-btn" data-good-id="${good.id}" data-action="sell">Sell</button>
                                      <button class="btn btn-sm item-btn" data-good-id="${good.id}" data-action="set-max-sell">Max</button>
                                 </div>
                             </div>
                        </div>
                     </div>
                </div>`;
            } else {
                // Desktop layout
                let desktopMarketArrowSVG = '';
                if (marketPct > 15) {
                    desktopMarketArrowSVG = `<svg class="indicator-arrow ${marketColor}" viewBox="0 0 24 24" fill="currentColor"><path d="M4 12l1.41 1.41L11 7.83V20h2V7.83l5.58 5.59L20 12l-8-8-8 8z"/></svg>`;
                } else if (marketPct < -15) {
                    desktopMarketArrowSVG = `<svg class="indicator-arrow ${marketColor}" viewBox="0 0 24 24" fill="currentColor"><path d="M20 12l-1.41-1.41L13 16.17V4h-2v12.17l-5.58-5.59L4 12l8 8 8-8z"/></svg>`;
                } else {
                    desktopMarketArrowSVG = `<svg class="indicator-arrow text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M5 12h14"/></svg>`;
                }

                let marketIndicatorHtml = `
                    <div class="market-indicator-stacked ${marketColor}">
                        <span class="text-xs opacity-80">MKT</span>
                        <span>${marketSign}${marketPct}%</span>
                    </div>
                    ${desktopMarketArrowSVG}
                `;
                let plIndicatorHtml = '';
                if (playerItem && playerItem.avgCost > 0) {
                    const spreadPerUnit = getPrice(gameState.currentLocationId, good.id, true) - playerItem.avgCost;
                    if (Math.abs(spreadPerUnit) > 0.01) {
                        const plPct = playerItem.avgCost > 0 ? Math.round((spreadPerUnit / playerItem.avgCost) * 100) : 0;
                        const plColor = spreadPerUnit >= 0 ? 'text-green-400' : 'text-red-400';
                        const plSign = plPct > 0 ? '+' : '';
                        let plArrowSVG = '';
                        if (spreadPerUnit > 0) {
                            plArrowSVG = `<svg class="indicator-arrow ${plColor}" viewBox="0 0 24 24" fill="currentColor"><path d="M4 12l1.41 1.41L11 7.83V20h2V7.83l5.58 5.59L20 12l-8-8-8 8z"/></svg>`;
                        } else if (spreadPerUnit < 0) {
                            plArrowSVG = `<svg class="indicator-arrow ${plColor}" viewBox="0 0 24 24" fill="currentColor"><path d="M20 12l-1.41-1.41L13 16.17V4h-2v12.17l-5.58-5.59L4 12l8 8 8-8z"/></svg>`;
                        }
                        plIndicatorHtml = `
                            <div class="market-indicator-stacked ${plColor}">
                                <span class="text-xs opacity-80">P/L</span>
                                <span>${plSign}${plPct}%</span>
                            </div>
                            ${plArrowSVG}
                        `;
                    }
                }

                finalHtml = `
                <div class="item-card-container">
                    <div class="bg-black/20 p-4 rounded-lg flex justify-between items-center border ${good.styleClass} transition-colors shadow-md h-32">
                        <div class="flex flex-col h-full justify-between flex-grow self-start pt-1">
                            <div>
                                 <p class="font-bold commodity-name text-outline commodity-name-tooltip" ${nameTooltip}>${good.name}${playerInvDisplay}</p>
                                 <p class="font-roboto-mono text-xl font-bold text-left pt-2 price-text text-outline flex items-center">${formatCredits(price)}</p>
                            </div>
                            <div class="text-sm self-start pb-1 text-outline flex items-center gap-3">
                                <span>Avail: ${marketItem.quantity} ${graphIcon}</span>
                                <div class="flex items-center gap-2">
                                    ${marketIndicatorHtml}
                                    ${plIndicatorHtml}
                                </div>
                            </div>
                        </div>
                        <div class="flex items-center space-x-2">
                            <div class="flex flex-col items-center">
                                <div class="flex flex-col space-y-1">
                                     <button class="btn item-btn" data-good-id="${good.id}" data-action="buy" ${buyDisabled}>Buy</button>
                                     <button class="btn btn-sm item-btn" data-good-id="${good.id}" data-action="set-max-buy" ${buyDisabled}>Max</button>
                                 </div>
                            </div>
                            <div class="flex flex-col items-center">
                                  <button class="qty-btn" data-good-id="${good.id}" data-action="increment">+</button>
                                 <input type="number" class="qty-input p-2 my-1" id="qty-${good.id}" data-good-id="${good.id}" value="1" min="1">
                                <button class="qty-btn" data-good-id="${good.id}" data-action="decrement">-</button>
                             </div>
                             <div class="flex flex-col items-center">
                                <div class="flex flex-col space-y-1">
                                    <button class="btn item-btn" data-good-id="${good.id}" data-action="sell">Sell</button>
                                    <button class="btn btn-sm item-btn" data-good-id="${good.id}" data-action="set-max-sell">Max</button>
                                 </div>
                            </div>
                         </div>
                      </div>
                </div>`;
            }
            allMarketHtml += finalHtml;
        });
        marketPricesEl.innerHTML = allMarketHtml;
        updateInventoryList();
    }

    function updateInventoryList() {
        if (!gameState || !gameState.player) return;
        const inventoryList = document.getElementById('inventory-list');
        inventoryList.innerHTML = '';
        const activeInventory = getActiveInventory();
        const ownedGoods = activeInventory ? Object.entries(activeInventory).filter(([id, item]) => item.quantity > 0) : [];
        if (ownedGoods.length > 0) {
            ownedGoods.forEach(([goodId, item]) => {
                 const good = COMMODITIES.find(c => c.id === goodId);
                 const tooltipText = `${good.lore}\n\nAvg. Cost: ${formatCredits(item.avgCost, false)}`;
                 inventoryList.innerHTML += `<div class="p-2 rounded-lg border-2 ${good.styleClass} cargo-item-tooltip" style="filter: drop-shadow(0 4px 3px rgba(0, 0, 0, 0.4));" data-tooltip="${tooltipText}"><div class="font-semibold text-sm commodity-name text-outline">${good.name}</div><div class="text-lg text-center text-cyan-300 text-outline">(${item.quantity})</div></div>`;
            });
        } else {
             inventoryList.innerHTML = `<p class="text-gray-500 col-span-full">Active ship's cargo hold is empty.</p>`;
        }
    }

    function updateTravelViewUI(){
        if (!gameState || !gameState.player) return;
        const locationsGrid = document.getElementById('locations-grid');
        locationsGrid.innerHTML = '';
        const fromId = gameState.currentLocationId;
        const unlockedMarkets = MARKETS.filter(location => gameState.player.unlockedLocationIds.includes(location.id));
        unlockedMarkets.forEach(location => {
            const isCurrent = location.id === fromId;
            const currentClass = isCurrent ? 'highlight-current disabled-current' : '';
            const travelInfo = TRAVEL_DATA[fromId] && TRAVEL_DATA[fromId][location.id] ? TRAVEL_DATA[fromId][location.id] : { time: '??', fuelCost: '??' };
            locationsGrid.innerHTML += `<div class="location-card p-6 rounded-lg text-center flex flex-col ${currentClass} ${location.color} ${location.bg}" data-location-id="${location.id}"><h3 class="text-2xl font-orbitron text-cyan-100 drop-shadow-lg">${location.name}</h3><p class="text-gray-300 mt-2">${location.description}</p><div class="location-card-footer mt-auto pt-3 border-t border-cyan-100/10">${!isCurrent ? `<div class="flex justify-around items-center text-center"><div class="flex items-center space-x-2"><svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-gray-400" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-13a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V5z" clip-rule="evenodd" /></svg><div><span class="font-bold font-roboto-mono text-lg">${travelInfo.time}</span><span class="block text-xs text-gray-400">Days</span></div></div><div class="flex items-center space-x-2"><svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-sky-400" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clip-rule="evenodd" /></svg><div><span class="font-bold font-roboto-mono text-lg">${travelInfo.fuelCost}</span><span class="block text-xs text-gray-400">Fuel</span></div></div></div>` : ''}${isCurrent ? '<p class="text-yellow-300 font-bold mt-2">(Currently Docked)</p>' : ''}</div></div>`;
        });
    }

    function setView(viewName) {
        ['market-view', 'travel-view', 'starport-view'].forEach(id => document.getElementById(id).style.display = 'none');
        document.getElementById(viewName).style.display = 'block';
        if (gameState && gameState.player) {
            gameState.currentView = viewName;
        }
        updateUI();
    }

    function updateHeaderNav() {
        if (!gameState || !gameState.player) return;
        const viewName = gameState.currentView;
        const navContainer = document.getElementById('header-nav-buttons');
        const starportUnlocked = gameState.player.starportUnlocked;

        const isMarketActive = viewName === 'market-view';
        const isTravelActive = viewName === 'travel-view';
        const isStarportActive = viewName === 'starport-view';

        const starportDisabled = !starportUnlocked;

        navContainer.innerHTML = `
            <button id="market-button" class="btn btn-header ${isMarketActive ? 'btn-header-active' : ''}" ${isMarketActive ? 'disabled' : ''}>Market</button>
            <button id="travel-button" class="btn btn-header ${isTravelActive ? 'btn-header-active' : ''}" ${isTravelActive ? 'disabled' : ''}>Travel</button>
            <button id="starport-button" class="btn btn-header tooltip-container-below ${isStarportActive ? 'btn-header-active' : ''}" ${starportDisabled ? 'disabled' : ''}>Starport</button>
        `;
    }

    function showTravelView() {
        setView('travel-view');
        document.getElementById('header-title').textContent = 'System Navigation';
        document.getElementById('header-subtitle').textContent = 'Select your next destination.';
        document.getElementById('game-container').className = 'game-container p-4 md:p-8 bg-gradient-to-br from-slate-800 to-slate-900';
    }

    function showMarketView() {
        setView('market-view');
        const location = MARKETS.find(l => l.id === gameState.currentLocationId);
        document.getElementById('header-title').textContent = location.name;
        document.getElementById('header-subtitle').textContent = location.description;
        document.getElementById('game-container').className = `game-container p-4 md:p-8 ${location.bg}`;
        if (gameState && gameState.tutorials && !gameState.tutorials.market) {
            triggerMarketTutorial();
        }
    }

    function triggerMarketTutorial() {
         const tutorialDesc = `Each station has unique <span class='hl'>supplies and demands</span> of cargo.<br><br><span class='hl-green'>Profit</span> by buying cargo at a low price, traveling to different stations, and <span class='hl-green'>selling the cargo for more than your original cost</span>.<br><br>Use Market <span class='hl'>(MKT)</span> info to find a good deal, and Profit/Loss <span class='hl'>(P/L)</span> info to track your potential profit against what you originally paid.`;
         tutorialTimeout = setTimeout(() => {
            queueModal('tutorial-modal', 'The Market', tutorialDesc, () => { gameState.tutorials.market = true; }, { tutorialType: 'market', buttonText: 'Buy low, Sell high', buttonClass: 'btn-pulse-green' });
        }, 1500);
    }

    function showStarportView() {
        setView('starport-view');
        document.getElementById('header-title').textContent = 'Starport';
        document.getElementById('header-subtitle').textContent = 'Vessel acquisition and fleet management.';
        if (gameState && gameState.tutorials && !gameState.tutorials.starport) {
            const desc = `This is the starport where you can purchase ships from the <span class="hl">Shipyard</span> and manage them in your <span class="hl">Hangar</span>.<br><br>Other stations offer different ships, but you can <span class="hl">access your hangar from any station.</span>`;
            tutorialTimeout = setTimeout(() => {
                queueModal('tutorial-modal', 'Ship Management', desc, () => { gameState.tutorials.starport = true; }, { tutorialType: 'starport' });
            }, 2000);
        }
    }

    function updateStarportViewUI() {
        if (!gameState || !gameState.player) return;
        const shipyardEl = document.getElementById('starport-shipyard');
        const hangarEl = document.getElementById('starport-hangar');
        shipyardEl.innerHTML = '';
        hangarEl.innerHTML = '';
        const commonShips = Object.entries(SHIPS).filter(([id, ship]) => !ship.isRare && ship.saleLocationId === gameState.currentLocationId && !gameState.player.ownedShipIds.includes(id));
        const rareShips = Object.entries(SHIPS).filter(([id, ship]) => ship.isRare && ship.saleLocationId === gameState.currentLocationId && !gameState.player.ownedShipIds.includes(id));

        const shipsForSale = [...commonShips];
        rareShips.forEach(shipEntry => {
            if (Math.random() < CONFIG.RARE_SHIP_CHANCE) {
                shipsForSale.push(shipEntry);
            }
        });
        if (shipsForSale.length > 0) {
            shipsForSale.forEach(([id, ship]) => {
                const canAfford = gameState.player.credits >= ship.price;
                shipyardEl.innerHTML += `<div class="ship-card p-4 flex flex-col space-y-3"><div class="flex justify-between items-start"><div><h3 class="text-xl font-orbitron text-cyan-300">${ship.name}</h3><p class="text-sm text-gray-400">Class ${ship.class}</p></div><div class="text-right"><p class="text-lg font-bold text-cyan-300">${formatCredits(ship.price)}</p></div></div><p class="text-sm text-gray-400 flex-grow">${ship.lore}</p><div class="grid grid-cols-3 gap-x-4 text-sm font-roboto-mono text-center pt-2"><div><span class="text-gray-500">Hull:</span> <span class="text-green-400">${ship.maxHealth}</span></div><div><span class="text-gray-500">Fuel:</span> <span class="text-sky-400">${ship.maxFuel}</span></div><div><span class="text-gray-500">Cargo:</span> <span class="text-amber-400">${ship.cargoCapacity}</span></div></div><button class="btn w-full mt-2" data-action="buy-ship" data-ship-id="${id}" ${!canAfford ? 'disabled' : ''}>Purchase</button></div>`;
            });
        } else {
            shipyardEl.innerHTML = '<p class="text-center text-gray-500">No new ships available at this location.</p>';
        }
        gameState.player.ownedShipIds.forEach(id => {
            const shipStatic = SHIPS[id];
            const shipDynamic = gameState.player.shipStates[id];
            const shipInventory = gameState.player.inventories[id];
            const cargoUsed = calculateInventoryUsed(shipInventory);

             const isActive = id === gameState.player.activeShipId;
            const canSell = gameState.player.ownedShipIds.length > 1 && !isActive;
            hangarEl.innerHTML += `<div class="ship-card p-4 flex flex-col space-y-3 ${isActive ? 'border-yellow-400' : ''}"><h3 class="text-xl font-orbitron ${isActive ? 'text-yellow-300' : 'text-cyan-300'} hanger-ship-name" data-tooltip="${shipStatic.lore}">${shipStatic.name}</h3><p class="text-sm text-gray-400 flex-grow">Class ${shipStatic.class}</p><div class="grid grid-cols-3 gap-x-4 text-sm font-roboto-mono text-center pt-2"><div><span class="text-gray-500">Hull:</span> <span class="text-green-400">${Math.floor(shipDynamic.health)}/${shipStatic.maxHealth}</span></div><div><span class="text-gray-500">Fuel:</span> <span class="text-sky-400">${Math.floor(shipDynamic.fuel)}/${shipStatic.maxFuel}</span></div><div><span class="text-gray-500">Cargo:</span> <span class="text-amber-400">${cargoUsed}/${shipStatic.cargoCapacity}</span></div></div><div class="grid grid-cols-2 gap-2 mt-2">${isActive ? '<button class="btn" disabled>ACTIVE</button>' : `<button class="btn" data-action="select-ship" data-ship-id="${id}">Select</button>`}<button class="btn" data-action="sell-ship" data-ship-id="${id}" ${!canSell ? 'disabled' : ''}>Sell (${formatCredits(ship.price * CONFIG.SHIP_SELL_MODIFIER, false)})</button></div></div>`;
        });
    }

    function buyShip(shipId, event) {
        const ship = SHIPS[shipId];
        if (gameState.player.credits < ship.price) { queueModal('event-modal', "Insufficient Funds", "You cannot afford to purchase this ship."); return; }
        gameState.player.credits -= ship.price;
        if (event) {
            createFloatingText(`-${formatCredits(ship.price, false)}`, event.clientX, event.clientY, '#f87171');
        }
        recordFinanceTransaction('ship', -ship.price);
        gameState.player.ownedShipIds.push(shipId);
        gameState.player.shipStates[shipId] = { health: ship.maxHealth, fuel: ship.maxFuel, hullAlerts: { one: false, two: false } };
        gameState.player.inventories[shipId] = {};
        COMMODITIES.forEach(c => { gameState.player.inventories[shipId][c.id] = { quantity: 0, avgCost: 0 }; });
        queueModal('event-modal', "Acquisition Complete", `The ${ship.name} has been transferred to your hangar.`);
        updateStarportViewUI();
        updateUI();
    }

    function sellShip(shipId, event) {
        if (gameState.player.ownedShipIds.length <= 1) { queueModal('event-modal', "Action Blocked", "You cannot sell your last remaining ship."); return; }
        if (shipId === gameState.player.activeShipId) { queueModal('event-modal', "Action Blocked", "You cannot sell your active ship. Please select another vessel first."); return; }
        const inventoryToSell = gameState.player.inventories[shipId];
        const inventoryUsed = calculateInventoryUsed(inventoryToSell);
        if (inventoryUsed > 0) {
            queueModal('event-modal', 'Cannot Sell Ship', 'This vessel\'s cargo hold is not empty. You must sell all cargo from this ship before it can be decommissioned.');
            return;
        }
        const ship = SHIPS[shipId];
        const salePrice = Math.floor(ship.price * CONFIG.SHIP_SELL_MODIFIER);
        gameState.player.credits += salePrice;
        if (event) {
            createFloatingText(`+${formatCredits(salePrice, false)}`, event.clientX, event.clientY, '#34d399');
        }
        recordFinanceTransaction('ship', salePrice);
        gameState.player.ownedShipIds = gameState.player.ownedShipIds.filter(id => id !== shipId);
        delete gameState.player.shipStates[shipId];
        delete gameState.player.inventories[shipId];
        queueModal('event-modal', "Vessel Sold", `You sold the ${ship.name} for ${formatCredits(salePrice)}.`);
        updateStarportViewUI();
        updateUI();
    }

    function setActiveShip(shipId) {
        if (!gameState.player.ownedShipIds.includes(shipId)) return;
        gameState.player.activeShipId = shipId;
        updateUI();
    }

    function queueModal(modalId, title, description, callback = null, options = {}) {
        if (gameState.popupsDisabled && modalId !== 'name-modal') return;
        modalQueue.push({ modalId, title, description, callback, options });
        const activeModal = document.querySelector('.modal-backdrop:not(.hidden)');
        if (!activeModal) {
            processModalQueue();
        }
    }

    function processModalQueue() {
        if (modalQueue.length === 0) return;
        const { modalId, title, description, callback, options } = modalQueue.shift();

        if (modalId === 'age-event-modal') {
            showAgeEventModal(options.event);
        } else {
            _displayModal(modalId, title, description, callback, options);
        }
    }

    function _displayModal(modalId, title, description, callback, options) {
        const modal = document.getElementById(modalId);
        if (!modal) {
            console.error(`Modal with ID ${modalId} not found.`);
            processModalQueue();
            return;
        }

        const titleEl = modal.querySelector('#' + modalId.replace('-modal', '-title'));
        const descEl = modal.querySelector('#' + modalId.replace('-modal', '-description'));
        const btnContainer = modal.querySelector('#' + modalId.replace('-modal', '-button-container'));
        const okButton = modal.querySelector('#' + modalId.replace('-modal', '-ok-button'));

        if(titleEl) titleEl.innerHTML = title;
        if(descEl) descEl.innerHTML = description;
        const closeHandler = () => {
            modal.classList.add('modal-hiding');
            modal.addEventListener('animationend', () => {
                modal.classList.add('hidden');
                modal.classList.remove('modal-hiding');
                processModalQueue();
            }, { once: true });
        };

        let primaryButton;
        if (btnContainer) {
            btnContainer.innerHTML = '';
             if (options.showCancelButton) {
                const cancelButton = document.createElement('button');
                cancelButton.className = 'btn';
                cancelButton.textContent = 'Cancel';
                cancelButton.onclick = closeHandler;
                btnContainer.appendChild(cancelButton);
            }
            const mainButton = document.createElement('button');
            mainButton.className = "btn px-6 py-2";
            if(options.buttonClass) mainButton.classList.add(options.buttonClass);
            mainButton.innerHTML = options.buttonText || 'Understood';
            btnContainer.appendChild(mainButton);
            primaryButton = mainButton;
        } else if (okButton) {
             okButton.innerHTML = options.buttonText || 'Understood';
             okButton.className = "btn px-6 py-2";
             if(options.buttonClass) okButton.classList.add(options.buttonClass);
             primaryButton = okButton;
        }

        primaryButton.onclick = () => {
            const wrappedCallback = () => {
               if (callback) callback();
                closeHandler();
            };
            wrappedCallback();
        };

        if (options.onShow) options.onShow();
        modal.classList.remove('hidden');
        modal.classList.add('modal-visible');
    }

    const DATE_CONFIG = {
        START_YEAR: 2140,
        START_DAY_OF_WEEK: 1,
        DAYS_IN_MONTH: [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31],
        MONTH_NAMES: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
        DAY_NAMES: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
    };
    function getDaySuffix(day) {
        if (day > 3 && day < 21) return 'th';
        switch (day % 10) {
            case 1: return "st";
            case 2: return "nd";
            case 3: return "rd";
            default: return "th";
        }
    }

    function getDateFromDay(dayNumber) {
        const year = DATE_CONFIG.START_YEAR + Math.floor((dayNumber - 1) / 365);
        let dayOfYear = (dayNumber - 1) % 365;
        const dayOfWeek = DATE_CONFIG.DAY_NAMES[(dayNumber - 1 + DATE_CONFIG.START_DAY_OF_WEEK) % 7];
        let monthIndex = 0;
        for (let i = 0; i < DATE_CONFIG.DAYS_IN_MONTH.length; i++) {
            if (dayOfYear < DATE_CONFIG.DAYS_IN_MONTH[i]) {
                monthIndex = i;
                break;
            }
            dayOfYear -= DATE_CONFIG.DAYS_IN_MONTH[i];
        }
        const dayOfMonth = dayOfYear + 1;
        const monthName = DATE_CONFIG.MONTH_NAMES[monthIndex];

        return `${dayOfWeek}, ${monthName} ${dayOfMonth}${getDaySuffix(dayOfMonth)}, ${year}`;
    }

    function showGarnishmentToast(message) {
        const toast = document.getElementById('garnishment-toast');
        if (!toast) return;
        toast.textContent = message;
        toast.classList.remove('hidden');
        toast.style.opacity = '1';
        setTimeout(() => {
            toast.style.opacity = '0';
            setTimeout(() => toast.classList.add('hidden'), 300);
        }, 5000);
    }

    function showHullWarningToast(message) {
        const toast = document.getElementById('hull-warning-toast');
        if (!toast || !toast.classList.contains('hidden')) return;

        toast.textContent = message;
        toast.classList.remove('hidden');
        toast.style.opacity = '1';
        setTimeout(() => {
            toast.style.opacity = '0';
            setTimeout(() => toast.classList.add('hidden'), 300);
        }, 5000);
    }

    function showDebugToast(message) {
        const toast = document.getElementById('debug-toast');
        if (!toast) return;
        toast.textContent = message;
        toast.classList.remove('hidden');
        toast.style.opacity = '1';
        setTimeout(() => {
            toast.style.opacity = '0';
            setTimeout(() => toast.classList.add('hidden'), 1500);
        }, 1200);
    }

    function checkHullWarnings(shipId) {
        const shipState = gameState.player.shipStates[shipId];
        const shipStatic = SHIPS[shipId];
        if (!shipState || !shipStatic || !shipState.hullAlerts) return;

        const healthPct = (shipState.health / shipStatic.maxHealth) * 100;

        if (healthPct <= 15 && !shipState.hullAlerts.two) {
            showHullWarningToast(`System Warning: Hull Health at ${Math.floor(healthPct)}%.`);
            shipState.hullAlerts.two = true;
            shipState.hullAlerts.one = true;
        } else if (healthPct <= 30 && !shipState.hullAlerts.one) {
            showHullWarningToast(`System Warning: Hull Health at ${Math.floor(healthPct)}%.`);
            shipState.hullAlerts.one = true;
        }

        if (healthPct > 30) {
            shipState.hullAlerts.one = false;
        }
        if (healthPct > 15) {
            shipState.hullAlerts.two = false;
        }
    }

    function renderPriceGraph(goodId, marketId, playerItem) {
        const history = gameState.market.priceHistory[marketId]?.[goodId];
        if (!history || history.length < 2) {
            return `<div class="text-gray-400 text-sm p-4">Not enough local price history.</div>`;
        }

        const good = COMMODITIES.find(c => c.id === goodId);
        const staticAvg = (good.basePriceRange[0] + good.basePriceRange[1]) / 2;

        const width = 280;
        const height = 140;
        const padding = 35;

        const prices = history.map(p => p.price);
        const playerBuyPrice = playerItem?.avgCost > 0 ? playerItem.avgCost : null;

        let allValues = [...prices, staticAvg];
        if (playerBuyPrice) allValues.push(playerBuyPrice);

        const minVal = Math.min(...allValues);
        const maxVal = Math.max(...allValues);
        const valueRange = maxVal - minVal > 0 ? maxVal - minVal : 1;
        const getX = (index) => (index / (history.length - 1)) * (width - padding * 2) + padding;
        const getY = (value) => height - padding - ((value - minVal) / valueRange) * (height - padding * 2.5);
        const pricePoints = prices.map((price, i) => `${getX(i)},${getY(price)}`).join(' ');
        const buyPriceY = playerBuyPrice ? getY(playerBuyPrice) : null;
        const staticAvgY = getY(staticAvg);

        let svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
            <rect width="100%" height="100%" fill="#0c101d" />`;

        svg += `<line x1="${padding}" y1="${staticAvgY}" x2="${width - padding}" y2="${staticAvgY}" stroke="#facc15" stroke-width="1.5" stroke-dasharray="4 2" />
                <text x="${width - padding + 2}" y="${staticAvgY + 4}" fill="#facc15" font-size="10" font-family="Roboto Mono" text-anchor="start">Avg</text>`;

        if (buyPriceY) {
            svg += `<line x1="${padding}" y1="${buyPriceY}" x2="${width - padding}" y2="${buyPriceY}" stroke="#34d399" stroke-width="1" stroke-dasharray="3 3" />
                    <text x="${width - padding + 2}" y="${buyPriceY + 4}" fill="#34d399" font-size="10" font-family="Roboto Mono" text-anchor="start">Paid</text>`;
        }

        svg += `<polyline fill="none" stroke="#60a5fa" stroke-width="2" points="${pricePoints}" />
                <text x="${getX(prices.length - 1)}" y="${getY(prices[prices.length - 1]) - 5}" fill="#60a5fa" font-size="10" font-family="Roboto Mono" text-anchor="middle">Price</text>`;
        svg += `<text x="${padding - 5}" y="${getY(minVal) + 4}" fill="#d0d8e8" font-size="10" font-family="Roboto Mono" text-anchor="end">${formatCredits(minVal, false)}</text>
                <text x="${padding - 5}" y="${getY(maxVal) + 4}" fill="#d0d8e8" font-size="10" font-family="Roboto Mono" text-anchor="end">${formatCredits(maxVal, false)}</text>
            </svg>`;
        return svg;
    }

    function renderFinanceGraph() {
        const history = gameState.player.financeHistory;
        if (!history || history.length < 2) {
            return `<div class="text-gray-400 text-sm p-4">Not enough finance history.</div>`;
        }

        const width = 300;
        const height = 140;
        const padding = { top: 20, right: 25, bottom: 20, left: 10 };

        const financeData = history.map(p => p.value);
        const minVal = Math.min(...financeData);
        const maxVal = Math.max(...financeData);
        const valueRange = maxVal - minVal > 0 ? maxVal - minVal : 1;

        const graphWidth = width - padding.left - padding.right;
        const graphHeight = height - padding.top - padding.bottom;

        const getX = (index) => (index / (history.length - 1)) * graphWidth + padding.left;
        const getY = (value) => height - padding.bottom - ((value - minVal) / valueRange) * graphHeight;

        const financePoints = financeData.map((wealth, i) => `${getX(i)},${getY(wealth)}`).join(' ');

        const typeMap = {
            trade: { color: '#facc15', label: 'trade' },
            fuel: { color: '#60a5fa', label: 'fuel' },
            repair: { color: '#34d399', label: 'repair' },
            loan: { color: '#f87171', label: 'loan' },
            ship: { color: '#c084fc', label: 'ship' },
            intel: { color: '#9ca3af', label: 'intel'},
            debug: { color: '#f9a8d4', label: 'debug'},
            debt: { color: '#ef4444', label: 'debt'},
            wager_win: { color: '#a3e635', label: 'wager' },
            wager_loss: { color: '#e11d48', label: 'wager' },
            start: { color: '#d1d5db', label: '' }
        };

        let pointsHtml = '';
        history.forEach((point, i) => {
            if (point.type === 'start') return;
            const x = getX(i);
            const y = getY(point.value);
            const config = typeMap[point.type];

            pointsHtml += `
                <g>
                    <circle class="graph-point" cx="${x}" cy="${y}" r="4" fill="${config.color}" stroke="#0c101d" stroke-width="2" />
                    <text x="${x}" y="${y - 8}" fill="${config.color}" font-size="9" font-family="Roboto Mono" text-anchor="middle" style="pointer-events: none;">${config.label}</text>
                </g>
            `;
        });

        let svg = `<svg id="finance-graph-svg" width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
            <defs>
                <filter id="glow">
                    <feGaussianBlur stdDeviation="2.5" result="coloredBlur"/>
                    <feMerge>
                        <feMergeNode in="coloredBlur"/>
                        <feMergeNode in="SourceGraphic"/>
                    </feMerge>
                </filter>
            </defs>
            <rect width="100%" height="100%" fill="#0c101d" />
            <polyline fill="none" stroke="#60a5fa" stroke-width="2.5" points="${financePoints}" style="filter: url(#glow);" />
            ${pointsHtml}
            <text x="${width / 2}" y="${padding.top - 5}" fill="#d0d8e8" font-size="10" font-family="Roboto Mono" text-anchor="middle">Finance</text>
        </svg>`;

        return svg;
    }

    function updateGraphTooltipPosition() {
        if (!activeGraphAnchor) return;
        const tooltip = document.getElementById('graph-tooltip');
        if (tooltip.style.display === 'none') return;

        const rect = activeGraphAnchor.getBoundingClientRect();
        const tooltipWidth = tooltip.offsetWidth;
        const tooltipHeight = tooltip.offsetHeight;

        let leftPos, topPos;

        if (activeGraphAnchor.dataset.action === 'show-finance-graph') {
            leftPos = rect.left - tooltipWidth - 10;
            topPos = rect.top + (rect.height / 2) - (tooltipHeight / 2);
        } else {
            leftPos = rect.left + (rect.width / 2) - (tooltipWidth / 2);
            topPos = rect.bottom + 5;
        }

        if (leftPos < 10) leftPos = 10;
        if (leftPos + tooltipWidth > window.innerWidth) {
            leftPos = window.innerWidth - tooltipWidth - 10;
        }
        if (topPos + tooltipHeight > window.innerHeight) {
            topPos = rect.top - tooltipHeight - 5;
        }
        if (topPos < 10) topPos = 10;

        tooltip.style.left = `${leftPos}px`;
        tooltip.style.top = `${topPos}px`;
    }

    function showPriceGraph(anchorEl) {
        activeGraphAnchor = anchorEl;
        const tooltip = document.getElementById('graph-tooltip');
        const goodId = anchorEl.dataset.goodId;
        const playerItem = getActiveInventory()[goodId];
        tooltip.innerHTML = renderPriceGraph(goodId, gameState.currentLocationId, playerItem);

        tooltip.style.display = 'block';
        updateGraphTooltipPosition();
    }

    function showFinanceGraph(anchorEl) {
        activeGraphAnchor = anchorEl;
        const tooltip = document.getElementById('graph-tooltip');
        tooltip.innerHTML = renderFinanceGraph();
        tooltip.style.display = 'block';
        updateGraphTooltipPosition();
    }

    function hideGraph() {
        const tooltip = document.getElementById('graph-tooltip');
        activeGraphAnchor = null;
        tooltip.style.display = 'none';
    }

    function createFloatingText(text, x, y, color = '#fde047') {
        const el = document.createElement('div');
        el.textContent = text;
        el.className = 'floating-text';
        const xOffset = (Math.random() - 0.5) * 30;
        const yOffset = (Math.random() - 0.5) * 20;
        el.style.left = `${x - 20 + xOffset}px`;
        el.style.top = `${y - 40 + yOffset}px`;
        el.style.color = color;
        document.body.appendChild(el);
        setTimeout(() => {
            if (document.body.contains(el)) {
                document.body.removeChild(el);
            }
        }, 2450);
    }

    document.body.addEventListener('click', (e) => {
        if (gameState.isGameOver) return;

        // --- TOOLTIPS ---
        // Generic tooltip handling for lore and tutorial tooltips
        const loreTrigger = e.target.closest('.lore-container'); // For lore tooltips
        const tutorialTrigger = e.target.closest('.tutorial-container'); // For tutorial tooltips
        const trigger = loreTrigger || tutorialTrigger; // Combine triggers

        const wasClickInsideTooltip = e.target.closest('.lore-tooltip, .tutorial-tooltip');
        const visibleTooltip = document.querySelector('.lore-tooltip.visible, .tutorial-tooltip.visible');
        if (trigger) {
            const tooltipSelector = trigger.classList.contains('lore-container') ? '.lore-tooltip' : '.tutorial-tooltip';
            const targetTooltip = trigger.querySelector(tooltipSelector);
            if (visibleTooltip && visibleTooltip !== targetTooltip) {
                visibleTooltip.classList.remove('visible');
            }
            if (targetTooltip) { // Check if targetTooltip exists before toggling
                targetTooltip.classList.toggle('visible');
            }
        } else if (visibleTooltip && !wasClickInsideTooltip) { // If click outside, hide visible tooltip
            visibleTooltip.classList.remove('visible');
        }

        // Commodity name tooltip handling
        const commodityTooltipTrigger = e.target.closest('.commodity-name-tooltip');
        // Close any active commodity tooltips that weren't the one just clicked.
        document.querySelectorAll('.tooltip-active').forEach(activeEl => {
            if (activeEl !== commodityTooltipTrigger) {
                activeEl.classList.remove('tooltip-active');
            }
        });
        // Toggle the clicked commodity tooltip.
        if (commodityTooltipTrigger) {
            commodityTooltipTrigger.classList.toggle('tooltip-active');
        }

        // --- GAME ACTIONS ---
        // Travel by clicking a location card
        const locationCard = e.target.closest('.location-card');
        if (locationCard) {
            // If the clicked card is the one for the current location, just show the market.
            if (locationCard.classList.contains('disabled-current')) {
                showMarketView();
            }
            // Otherwise, initiate travel to the new location.
            else {
                travelTo(locationCard.dataset.locationId);
            }
            return;
        }

        // Handle all buttons with a 'data-action' attribute
        const button = e.target.closest('button[data-action]');
        if (button) {
            const action = button.dataset.action;
            const shipId = button.dataset.shipId;
            const goodId = button.dataset.goodId;
            switch(action) {
                case 'buy-ship': if (shipId) buyShip(shipId, e); break;
                case 'sell-ship': if (shipId) sellShip(shipId, e); break;
                case 'select-ship': if (shipId) setActiveShip(shipId); break;
                case 'buy': case 'sell':
                    const qtyInput_trade = document.getElementById(`qty-${goodId}`);
                    const quantity = parseInt(qtyInput_trade.value, 10) || 1;
                    if (action === 'buy') buyItem(goodId, quantity, e);
                    else sellItem(goodId, quantity, e);
                    qtyInput_trade.value = '1';
                    qtyInput_trade.dispatchEvent(new Event('input', { bubbles: true }));
                    break;
                case 'set-max-buy':
                    const qtyInput_max_buy = document.getElementById(`qty-${goodId}`);
                    const price = getPrice(gameState.currentLocationId, goodId);
                    const activeShip = getActiveShip();
                    const spaceAvailable = activeShip.cargoCapacity - calculateInventoryUsed(getActiveInventory());
                    const canAfford = price > 0 ? Math.floor(gameState.player.credits / price) : spaceAvailable;
                    const marketStock = gameState.market.inventory[gameState.currentLocationId][goodId].quantity;
                    qtyInput_max_buy.value = Math.max(0, Math.min(spaceAvailable, canAfford, marketStock));
                    qtyInput_max_buy.dispatchEvent(new Event('input', { bubbles: true }));
                    break;
                case 'set-max-sell':
                    const qtyInput_max_sell = document.getElementById(`qty-${goodId}`);
                    const activeInventory = getActiveInventory();
                    qtyInput_max_sell.value = activeInventory[goodId] ? activeInventory[goodId].quantity : 0;
                    qtyInput_max_sell.dispatchEvent(new Event('input', { bubbles: true }));
                    break;
                case 'increment': case 'decrement':
                     const qtyInput_incdec = document.getElementById(`qty-${goodId}`);
                     let currentValue = parseInt(qtyInput_incdec.value) || 0;
                     qtyInput_incdec.value = (action === 'increment') ? currentValue + 1 : Math.max(1, currentValue - 1);
                     qtyInput_incdec.dispatchEvent(new Event('input', { bubbles: true }));
                     break;
            }
            return; // Stop processing since a button action was handled.
        }

        // Handle other specific buttons in the services panel
        const servicesContainer = e.target.closest('#station-services');
        if(servicesContainer){
            const loanButton = e.target.closest('.btn-loan');
            if(loanButton) {
                const loanDetails = JSON.parse(loanButton.dataset.loanDetails);
                takeLoan(loanDetails);
                return;
            }
            if (e.target.id === 'pay-debt-btn') {
                payOffDebt();
            } else if (e.target.id === 'purchase-intel-btn') {
                purchaseIntel(e.target);
            }
        }
    });

    // --- EVENT LISTENERS & INITIALIZATION ---
    document.body.addEventListener('mouseover', (e) => {
        const priceGraphTarget = e.target.closest('[data-action="show-price-graph"]');
        if (priceGraphTarget) {
            showPriceGraph(priceGraphTarget);
            return;
        }
        const financeGraphTarget = e.target.closest('[data-action="show-finance-graph"]');
        if (financeGraphTarget) {
            showFinanceGraph(financeGraphTarget);
        }
    });

    document.body.addEventListener('mouseout', (e) => {
        const graphTarget = e.target.closest('[data-action="show-price-graph"], [data-action="show-finance-graph"]');
        if (graphTarget) {
            hideGraph();
        }
    });

    const navContainer = document.getElementById('header-nav-buttons');
    navContainer.addEventListener('click', (e) => {
        const button = e.target.closest('button');
        if (!button || gameState.isGameOver) return;
        switch(button.id) {
            case 'travel-button': showTravelView(); break;
            case 'starport-button': showStarportView(); break;
            case 'market-button': showMarketView(); break;
        }
    });

    const starportTooltipEl = document.getElementById('starport-unlock-tooltip');
    navContainer.addEventListener('mouseover', (e) => {
        const button = e.target.closest('#starport-button');
        if (button && button.disabled) {
            starportTooltipEl.classList.remove('hidden');
        }
    });
    navContainer.addEventListener('mouseout', (e) => {
        const button = e.target.closest('#starport-button');
        if (button && button.disabled) {
            starportTooltipEl.classList.add('hidden');
        }
    });

    const refuelBtn = document.getElementById('refuel-btn');
    const stopRefueling = () => {
    if(refuelInterval) {
        clearInterval(refuelInterval);
        refuelInterval = null;
        refuelButtonElement = null;
    }
    if (gameState && gameState.player) {
        const ship = getActiveShip();
        if(ship) document.getElementById('refuel-btn').disabled = ship.fuel >= ship.maxFuel;
    }
};
    const startRefueling = (e) => {
         if (gameState.isGameOver || refuelInterval) return;
         refuelButtonElement = e.currentTarget;
         refuelTick();
         refuelInterval = setInterval(refuelTick, 200);
    }
    const refuelTick = () => {
        const ship = getActiveShip();
        if (ship.fuel >= ship.maxFuel) { stopRefueling(); return; }

        let costPerTick = MARKETS.find(m => m.id === gameState.currentLocationId).fuelPrice / 4;
        if (gameState.player.activePerks.venetian_syndicate && gameState.currentLocationId === 'loc_venus') {
            costPerTick *= PERKS.venetian_syndicate.fuelDiscount;
        }

        if (gameState.player.credits < costPerTick) { stopRefueling(); return; }
        gameState.player.credits -= costPerTick;
        gameState.player.shipStates[ship.id].fuel = Math.min(ship.maxFuel, ship.fuel + 2.5);

        if (refuelButtonElement) {
            const rect = refuelButtonElement.getBoundingClientRect();
            createFloatingText(`-${formatCredits(costPerTick, false)}`, rect.left + rect.width / 2, rect.top, '#f87171');
            recordFinanceTransaction('fuel', -costPerTick);
        }
        updateLiveStats();
    }
    refuelBtn.addEventListener('mousedown', startRefueling);
    refuelBtn.addEventListener('touchstart', (e) => { e.preventDefault(); startRefueling(e); });
    ['mouseup', 'mouseleave', 'touchend'].forEach(evt => document.addEventListener(evt, stopRefueling));

    const repairBtn = document.getElementById('repair-btn');
    const stopRepairing = () => {
    if(repairInterval) {
        clearInterval(repairInterval);
        repairInterval = null;
        repairButtonElement = null;
    }
    if (gameState && gameState.player) {
        const ship = getActiveShip();
        if(ship) document.getElementById('repair-btn').disabled = ship.health >= ship.maxHealth;
    }
};
    const startRepairing = (e) => {
         if (gameState.isGameOver || repairInterval) return;
         repairButtonElement = e.currentTarget;
         repairTick();
         repairInterval = setInterval(repairTick, 200);
    }
    const repairTick = () => {
        const ship = getActiveShip();
        if (ship.health >= ship.maxHealth) { stopRepairing(); return; }

        let costPerTick = (ship.maxHealth * (CONFIG.REPAIR_AMOUNT_PER_TICK / 100)) * CONFIG.REPAIR_COST_PER_HP;
        if (gameState.player.activePerks.venetian_syndicate && gameState.currentLocationId === 'loc_venus') {
            costPerTick *= PERKS.venetian_syndicate.repairDiscount;
        }

        if (gameState.player.credits < costPerTick) { stopRepairing(); return; }
        gameState.player.credits -= costPerTick;
        gameState.player.shipStates[ship.id].health = Math.min(ship.maxHealth, ship.health + (ship.maxHealth * (CONFIG.REPAIR_AMOUNT_PER_TICK / 100)));

        if (repairButtonElement) {
            const rect = repairButtonElement.getBoundingClientRect();
            createFloatingText(`-${formatCredits(costPerTick, false)}`, rect.left + rect.width / 2, rect.top, '#f87171');
            recordFinanceTransaction('repair', -costPerTick);
        }
        updateLiveStats();
        checkHullWarnings(ship.id);
    }
    repairBtn.addEventListener('mousedown', startRepairing);
    repairBtn.addEventListener('touchstart', (e) => { e.preventDefault(); startRepairing(e); });
    ['mouseup', 'mouseleave', 'touchend'].forEach(evt => document.addEventListener(evt, stopRepairing));

    document.addEventListener('keydown', (e) => {
        const travelModalActive = !document.getElementById('travel-animation-modal').classList.contains('hidden');
        if (travelModalActive) {
            e.preventDefault();
            return;
        }

        if (e.key === 'Escape') {
            const ageEventModal = document.getElementById('age-event-modal');
            if (!ageEventModal.classList.contains('hidden')) {
                return; // Do not allow escape if age event is open
            }
            gameState.popupsDisabled = !gameState.popupsDisabled;
            showDebugToast(`Pop-ups ${gameState.popupsDisabled ? 'Enabled' : 'Enabled'}`);
            return;
        }

        const activeModal = document.querySelector('.modal-backdrop:not(.hidden):not(.age-event-modal)');
        if (activeModal) {
            const okButton = activeModal.querySelector('button');
            if (okButton && (e.code === 'Space' || e.key === 'Enter')) {
                e.preventDefault();
                okButton.click();
                return;
            }
        }
        if (gameState.isGameOver || e.ctrlKey || e.metaKey) return;

        const ship = getActiveShip();
        if (!ship) return;

        let message = '';
        switch (e.key) {
            case '!':
                const possibleDestinations = MARKETS.filter(m => m.id !== gameState.currentLocationId && gameState.player.unlockedLocationIds.includes(m.id));
                if (possibleDestinations.length > 0) {
                    const randomDestination = possibleDestinations[Math.floor(Math.random() * possibleDestinations.length)];

                    const activeShip = getActiveShip();
                    const validEvents = RANDOM_EVENTS.filter(event => event.precondition(gameState, activeShip));

                    if (validEvents.length > 0) {
                        const event = validEvents[Math.floor(Math.random() * validEvents.length)];
                        triggerEvent(event, randomDestination.id);
                        message = `Debug: Triggering event '${event.title}' & traveling to ${randomDestination.name}.`;
                    } else {
                        initiateTravel(randomDestination.id);
                        message = `Debug: No valid event. Traveling to ${randomDestination.name}.`;
                    }
                } else {
                    message = `Debug: No available destinations to travel to.`;
                }
                break;
            case '@':
                gameState.player.credits += 1000000000000; // 1 Trillion
                Object.keys(SHIPS).forEach(shipId => {
                    if (!gameState.player.ownedShipIds.includes(shipId)) {
                        const newShip = SHIPS[shipId];
                        gameState.player.ownedShipIds.push(shipId);
                        gameState.player.shipStates[shipId] = { health: newShip.maxHealth, fuel: newShip.maxFuel, hullAlerts: { one: false, two: false } };
                        gameState.player.inventories[shipId] = {};
                        COMMODITIES.forEach(c => { gameState.player.inventories[shipId][c.id] = { quantity: 0, avgCost: 0 }; });
                    }
                });
                message = `Debug: +1T Credits & all ships unlocked.`;
                break;
            case '#':
                advanceDays(365);
                message = `Debug: Time advanced 1 year.`;
                break;
        }

        if(message) {
            showDebugToast(message);
            updateUI();
            checkMilestones();
        }
    });
    window.addEventListener('resize', () => {
         const marketView = document.getElementById('market-view');
         if(marketView.style.display !== 'none') {
             updateMarketViewUI();
         }
         updateGraphTooltipPosition();
    });
    window.addEventListener('scroll', updateGraphTooltipPosition, true);

    function checkEvents() {
        AGE_EVENTS.forEach(event => {
            if (gameState.player.seenEvents.includes(event.id)) return;

            let triggerMet = false;
            if (event.trigger.day && gameState.day >= event.trigger.day) {
                triggerMet = true;
            }
            if (event.trigger.credits && gameState.player.credits >= event.trigger.credits) {
                triggerMet = true;
            }

            if (triggerMet) {
                gameState.player.seenEvents.push(event.id);
                queueModal('age-event-modal', null, null, null, { event: event });
            }
        });
    }

    function showAgeEventModal(event) {
        const modal = document.getElementById('age-event-modal');
        const titleEl = document.getElementById('age-event-title');
        const descEl = document.getElementById('age-event-description');
        const btnContainer = document.getElementById('age-event-button-container');

        titleEl.textContent = event.title;
        descEl.innerHTML = event.description;
        btnContainer.innerHTML = '';

        event.choices.forEach(choice => {
            const button = document.createElement('button');
            button.className = 'perk-button';
            button.innerHTML = `<h4>${choice.title}</h4><p>${choice.description}</p>`;
            button.onclick = () => {
                applyPerk(choice);
                modal.classList.add('modal-hiding');
                modal.addEventListener('animationend', () => {
                    modal.classList.add('hidden');
                    modal.classList.remove('modal-hiding');
                    processModalQueue();
                }, { once: true });
            };
            btnContainer.appendChild(button);
        });

        modal.classList.remove('hidden');
        modal.classList.add('modal-visible');
    }

    function applyPerk(choice) {
        if (choice.perkId) {
            gameState.player.activePerks[choice.perkId] = true;
        }
        if (choice.playerTitle) {
            gameState.player.playerTitle = choice.playerTitle;
        }

        if (choice.perkId === 'merchant_guild_ship') {
            const shipId = 'hauler_c1';
            if (!gameState.player.ownedShipIds.includes(shipId)) {
                const ship = SHIPS[shipId];
                gameState.player.ownedShipIds.push(shipId);
                gameState.player.shipStates[shipId] = { health: ship.maxHealth, fuel: ship.maxFuel, hullAlerts: { one: false, two: false } };
                gameState.player.inventories[shipId] = {};
                COMMODITIES.forEach(c => { gameState.player.inventories[shipId][c.id] = { quantity: 0, avgCost: 0 }; });
                queueModal('event-modal', 'Vessel Delivered', `The Merchant's Guild has delivered a brand new ${ship.name} to your hangar.`);
            }
        }
        updateUI();
    }

    function initializeGame() {
        const splashScreen = document.getElementById('splash-screen');
        const gameContainer = document.getElementById('game-container');

        // Hide the splash screen
        splashScreen.classList.add('modal-hiding');
        splashScreen.addEventListener('animationend', () => {
            splashScreen.style.display = 'none';

            // Show the main game container
            gameContainer.classList.remove('hidden');

            // Show the name prompt
            showNamePrompt();
        }, { once: true });
    }

    function main() {
        document.getElementById('start-game-btn').addEventListener('click', initializeGame);
    }

    main();
});