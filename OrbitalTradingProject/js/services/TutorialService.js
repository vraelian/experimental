// js/services/TutorialService.js
import { TUTORIAL_DATA } from '../data/gamedata.js';

export class TutorialService {
    constructor(gameState, uiManager) {
        this.gameState = gameState;
        this.uiManager = uiManager;
        this.activeBatchId = null;
        this.activeStepId = null;
    }

    /**
     * The primary method called on game updates and player actions to evaluate tutorial state.
     * @param {object | null} actionData - Data about the player's action, e.g., { type: 'ACTION', action: 'buy-item' }.
     */
    checkState(actionData = null) {
        // 1. Check for completion of the current active step
        if (this.activeBatchId && this.activeStepId) {
            const batch = TUTORIAL_DATA[this.activeBatchId];
            const step = batch.steps.find(s => s.stepId === this.activeStepId);

            if (this._matchesCondition(step.completion, actionData)) {
                this.uiManager.hideTutorialToast();
                if (step.nextStepId) {
                    this._displayStep(step.nextStepId);
                } else {
                    this._endBatch();
                }
            }
            return; // Don't check for new triggers if a tutorial is active
        }

        // 2. If no batch is active, check for new triggers
        for (const batchId in TUTORIAL_DATA) {
            const batch = TUTORIAL_DATA[batchId];
            const hasBeenSeen = this.gameState.tutorials.seenBatchIds.includes(batchId);
            const isSkipped = this.gameState.tutorials.skippedTutorialBatches.includes(batchId);

            if (!hasBeenSeen && !isSkipped) {
                const triggerAction = { type: 'VIEW_LOAD', viewId: this.gameState.currentView };
                if (this._matchesCondition(batch.trigger, triggerAction)) {
                    this.triggerBatch(batchId);
                    break; // Activate the first one found and stop checking
                }
            }
        }
    }

    /**
     * Manually starts or restarts a tutorial batch.
     * @param {string} batchId - The ID of the batch to trigger.
     */
    triggerBatch(batchId) {
        if (!TUTORIAL_DATA[batchId]) return;

        this.activeBatchId = batchId;
        this.gameState.tutorials.activeBatchId = batchId;
        
        // Mark as seen immediately
        if (!this.gameState.tutorials.seenBatchIds.includes(batchId)) {
            this.gameState.tutorials.seenBatchIds.push(batchId);
        }

        const firstStepId = TUTORIAL_DATA[batchId].steps[0].stepId;
        this._displayStep(firstStepId);
        this.gameState.setState(this.gameState);
    }

    /**
     * Skips the currently active tutorial batch.
     */
    skipActiveTutorial() {
        if (!this.activeBatchId) return;

        if (!this.gameState.tutorials.skippedTutorialBatches.includes(this.activeBatchId)) {
            this.gameState.tutorials.skippedTutorialBatches.push(this.activeBatchId);
        }
        this._endBatch();
        this.gameState.setState(this.gameState);
    }
    
    // --- Private Helper Methods ---

    _displayStep(stepId) {
        if (!this.activeBatchId) return;
        
        const batch = TUTORIAL_DATA[this.activeBatchId];
        const step = batch.steps.find(s => s.stepId === stepId);

        if (!step) {
            this._endBatch();
            return;
        }

        // Soft-lock prevention check [cite: 53]
        if (step.completion.action === 'buy-item' && this.gameState.player.credits < 1000) { // Assuming a low cost for tutorial item
             // Don't show the toast if the player can't afford it
            return;
        }

        this.activeStepId = stepId;
        this.gameState.tutorials.activeStepId = stepId;

        this.uiManager.showTutorialToast({
            step: step,
            onSkip: () => this.uiManager.showSkipTutorialModal(() => this.skipActiveTutorial())
        });
    }

    _endBatch() {
        this.uiManager.hideTutorialToast();
        this.activeBatchId = null;
        this.activeStepId = null;
        this.gameState.tutorials.activeBatchId = null;
        this.gameState.tutorials.activeStepId = null;
    }

    _matchesCondition(condition, actionData) {
        if (!condition || !actionData) return false;

        // Handle array of conditions (all must be met)
        if (Array.isArray(condition)) {
            return condition.every(c => this._matchesSingleCondition(c, actionData));
        }
        return this._matchesSingleCondition(condition, actionData);
    }
    
    _matchesSingleCondition(condition, actionData) {
        if (condition.type !== actionData.type) return false;

        switch (condition.type) {
            case 'VIEW_LOAD':
                return condition.viewId === actionData.viewId;
            case 'ACTION':
                // For tutorial purposes, a generic 'buy-item' or 'sell-item' is enough.
                // The specific goodId isn't checked to allow player freedom.
                return condition.action === actionData.action.replace(/-.*/, ''); // 'buy-item' becomes 'buy'
            default:
                return false;
        }
    }
}