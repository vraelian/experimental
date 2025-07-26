import { gameState } from './services/GameState.js';
import SimulationService from './services/SimulationService.js';
import UIManager from './services/UIManager.js';
import EventManager from './services/EventManager.js';
import { SHIPS, CONFIG } from './data/gamedata.js';

class App {
    constructor() {
        this.splashScreen = document.getElementById('splash-screen');
        this.gameContainer = document.getElementById('game-container');
        this.startButton = document.getElementById('start-game-btn');
    }

    init() {
        this.startButton.addEventListener('click', () => this.showNamePrompt(), { once: true });
    }

    showNamePrompt() {
        this.splashScreen.classList.add('modal-hiding');
        this.splashScreen.addEventListener('animationend', () => {
            this.splashScreen.style.display = 'none';
        }, { once: true });

        this.gameContainer.classList.remove('hidden');
        
        const nameModal = document.getElementById('name-modal');
        const nameInput = document.getElementById('player-name-input');
        const confirmButton = document.createElement('button');
        
        confirmButton.textContent = 'Confirm';
        confirmButton.className = 'btn px-6 py-2 w-full sm:w-auto';
        
        const nameModalButtons = document.getElementById('name-modal-buttons');
        nameModalButtons.innerHTML = '';
        nameModalButtons.appendChild(confirmButton);

        const startGameWithName = () => {
            const playerName = nameInput.value.trim() || 'Captain';
            nameModal.classList.add('hidden');
            this.startGame(playerName);
        };

        confirmButton.addEventListener('click', startGameWithName);
        nameInput.addEventListener('keyup', (e) => {
            if (e.key === 'Enter') startGameWithName();
        });
        
        nameModal.classList.remove('hidden');
        nameInput.focus();
    }

    startGame(playerName) {
        this.uiManager = new UIManager();
        this.simulationService = new SimulationService(gameState, this.uiManager);
        this.eventManager = new EventManager(gameState, this.simulationService, this.uiManager);
        
        gameState.subscribe((state) => this.uiManager.render(state));

        const hasSave = gameState.loadGame();
        if (!hasSave) {
            gameState.startNewGame(playerName);
            this.showIntroSequence();
        }
        
        this.eventManager.bindEvents();
    }

    showIntroSequence() {
        const state = gameState.getState();
        const starterShip = SHIPS[state.player.activeShipId];
        const introTitle = `Captain ${state.player.name}`;
        const introDesc = `<i>The year is 2140... a new era of trade has begun.</i>
        <div class="my-3 border-t-2 border-cyan-600/40"></div>
        You've borrowed <span class="hl-blue">⌬ ${CONFIG.STARTING_DEBT.toLocaleString()} Credits</span> to acquire a used freighter, the <span class="hl">${starterShip.name}</span>.
        <div class="my-3 border-t-2 border-cyan-600/40"></div>
        Make your fortune, pay your debts, and carve your name among the stars.`;
        
        this.uiManager.queueModal('event-modal', introTitle, introDesc, null, { buttonText: `Embark on the ${starterShip.name}`});
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const app = new App();
    app.init();
});