// js/services/TutorialService.js
import { TUTORIAL_DATA } from '../data/gamedata.js';

export class TutorialService {
    constructor(gameState, uiManager, simulationService) {
        this.gameState = gameState;
        this.uiManager = uiManager;
        this.simulationService = simulationService; // Added simulationService
        this.activeBatchId = null;
        this.activeStepId = null;
    }

    checkState(actionData = null) {
        if (this.activeBatchId && this.activeStepId) {
            const batch = TUTORIAL_DATA[this.activeBatchId];
            const step = batch.steps.find(s => s.stepId === this.activeStepId);

            if (step && this._matchesCondition(step.completion, actionData)) {
                this.advanceStep();
            }
            return;
        }

        for (const batchId in TUTORIAL_DATA) {
            const batch = TUTORIAL_DATA[batchId];
            const hasBeenSeen = this.gameState.tutorials.seenBatchIds.includes(batchId);
            const isSkipped = this.gameState.tutorials.skippedTutorialBatches.includes(batchId);

            if (!hasBeenSeen && !isSkipped) {
                const triggerAction = { type: 'VIEW_LOAD', viewId: this.gameState.currentView };
                if (this._matchesCondition(batch.trigger, triggerAction)) {
                    this.triggerBatch(batchId);
                    break;
                }
            }
        }
    }

    triggerBatch(batchId) {
        if (!TUTORIAL_DATA[batchId]) return;

        const batch = TUTORIAL_DATA[batchId];
        // If the tutorial is triggered by a view load, switch to that view
        if (batch.trigger.type === 'VIEW_LOAD') {
            if (this.gameState.currentView !== batch.trigger.viewId) {
                this.simulationService.setView(batch.trigger.viewId);
            }
        }

        this.activeBatchId = batchId;
        this.gameState.tutorials.activeBatchId = batchId;
        
        if (!this.gameState.tutorials.seenBatchIds.includes(batchId)) {
            this.gameState.tutorials.seenBatchIds.push(batchId);
        }

        const firstStepId = batch.steps[0].stepId;
        this._displayStep(firstStepId);
        this.gameState.setState(this.gameState);
    }

    skipActiveTutorial() {
        if (!this.activeBatchId) return;
        if (!this.gameState.tutorials.skippedTutorialBatches.includes(this.activeBatchId)) {
            this.gameState.tutorials.skippedTutorialBatches.push(this.activeBatchId);
        }
        this._endBatch();
        this.gameState.setState(this.gameState);
    }
    
    advanceStep() {
        if (!this.activeStepId || !this.activeBatchId) return;
        const batch = TUTORIAL_DATA[this.activeBatchId];
        const step = batch.steps.find(s => s.stepId === this.activeStepId);
        
        this.uiManager.hideTutorialToast();
        if (step && step.nextStepId) {
            this._displayStep(step.nextStepId);
        } else {
            this._endBatch();
        }
    }

    _displayStep(stepId) {
        if (!this.activeBatchId) return;
        const batch = TUTORIAL_DATA[this.activeBatchId];
        const step = batch.steps.find(s => s.stepId === stepId);

        if (!step) {
            this._endBatch();
            return;
        }
        
        if (step.completion.action === 'buy-item' && this.gameState.player.credits < 1000) {
            return;
        }

        this.activeStepId = stepId;
        this.gameState.tutorials.activeStepId = stepId;

        this.uiManager.showTutorialToast({
            step: step,
            onSkip: () => this.uiManager.showSkipTutorialModal(() => this.skipActiveTutorial()),
            onNext: () => this.advanceStep()
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
                return condition.action === actionData.action;
            case 'INFO': // Always true when checked, relies on manual "Next" click
                return true;
            default:
                return false;
        }
    }
}