// js/services/view-managers/HUDManager.js
import { SHIPS } from '../../data/gamedata.js';
import { formatCredits, calculateInventoryUsed, getDateFromDay } from '../../utils.js';

export class HUDManager {
    constructor(cache) {
        this.cache = cache;
    }

    render(gameState) {
        const { player, day } = gameState;
        this.updateTime(day);
        this.updateVesselDetails(gameState);
        this.updateLiveHUD(gameState);
        this.cache.captainInfo.innerHTML = `<span>${player.playerTitle} ${player.name}, ${player.playerAge}</span><span class="graph-icon" data-action="show-finance-graph">📈</span>`;
        this.renderFinancePanel(gameState);
    }

    updateTime(day) {
        this.cache.gameDay.textContent = day;
        this.cache.gameDate.textContent = getDateFromDay(day);
    }

    updateVesselDetails(gameState) {
        const shipStatic = SHIPS[gameState.player.activeShipId];
        this.cache.vesselDetails.innerHTML = `<div class="text-right"><p class="text-gray-400 text-sm tracking-wider">Vessel</p><p>${shipStatic.name}</p><p>Class: ${shipStatic.class}</p></div>`;
    }

    updateLiveHUD(gameState) {
        if (!gameState || !gameState.player) return;
        const { player } = gameState;
        const shipStatic = SHIPS[player.activeShipId];
        const shipState = player.shipStates[player.activeShipId];
        const inventory = player.inventories[player.activeShipId];
        const cargoUsed = calculateInventoryUsed(inventory);

        this.cache.shipHealth.textContent = `${Math.floor(shipState.health)}%`;
        this.cache.cargoSpace.textContent = `${cargoUsed}/${shipStatic.cargoCapacity}`;
        this.cache.shipFuel.textContent = `${Math.floor(shipState.fuel)}/${shipStatic.maxFuel}`;
        this.cache.shipFuelBar.style.width = `${(shipState.fuel / shipStatic.maxFuel) * 100}%`;
    }

    calculateWeeklyInterest(player) {
        if (!player || player.debt <= 0) return 0;
        if (player.weeklyInterestAmount > 0) return player.weeklyInterestAmount;
        return Math.ceil(player.debt * 0.01);
    }

    renderFinancePanel(gameState) {
        const { player } = gameState;
        const weeklyInterest = this.calculateWeeklyInterest(player);
        if (player.debt > 0) {
            this.cache.financePanel.className = 'panel-border border border-slate-700 bg-black/30 p-4 rounded-lg mb-6 grid grid-cols-3 items-center text-center';
            this.cache.financePanel.innerHTML = `
                <div><span class="block text-sm text-cyan-400 uppercase tracking-wider">Credits</span><span class="text-xl font-bold font-roboto-mono text-cyan-300">${formatCredits(player.credits, false)}</span></div>
                <div><span class="block text-sm text-red-400 uppercase tracking-wider">Debt</span><span class="text-xl font-bold font-roboto-mono text-red-400">${formatCredits(player.debt, false)}</span></div>
                <div><span class="block text-sm text-red-400 uppercase tracking-wider">Interest / 7d</span><span class="text-xl font-bold font-roboto-mono text-red-400">${formatCredits(weeklyInterest, false)}</span></div>`;
        } else {
             this.cache.financePanel.className = 'panel-border border border-slate-700 bg-black/30 p-4 rounded-lg mb-6 grid grid-cols-1 items-center text-center';
             this.cache.financePanel.innerHTML = `<div><span class="block text-sm text-cyan-400 uppercase tracking-wider">Credits</span><span class="text-2xl font-bold font-roboto-mono text-cyan-300">${formatCredits(player.credits, false)}</span></div>`;
        }
    }
}