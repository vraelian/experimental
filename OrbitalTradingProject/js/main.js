// js/main.js
import { GameState } from './services/GameState.js';
import { SimulationService } from './services/SimulationService.js';
import { UIManager } from './services/UIManager.js';
import { EventManager } from './services/EventManager.js';

document.addEventListener('DOMContentLoaded', () => {
    const splashScreen = document.getElementById('splash-screen');
    const gameContainer = document.getElementById('game-container');
    const startButton = document.getElementById('start-game-btn');

    startButton.addEventListener('click', showNamePrompt, { once: true });

    function showNamePrompt() {
        splashScreen.classList.add('modal-hiding');
        splashScreen.addEventListener('animationend', () => { splashScreen.style.display = 'none'; }, { once: true });
        gameContainer.classList.remove('hidden');
        const nameModal = document.getElementById('name-modal');
        const nameInput = document.getElementById('player-name-input');
        const buttonContainer = document.getElementById('name-modal-buttons');
        buttonContainer.innerHTML = '';
        const confirmButton = document.createElement('button');
        confirmButton.id = 'confirm-name-button';
        confirmButton.className = 'btn px-6 py-2 w-full sm:w-auto';
        confirmButton.textContent = 'Confirm';
        const startGameWithName = () => {
            const playerName = nameInput.value.trim() || 'Captain';
            nameModal.classList.add('hidden');
            startGame(playerName);
        };
        confirmButton.onclick = startGameWithName;
        nameInput.addEventListener('keyup', (e) => { if (e.key === 'Enter') confirmButton.click(); });
        buttonContainer.appendChild(confirmButton);
        nameModal.classList.remove('hidden');
        nameInput.focus();
    }

    function startGame(playerName) {
        // --- Service Instantiation ---
        const gameState = new GameState();
        const uiManager = new UIManager();
        const simulationService = new SimulationService(gameState, uiManager);
        const eventManager = new EventManager(gameState, simulationService, uiManager);

        // --- Game Initialization ---
        const hasSave = gameState.loadGame();
        if (!hasSave) {
            gameState.startNewGame(playerName);
            console.log("Pre-rendering all views...");
            uiManager.render(gameState.getState()); // Initial full render
            document.getElementById('travel-view').classList.add('active-view');
            simulationService.showIntroSequence();
        }

        // --- Bindings ---
        eventManager.bindEvents();
        gameState.subscribe((newState, oldState) => {
            if (newState.currentView !== oldState.currentView) {
                uiManager.render(newState); // Full render on view change
                return;
            }

            // --- Granular Updates ---
            if (newState.player.activeShipId !== oldState.player.activeShipId) uiManager.render(newState);
            else {
                if (newState.day !== oldState.day) uiManager.updateTime(newState.day);
                if (newState.player.credits !== oldState.player.credits || newState.player.debt !== oldState.player.debt) {
                    uiManager.renderFinancePanel(newState);
                    if (newState.currentView === 'market-view') uiManager.updateLiveServices(newState);
                }
                const newShipState = newState.player.shipStates[newState.player.activeShipId];
                const oldShipState = oldState.player.shipStates[oldState.player.activeShipId];
                if (newShipState && oldShipState && (newShipState.health !== oldShipState.health || newShipState.fuel !== oldShipState.fuel)) {
                   uiManager.updateLiveHUD(newState);
                   if (newState.currentView === 'market-view') uiManager.updateLiveServices(newState);
                }
                if (JSON.stringify(newState.player.inventories) !== JSON.stringify(oldState.player.inventories)) {
                    uiManager.renderInventoryList(newState);
                    uiManager.updateLiveHUD(newState);
                }
                 if (newState.currentView === 'market-view') {
                     if (JSON.stringify(newState.market) !== JSON.stringify(oldState.market) ||
                         JSON.stringify(newState.intel) !== JSON.stringify(oldState.intel)) {
                         uiManager.marketViewManager.render(newState);
                     }
                 }
                 if (newState.currentView === 'starport-view') {
                    if(JSON.stringify(newState.player.ownedShipIds) !== JSON.stringify(oldState.player.ownedShipIds)) {
                        uiManager.starportViewManager.render(newState);
                    }
                 }
            }
        });
        
        uiManager.render(gameState.getState()); // Initial full render after setup
    }
});