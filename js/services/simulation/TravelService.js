// js/services/simulation/TravelService.js
import { CONFIG } from '../../data/config.js';
import { SHIPS, MARKETS, RANDOM_EVENTS, PERKS } from '../../data/gamedata.js';

export class TravelService {
    constructor(gameState, simulationService, uiManager) {
        this.gameState = gameState;
        this.simulationService = simulationService; // For access to _getActiveShip etc.
        this.uiManager = uiManager;
    }

    travelTo(locationId) {
        const state = this.gameState.getState();
        if (state.isGameOver || state.pendingTravel) return;
        if (state.currentLocationId === locationId) {
            this.simulationService.setView('market-view');
            return;
        }

        const activeShip = this.simulationService._getActiveShip();
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

        const activeShip = this.simulationService._getActiveShip();
        const activeShipState = this.gameState.player.shipStates[activeShip.id];
        
        if (activeShip.fuel < travelInfo.fuelCost) {
            this.uiManager.queueModal('event-modal', "Insufficient Fuel", `Trip modifications left you without enough fuel. You need ${travelInfo.fuelCost} but only have ${Math.floor(activeShip.fuel)}.`);
            return;
        }

        if (eventMods.forceEvent) {
            if (this._checkForRandomEvent(locationId, true)) {
                return;
            }
        }

        let travelHullDamage = travelInfo.time * CONFIG.HULL_DECAY_PER_TRAVEL_DAY;
        if (state.player.activePerks.navigator) travelHullDamage *= PERKS.navigator.hullDecayMod;
        const eventHullDamageValue = activeShip.maxHealth * ((eventMods.eventHullDamagePercent || 0) / 100);
        const totalHullDamageValue = travelHullDamage + eventHullDamageValue;
        
        activeShipState.health -= totalHullDamageValue;
        this.simulationService._checkHullWarnings(activeShip.id);

        if (activeShipState.health <= 0) {
            this.simulationService._handleShipDestruction(activeShip.id);
            return;
        }
        
        activeShipState.fuel -= travelInfo.fuelCost;
        this.simulationService._advanceDays(travelInfo.time);

        if (this.gameState.isGameOver) return;
        
        this.gameState.setState({ currentLocationId: locationId, pendingTravel: null });

        const fromLocation = MARKETS.find(m => m.id === fromId);
        const destination = MARKETS.find(m => m.id === locationId);
        const totalHullDamagePercentForDisplay = (totalHullDamageValue / activeShip.maxHealth) * 100;
        
        this.uiManager.showTravelAnimation(fromLocation, destination, travelInfo, totalHullDamagePercentForDisplay, () => {
            this.simulationService.setView('market-view');
        });
    }
    
    resumeTravel() {
        if (!this.gameState.pendingTravel) return;
        const { destinationId, ...eventMods } = this.gameState.pendingTravel;
        this.initiateTravel(destinationId, eventMods);
    }

    _checkForRandomEvent(destinationId, force = false) {
        if (!force && Math.random() > CONFIG.RANDOM_EVENT_CHANCE) return false;

        const activeShip = this.simulationService._getActiveShip();
        const validEvents = RANDOM_EVENTS.filter(event => 
            event.precondition(this.gameState.getState(), activeShip, this.simulationService._getActiveInventory.bind(this.simulationService))
        );
        if (validEvents.length === 0) return false;

        const event = validEvents[Math.floor(Math.random() * validEvents.length)];
        this.gameState.setState({ pendingTravel: { destinationId } });
        this.uiManager.showRandomEventModal(event, (eventId, choiceIndex) => this.simulationService._resolveEventChoice(eventId, choiceIndex));
        return true;
    }
}