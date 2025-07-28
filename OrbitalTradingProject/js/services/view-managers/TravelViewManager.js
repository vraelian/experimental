// js/services/view-managers/TravelViewManager.js
import { MARKETS } from '../../data/gamedata.js';

export class TravelViewManager {
    constructor(cache) {
        this.cache = cache;
    }

    render(gameState) {
        const { player, currentLocationId, TRAVEL_DATA } = gameState;
        this.cache.locationsGrid.innerHTML = MARKETS
            .filter(loc => player.unlockedLocationIds.includes(loc.id))
            .map(location => {
                const isCurrent = location.id === currentLocationId;
                const travelInfo = isCurrent ? null : TRAVEL_DATA[currentLocationId][location.id];
                return `<div class="location-card p-6 rounded-lg text-center flex flex-col ${isCurrent ? 'highlight-current' : ''} ${location.color} ${location.bg}" data-action="travel" data-location-id="${location.id}">
                    <h3 class="text-2xl font-orbitron">${location.name}</h3>
                    <p class="text-gray-300 mt-2 flex-grow">${location.description}</p>
                    <div class="location-card-footer mt-auto pt-3 border-t border-cyan-100/10">
                    ${isCurrent 
                        ? '<p class="text-yellow-300 font-bold mt-2">(Currently Docked)</p>' 
                        : `<div class="flex justify-around items-center text-center">
                               <div class="flex items-center space-x-2">
                                   <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-gray-400" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-13a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V5z" clip-rule="evenodd" /></svg>
                                   <div><span class="font-bold font-roboto-mono text-lg">${travelInfo.time}</span><span class="block text-xs text-gray-400">Days</span></div>
                               </div>
                               <div class="flex items-center space-x-2">
                                   <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-sky-400" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clip-rule="evenodd" /></svg>
                                   <div><span class="font-bold font-roboto-mono text-lg">${travelInfo.fuelCost}</span><span class="block text-xs text-gray-400">Fuel</span></div>
                               </div>
                           </div>`
                    }
                    </div>
                </div>`;
            }).join('');
    }
}