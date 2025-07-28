// js/services/view-managers/StarportViewManager.js
import { CONFIG } from '../../data/config.js';
import { SHIPS } from '../../data/gamedata.js';
import { formatCredits, calculateInventoryUsed } from '../../utils.js';

export class StarportViewManager {
    constructor(cache) {
        this.cache = cache;
    }

    render(gameState) {
        const { player, currentLocationId } = gameState;
        const shipyardEl = this.cache.starportShipyard;
        const hangarEl = this.cache.starportHangar;
        shipyardEl.innerHTML = '';
        hangarEl.innerHTML = '';

        // Render Shipyard
        const commonShips = Object.entries(SHIPS).filter(([id, ship]) => !ship.isRare && ship.saleLocationId === currentLocationId && !player.ownedShipIds.includes(id));
        const rareShips = Object.entries(SHIPS).filter(([id, ship]) => ship.isRare && ship.saleLocationId === currentLocationId && !player.ownedShipIds.includes(id));
        const shipsForSale = [...commonShips];
        rareShips.forEach(shipEntry => { if (Math.random() < CONFIG.RARE_SHIP_CHANCE) shipsForSale.push(shipEntry); });

        if (shipsForSale.length > 0) {
            shipsForSale.forEach(([id, ship]) => {
                const canAfford = player.credits >= ship.price;
                shipyardEl.innerHTML += `<div class="ship-card p-4 flex flex-col space-y-3"><div class="flex justify-between items-start"><div><h3 class="text-xl font-orbitron text-cyan-300">${ship.name}</h3><p class="text-sm text-gray-400">Class ${ship.class}</p></div><div class="text-right"><p class="text-lg font-bold text-cyan-300">${formatCredits(ship.price)}</p></div></div><p class="text-sm text-gray-400 flex-grow">${ship.lore}</p><div class="grid grid-cols-3 gap-x-4 text-sm font-roboto-mono text-center pt-2"><div><span class="text-gray-500">Hull:</span> <span class="text-green-400">${ship.maxHealth}</span></div><div><span class="text-gray-500">Fuel:</span> <span class="text-sky-400">${ship.maxFuel}</span></div><div><span class="text-gray-500">Cargo:</span> <span class="text-amber-400">${ship.cargoCapacity}</span></div></div><button class="btn w-full mt-2" data-action="buy-ship" data-ship-id="${id}" ${!canAfford ? 'disabled' : ''}>Purchase</button></div>`;
            });
        } else {
            shipyardEl.innerHTML = '<p class="text-center text-gray-500">No new ships available at this location.</p>';
        }

        // Render Hangar
        player.ownedShipIds.forEach(id => {
            const shipStatic = SHIPS[id];
            const shipDynamic = player.shipStates[id];
            const shipInventory = player.inventories[id];
            const cargoUsed = calculateInventoryUsed(shipInventory);
            const isActive = id === player.activeShipId;
            const canSell = player.ownedShipIds.length > 1 && !isActive;
            const salePrice = Math.floor(shipStatic.price * CONFIG.SHIP_SELL_MODIFIER);
            hangarEl.innerHTML += `<div class="ship-card p-4 flex flex-col space-y-3 ${isActive ? 'border-yellow-400' : ''}"><h3 class="text-xl font-orbitron ${isActive ? 'text-yellow-300' : 'text-cyan-300'} hanger-ship-name" data-tooltip="${shipStatic.lore}">${shipStatic.name}</h3><p class="text-sm text-gray-400 flex-grow">Class ${shipStatic.class}</p><div class="grid grid-cols-3 gap-x-4 text-sm font-roboto-mono text-center pt-2"><div><span class="text-gray-500">Hull:</span> <span class="text-green-400">${Math.floor(shipDynamic.health)}/${shipStatic.maxHealth}</span></div><div><span class="text-gray-500">Fuel:</span> <span class="text-sky-400">${Math.floor(shipDynamic.fuel)}/${shipStatic.maxFuel}</span></div><div><span class="text-gray-500">Cargo:</span> <span class="text-amber-400">${cargoUsed}/${shipStatic.cargoCapacity}</span></div></div><div class="grid grid-cols-2 gap-2 mt-2">${isActive ? '<button class="btn" disabled>ACTIVE</button>' : `<button class="btn" data-action="select-ship" data-ship-id="${id}">Select</button>`}<button class="btn" data-action="sell-ship" data-ship-id="${id}" ${!canSell ? 'disabled' : ''}>Sell (${formatCredits(salePrice, false)})</button></div></div>`;
        });
    }
}