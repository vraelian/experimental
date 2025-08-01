// js/main.js
import { GameState } from './services/GameState.js';
import { SimulationService } from './services/SimulationService.js';
import { UIManager } from './services/UIManager.js';
import { EventManager } from './services/EventManager.js';
import { TutorialService } from './services/TutorialService.js';

document.addEventListener('DOMContentLoaded', () => {
    // --- App Initialization ---
    const splashScreen = document.getElementById('splash-screen');
    const gameContainer = document.getElementById('game-container');
    const startButton = document.getElementById('start-game-btn');

    startButton.addEventListener('click', showNamePrompt, { once: true });

    function showNamePrompt() {
        splashScreen.classList.add('modal-hiding');
        splashScreen.addEventListener('animationend', () => {
            splashScreen.style.display = 'none';
        }, { once: true });

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
        nameInput.addEventListener('keyup', (e) => {
            if (e.key === 'Enter') confirmButton.click();
        });

        buttonContainer.appendChild(confirmButton);
        nameModal.classList.remove('hidden');
        nameInput.focus();
    }

    function startGame(playerName) {
        // --- Service Instantiation ---
        const gameState = new GameState();
        const uiManager = new UIManager();
        const simulationService = new SimulationService(gameState, uiManager);
        const tutorialService = new TutorialService(gameState, uiManager, simulationService);
        
        // Now that all services are created, inject dependencies
        simulationService.setTutorialService(tutorialService);

        const eventManager = new EventManager(gameState, simulationService, uiManager, tutorialService);

        // --- Game Initialization ---
        const hasSave = gameState.loadGame();
        if (!hasSave) {
            gameState.startNewGame(playerName);
            simulationService.showIntroSequence();
        }

        // --- Bindings ---
        eventManager.bindEvents();
        gameState.subscribe(() => uiManager.render(gameState.getState()));
        
        // Initial render
        uiManager.render(gameState.getState());
        tutorialService.checkState({ type: 'SCREEN_LOAD', screenId: gameState.activeScreen });
    }
});