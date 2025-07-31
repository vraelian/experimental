// js/services/view-managers/MarketViewManager.js
import { CONFIG } from '../../data/config.js';
import { SHIPS, COMMODITIES, MARKETS, PERKS } from '../../data/gamedata.js';
import { formatCredits } from '../../utils.js';

export class MarketViewManager {
    constructor(cache, uiManager) {
        this.cache = cache;
        this.uiManager = uiManager; // For shared methods like getItemPrice
    }

    render(gameState) {
        const availableCommodities = COMMODITIES.filter(c => c.unlockLevel <= gameState.player.unlockedCommodityLevel);
        const marketHtml = availableCommodities.map(good => this.uiManager.isMobile ? this._getMarketItemHtmlMobile(good, gameState) : this._getMarketItemHtmlDesktop(good, gameState)).join('');
        this.cache.marketPrices.innerHTML = marketHtml;
        this.renderInventoryList(gameState);
        this.renderStationServices(gameState);
        this.renderIntel(gameState);
    }

    renderInventoryList(gameState) {
        const inventory = gameState.player.inventories[gameState.player.activeShipId];
        const ownedGoods = Object.entries(inventory).filter(([, item]) => item.quantity > 0);
        this.cache.playerInventory.classList.toggle('hidden', ownedGoods.length === 0);
        if (ownedGoods.length > 0) {
            this.cache.inventoryList.innerHTML = ownedGoods.map(([goodId, item]) => {
                const good = COMMODITIES.find(c => c.id === goodId);
                const tooltipText = `${good.lore}\n\nAvg. Cost: ${formatCredits(item.avgCost, false)}`;
                return `<div class="p-2 rounded-lg border-2 ${good.styleClass} cargo-item-tooltip" style="filter: drop-shadow(0 4px 3px rgba(0, 0, 0, 0.4));" data-tooltip="${tooltipText}"><div class="font-semibold text-sm commodity-name text-outline">${good.name}</div><div class="text-lg text-center text-cyan-300 text-outline">(${item.quantity})</div></div>`;
            }).join('');
        }
    }

    renderStationServices(gameState) {
        const { player, currentLocationId, day } = gameState;
        this.updateLiveServices(gameState);
        this.cache.debtContainer.innerHTML = '';
        if (player.debt > 0) {
            let garnishmentTimerHtml = '';
            if (player.loanStartDate) {
                const daysRemaining = CONFIG.LOAN_GARNISHMENT_DAYS - (day - player.loanStartDate);
                if (daysRemaining > 0) garnishmentTimerHtml = `<p class="text-xs text-red-400/70 mt-2">Garnishment in ${daysRemaining} days</p>`;
            }
            this.cache.debtContainer.innerHTML = `<h4 class="font-orbitron text-xl mb-2">Debt</h4><button data-action="pay-debt" class="btn w-full py-3 bg-red-800/80 hover:bg-red-700/80 border-red-500" ${player.credits >= player.debt ? '' : 'disabled'}>Pay Off ${formatCredits(player.debt, false)}</button>${garnishmentTimerHtml}`;
        } else {
            this.cache.debtContainer.innerHTML = `<h4 class="font-orbitron text-xl mb-2">Financing</h4>`;
            const dynamicLoanAmount = Math.floor(player.credits * 3.5);
            const dynamicLoanFee = Math.floor(dynamicLoanAmount * 0.1);
            const dynamicLoanInterest = Math.floor(dynamicLoanAmount * 0.01);
            const dynamicLoanData = { amount: dynamicLoanAmount, fee: dynamicLoanFee, interest: dynamicLoanInterest };
            const loanButtonsHtml = [
                { key: '10000', amount: 10000, fee: 600, interest: 125 },
                { key: 'dynamic', ...dynamicLoanData }
            ].map((loan) => `<button class="btn btn-loan w-full p-2 mt-2 loan-btn-tooltip" data-action="take-loan" data-loan-details='${JSON.stringify(loan)}' ${player.credits < loan.fee ? 'disabled' : ''} data-tooltip="Fee: ${formatCredits(loan.fee, false)}\nInterest: ${formatCredits(loan.interest, false)} / 7d"><span class="font-orbitron text-cyan-300">⌬ ${formatCredits(loan.amount, false)}</span></button>`).join('');
            this.cache.debtContainer.innerHTML += `<div class="flex justify-center gap-4 w-full">${loanButtonsHtml}</div>`;
        }
    }

