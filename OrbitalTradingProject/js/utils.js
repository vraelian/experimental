// js/utils.js
import { DATE_CONFIG } from './data/dateConfig.js';

export function formatCredits(amount, withSymbol = true) {
    const num = Math.floor(amount);
    const prefix = withSymbol ? '⌬ ' : '';
    if (num >= 1e12) return `${prefix}${(num / 1e12).toFixed(2)}T`;
    if (num >= 1e9) return `${prefix}${(num / 1e9).toFixed(2)}B`;
    if (num >= 1e6) return `${prefix}${(num / 1e6).toFixed(2)}M`;
    if (num >= 1e3) return `${prefix}${(num / 1e3).toFixed(1)}k`;
    return `${prefix}${num.toLocaleString()}`;
}

export function calculateInventoryUsed(inventory) {
     if (!inventory) return 0;
    return Object.values(inventory).reduce((acc, item) => acc + item.quantity, 0);
}

function getDaySuffix(day) {
    if (day > 3 && day < 21) return 'th';
    switch (day % 10) {
        case 1: return "st";
        case 2: return "nd";
        case 3: return "rd";
        default: return "th";
    }
}

export function getDateFromDay(dayNumber) {
    const year = DATE_CONFIG.START_YEAR + Math.floor((dayNumber - 1) / 365);
    let dayOfYear = (dayNumber - 1) % 365;
    const dayOfWeek = DATE_CONFIG.DAY_NAMES[(dayNumber - 1 + DATE_CONFIG.START_DAY_OF_WEEK) % 7];
    let monthIndex = 0;
    for (let i = 0; i < DATE_CONFIG.DAYS_IN_MONTH.length; i++) {
        if (dayOfYear < DATE_CONFIG.DAYS_IN_MONTH[i]) {
            monthIndex = i;
            break;
        }
        dayOfYear -= DATE_CONFIG.DAYS_IN_MONTH[i];
    }
    const dayOfMonth = dayOfYear + 1;
    const monthName = DATE_CONFIG.MONTH_NAMES[monthIndex];
    return `${dayOfWeek}, ${monthName} ${dayOfMonth}${getDaySuffix(dayOfMonth)}, ${year}`;
}

export function skewedRandom(min, max) {
    let rand = (Math.random() + Math.random() + Math.random()) / 3;
    return Math.floor(min + (max - min) * Math.pow(rand, 0.5));
}