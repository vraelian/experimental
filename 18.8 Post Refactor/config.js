const CONFIG = {
    STARTING_CREDITS: 8000,
    STARTING_DEBT: 25000,
    STARTING_DEBT_INTEREST: 125, // Weekly interest for the initial 25k debt
    INTEL_COST_PERCENTAGE: 0.20,
    INTEL_MIN_CREDITS: 5000,
    INTEL_CHANCE: 0.3,
    REPAIR_COST_PER_HP: 75,
    REPAIR_AMOUNT_PER_TICK: 10, // Repair 10% of max hull per tick
    INTEREST_INTERVAL: 7,
    PASSIVE_REPAIR_RATE: 0.02,
    HULL_DECAY_PER_TRAVEL_DAY: 1 / 7,
    INTEL_DEMAND_MOD: 1.8,
    INTEL_DEPRESSION_MOD: 0.5,
    SHIP_SELL_MODIFIER: 0.75,
    RARE_SHIP_CHANCE: 0.3,
    SAVE_KEY: 'orbitalTraderSave_v2',
    PRICE_HISTORY_LENGTH: 50,
    FINANCE_HISTORY_LENGTH: 10,
    DAILY_PRICE_VOLATILITY: 0.035,
    MEAN_REVERSION_STRENGTH: 0.01,
    LOAN_GARNISHMENT_DAYS: 180,
    LOAN_GARNISHMENT_PERCENT: 0.14,
    RANDOM_EVENT_CHANCE: 0.07,
    COMMODITY_MILESTONES: [
        { threshold: 30000, unlockLevel: 2, message: "Your growing reputation has unlocked access to more advanced industrial hardware.<br>New opportunities await." },
        { threshold: 300000, unlockLevel: 3, message: "Word of your success is spreading. High-tech biological and medical markets are now open to you.", unlocksLocation: 'loc_uranus' },
        { threshold: 5000000, unlockLevel: 4, message: "Your influence is undeniable. Contracts for planetary-scale infrastructure are now within your reach.", unlocksLocation: 'loc_neptune' },
        { threshold: 75000000, unlockLevel: 5, message: "You now operate on a level few can comprehend. The most exotic and reality-bending goods are available to you.", unlocksLocation: 'loc_pluto'},
        { threshold: 100000000, message: "Your name is legend. You've been granted clearance to 'Kepler's Eye', a deep space observatory with unique scientific demands.", unlocksLocation: 'loc_kepler'},
        { threshold: 500000000, unlockLevel: 6, message: "You now operate on a level few can comprehend. The most exotic and reality-bending goods are available to you.", unlocksLocation: 'loc_exchange' }
    ]
};