    renderIntel(gameState) {
        const { intel, player, currentLocationId, day } = gameState;
        this.cache.intelDisplay.classList.add('hidden');
        if (intel.active) {
            const daysLeft = intel.active.endDay - day;
            if (daysLeft > 0) {
                const targetMarket = MARKETS.find(m => m.id === intel.active.targetMarketId);
                const commodity = COMMODITIES.find(c => c.id === intel.active.commodityId);
                let intelText = (intel.active.type === 'demand')
                    ? `A contact reports a <span class="hl-pulse-green">high demand</span> for <span class="font-bold text-yellow-300">${commodity.name}</span> at <span class="font-bold text-cyan-300">${targetMarket.name}</span>! The window is closing: <span class="font-bold">${daysLeft}</span> days left.`
                    : `The market for <span class="font-bold text-yellow-300">${commodity.name}</span> at <span class="font-bold text-cyan-300">${targetMarket.name}</span> has crashed. Prices will be depressed for <span class="font-bold">${daysLeft}</span> days.`;
                this.cache.intelDisplay.className = intel.active.type === 'demand' ? 'p-3 rounded-lg my-4 text-center bg-cyan-900/40 border border-cyan-700' : 'p-3 rounded-lg my-4 text-center bg-red-900/40 border border-red-700';
                this.cache.intelDisplay.innerHTML = `<p>${intelText}</p>`;
                this.cache.intelDisplay.classList.remove('hidden');
            }
        }
        this.cache.intelPurchaseContainer.innerHTML = '';
        const alwaysHasIntel = ['loc_exchange', 'loc_kepler'].includes(currentLocationId);
        if ((alwaysHasIntel || intel.available[currentLocationId]) && !intel.active && player.credits >= CONFIG.INTEL_MIN_CREDITS) {
            const intelCost = Math.floor(player.credits * CONFIG.INTEL_COST_PERCENTAGE);
            this.cache.intelPurchaseContainer.innerHTML = `<button data-action="purchase-intel" class="btn btn-intel" data-cost="${intelCost}">Purchase Intel (${formatCredits(intelCost)})</button>`;
        }
    }

    updateLiveServices(gameState) {
        if (!gameState || !gameState.player) return;
        const { player, currentLocationId } = gameState;
        const shipStatic = SHIPS[player.activeShipId];
        const shipState = player.shipStates[player.activeShipId];
        this.cache.servicesCreditMirror.innerHTML = `<span class="text-cyan-400">⌬ </span><span class="font-bold text-cyan-300 ml-auto">${formatCredits(player.credits, false)}</span>`;
        document.getElementById('refuel-feedback-bar').style.width = `${(shipState.fuel / shipStatic.maxFuel) * 100}%`;
        document.getElementById('repair-feedback-bar').style.width = `${(shipState.health / shipStatic.maxHealth) * 100}%`;
        this.cache.repairBtn.disabled = shipState.health >= shipStatic.maxHealth;
        this.cache.refuelBtn.disabled = shipState.fuel >= shipStatic.maxFuel;

        const currentMarket = MARKETS.find(m => m.id === currentLocationId);
        let fuelPrice = currentMarket.fuelPrice / 4;
        if (player.activePerks.venetian_syndicate && currentLocationId === 'loc_venus') fuelPrice *= (1 - PERKS.venetian_syndicate.fuelDiscount);
        this.cache.fuelPrice.textContent = formatCredits(fuelPrice, false);

        let costPerRepairTick = (shipStatic.maxHealth * (CONFIG.REPAIR_AMOUNT_PER_TICK / 100)) * CONFIG.REPAIR_COST_PER_HP;
        if (player.activePerks.venetian_syndicate && currentLocationId === 'loc_venus') costPerRepairTick *= (1 - PERKS.venetian_syndicate.repairDiscount);
        this.cache.repairCost.textContent = formatCredits(costPerRepairTick, false);
    }
    
