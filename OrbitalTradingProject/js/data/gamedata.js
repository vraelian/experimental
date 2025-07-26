// This file will now export all the game data constants.
// I have combined the relevant data from the original gamedata.js
// and added DATE_CONFIG which was previously in game.js.

import { calculateInventoryUsed } from '../utils.js';

export const DATE_CONFIG = {
    START_YEAR: 2140,
    START_DAY_OF_WEEK: 1,
    DAYS_IN_MONTH: [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31],
    MONTH_NAMES: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
    DAY_NAMES: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
};

export const LOCATION_VISUALS = {
    'loc_earth': '🌍', 'loc_luna': '🌕', 'loc_mars': '🔴', 'loc_venus': '🟡',
    'loc_belt': '🪨', 'loc_saturn': '🪐', 'loc_jupiter': '🟠', 'loc_uranus': '🔵',
    'loc_neptune': '🟣', 'loc_pluto': '🪩', 'loc_exchange': '🏴‍☠️', 'loc_kepler': '👁️'
};

// ... (Paste the entire content of PERKS, AGE_EVENTS, RANDOM_EVENTS, SHIPS, COMMODITIES, and MARKETS from the stable gamedata.js here)
// Make sure the precondition functions in RANDOM_EVENTS that rely on getActiveInventory are updated
// to accept it as a parameter, e.g.:
// precondition: (gameState, activeShip, getActiveInventory) => (getActiveInventory()['plasteel']?.quantity || 0) >= 5,
// precondition: (gameState, activeShip, getActiveInventory) => calculateInventoryUsed(getActiveInventory()) > 0,