    _getMarketItemHtmlDesktop(good, gameState) {
        const { player, market, currentLocationId } = gameState;
        const playerItem = player.inventories[player.activeShipId][good.id];
        const price = this.uiManager.getItemPrice(gameState, good.id);
        const sellPrice = this.uiManager.getItemPrice(gameState, good.id, true);
        const galacticAvg = market.galacticAverages[good.id];
        const marketStock = market.inventory[currentLocationId][good.id];
        const currentLocation = MARKETS.find(m => m.id === currentLocationId);
        const isSpecialDemand = currentLocation.specialDemand && currentLocation.specialDemand[good.id];
        const buyDisabled = isSpecialDemand ? 'disabled' : '';
        const nameTooltip = isSpecialDemand ? `data-tooltip="${currentLocation.specialDemand[good.id].lore}"` : `data-tooltip="${good.lore}"`;
        const playerInvDisplay = playerItem && playerItem.quantity > 0 ? ` <span class='text-cyan-300'>(${playerItem.quantity})</span>` : '';
        const graphIcon = `<span class="graph-icon" data-action="show-price-graph" data-good-id="${good.id}">📈</span>`;
        const { marketIndicatorHtml, plIndicatorHtml } = this.uiManager._getIndicatorHtml(price, sellPrice, galacticAvg, playerItem, false);
        return `
        <div class="item-card-container">
            <div class="bg-black/20 p-4 rounded-lg flex justify-between items-center border ${good.styleClass} transition-colors shadow-md h-32">
                <div class="flex flex-col h-full justify-between flex-grow self-start pt-1">
                    <div>
                         <p class="font-bold commodity-name text-outline commodity-name-tooltip" ${nameTooltip}>${good.name}${playerInvDisplay}</p>
                         <p class="font-roboto-mono text-xl font-bold text-left pt-2 price-text text-outline flex items-center">${formatCredits(price)}</p>
                    </div>
                    <div class="text-sm self-start pb-1 text-outline flex items-center gap-3">
                        <span>Avail: ${marketStock.quantity} ${graphIcon}</span>
                        <div class="flex items-center gap-2">${marketIndicatorHtml}${plIndicatorHtml}</div>
                    </div>
                </div>
                <div class="flex items-center space-x-2">
                    <div class="flex flex-col items-center"><div class="flex flex-col space-y-1">
                        <button class="btn item-btn" data-action="buy" data-good-id="${good.id}" ${buyDisabled}>Buy</button>
                        <button class="btn btn-sm item-btn" data-action="set-max-buy" data-good-id="${good.id}" ${buyDisabled}>Max</button>
                    </div></div>
                    <div class="flex flex-col items-center">
                        <button class="qty-btn" data-action="increment" data-good-id="${good.id}">+</button>
                        <input type="number" class="qty-input p-2 my-1" id="qty-${good.id}" data-good-id="${good.id}" value="1" min="1">
                        <button class="qty-btn" data-action="decrement" data-good-id="${good.id}">-</button>
                    </div>
                    <div class="flex flex-col items-center"><div class="flex flex-col space-y-1">
                        <button class="btn item-btn" data-action="sell" data-good-id="${good.id}">Sell</button>
                        <button class="btn btn-sm item-btn" data-action="set-max-sell" data-good-id="${good.id}">Max</button>
                    </div></div>
                </div>
            </div>
        </div>`;
    }

    _getMarketItemHtmlMobile(good, gameState) {
        const { player, market, currentLocationId } = gameState;
        const playerItem = player.inventories[player.activeShipId][good.id];
        const price = this.uiManager.getItemPrice(gameState, good.id);
        const sellPrice = this.uiManager.getItemPrice(gameState, good.id, true);
        const galacticAvg = market.galacticAverages[good.id];
        const marketStock = market.inventory[currentLocationId][good.id];
        const currentLocation = MARKETS.find(m => m.id === currentLocationId);
        const isSpecialDemand = currentLocation.specialDemand && currentLocation.specialDemand[good.id];
        const buyDisabled = isSpecialDemand ? 'disabled' : '';
        const nameTooltip = isSpecialDemand ? `data-tooltip="${currentLocation.specialDemand[good.id].lore}"` : `data-tooltip="${good.lore}"`;
        const playerInvDisplay = playerItem && playerItem.quantity > 0 ? ` <span class='text-cyan-300'>(${playerItem.quantity})</span>` : '';
        const graphIcon = `<span class="graph-icon" data-action="show-price-graph" data-good-id="${good.id}">📈</span>`;
        const { marketIndicatorHtml } = this.uiManager._getIndicatorHtml(price, sellPrice, galacticAvg, playerItem, true);
        return `
        <div class="item-card-container">
            <div class="bg-black/20 p-4 rounded-lg flex flex-col border ${good.styleClass} shadow-md">
                <div class="flex justify-between items-start w-full mb-2">
                    <div class="flex-grow">
                        <p class="font-bold commodity-name text-outline commodity-name-tooltip" ${nameTooltip}>${good.name}${playerInvDisplay}</p>
                        <p class="font-roboto-mono text-xl font-bold text-left pt-2 price-text text-outline flex items-center">${formatCredits(price)}</p>
                    </div>
                    <div class="text-right text-sm flex-shrink-0 ml-2 text-outline">Avail: ${marketStock.quantity} ${graphIcon}</div>
                </div>
                ${marketIndicatorHtml}
                <div class="flex justify-end items-end mt-2">
                    <div class="mobile-controls-wrapper">
                        <div class="flex flex-col items-center space-y-1">
                            <button class="btn item-btn" data-action="buy" data-good-id="${good.id}" ${buyDisabled}>Buy</button>
                            <button class="btn btn-sm item-btn" data-action="set-max-buy" data-good-id="${good.id}" ${buyDisabled}>Max</button>
                        </div>
                        <div class="flex flex-col items-center space-y-1">
                            <button class="qty-btn" data-action="increment" data-good-id="${good.id}">+</button>
                            <input type="number" class="qty-input" id="qty-${good.id}-mobile" data-good-id="${good.id}" value="1" min="1">
                            <button class="qty-btn" data-action="decrement" data-good-id="${good.id}">-</button>
                        </div>
                        <div class="flex flex-col items-center space-y-1">
                            <button class="btn item-btn" data-action="sell" data-good-id="${good.id}">Sell</button>
                            <button class="btn btn-sm item-btn" data-action="set-max-sell" data-good-id="${good.id}">Max</button>
                        </div>
                    </div>
                </div>
            </div>
        </div>`;
    }
}