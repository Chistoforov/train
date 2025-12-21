const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const https = require('https');
const path = require('path');
const GTFSParser = require('./gtfs-parser');

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.static('public'));

// Store fixed disappearance times for trains
// Key: trainNr_scheduledTime, Value: fixed disappearance time (Date)
const fixedDisappearanceTimes = new Map();

// HTTPS Agent to ignore SSL errors
const agent = new https.Agent({
    rejectUnauthorized: false
});

// Station ID mappings
// User IDs (from frontend) -> Comboios.live IDs -> CP Internal IDs (for itinerary API)
const STATION_MAP = {
    '94-21014': { liveId: '94-69187', cpId: '9434007', cpIdHyphen: '94-34007' }, // Carcavelos
    '94-20006': { liveId: '94-69005', cpId: '9430005', cpIdHyphen: '94-30005' }, // Cais do Sodre
    '94-2006': { liveId: '94-2006', cpId: '9420006', cpIdHyphen: '94-20006' }    // Porto Campanha
};

// CP API Configuration
const CP_API_KEY = 'ca3923e4-1d3c-424f-a3d0-9554cf3ef859';
const CP_API_BASE = 'https://api-gateway.cp.pt/cp/services/travel-api';

// GTFS Parser
let gtfsParser = null;
try {
    gtfsParser = new GTFSParser('./GTFS');
    gtfsParser.load();
    console.log('✅ GTFS data loaded successfully');
} catch (error) {
    console.log('⚠️  GTFS data not available:', error.message);
}

// GTFS Station ID mapping
const GTFS_STATION_MAP = {
    '94-21014': '94_69187', // Carcavelos
    '94-20006': '94_69005', // Cais do Sodre
};

// Cascais Line Station Order (Cais do Sodre -> Cascais)
const CASCAIS_LINE = [
    { id: '94-69005', cpId: '9430005', name: 'Cais do Sodre', minutes: 0 },
    { id: '94-69013', cpId: '9430013', name: 'Santos', minutes: 2 },
    { id: '94-69039', cpId: '9430039', name: 'Alcantara-Mar', minutes: 4 },
    { id: '94-69054', cpId: '9430054', name: 'Belem', minutes: 6 },
    { id: '94-69088', cpId: '9430088', name: 'Alges', minutes: 8 },
    { id: '94-69104', cpId: '9430104', name: 'Cruz Quebrada', minutes: 10 },
    { id: '94-69120', cpId: '9430120', name: 'Caxias', minutes: 12 },
    { id: '94-69146', cpId: '9430146', name: 'Paco de Arcos', minutes: 14 },
    { id: '94-69161', cpId: '9430161', name: 'Santo Amaro', minutes: 16 },
    { id: '94-69179', cpId: '9430179', name: 'Oeiras', minutes: 18 },
    { id: '94-69187', cpId: '9430187', name: 'Carcavelos', minutes: 20 },
    { id: '94-69203', cpId: '9430203', name: 'Parede', minutes: 22 },
    { id: '94-69229', cpId: '9430229', name: 'Sao Pedro do Estoril', minutes: 24 },
    { id: '94-69237', cpId: '9430237', name: 'Sao Joao do Estoril', minutes: 26 },
    { id: '94-69245', cpId: '9430245', name: 'Estoril', minutes: 28 },
    { id: '94-69252', cpId: '9430252', name: 'Monte Estoril', minutes: 30 },
    { id: '94-69260', cpId: '9430260', name: 'Cascais', minutes: 32 }
];

// Static schedule for Cascais Line (Cais do Sodre -> Cascais direction)
// From Lisbon (Cais do Sodré) to Carcavelos
const STATIC_SCHEDULE_CAIS_TO_CASCAIS_DAILY = [
    '05:30', '06:00', '06:30', '07:00', '07:20', '07:40', '08:00', '08:20',
    '08:40', '09:00', '09:20', '09:40', '10:00', '10:20', '10:40', '11:00',
    '11:20', '11:40', '12:00', '12:20', '12:40', '13:00', '13:20', '13:40',
    '14:00', '14:20', '14:40', '15:00', '15:20', '15:40', '16:00', '16:20',
    '16:40', '17:00', '17:20', '17:40', '18:00', '18:20', '18:40', '19:00',
    '19:20', '19:40', '20:00', '20:20', '20:40', '21:00', '21:30', '22:00',
    '22:30', '23:00', '23:30', '00:00', '00:30', '01:00', '01:30'
];

// Additional weekday-only schedule (Monday-Friday) for Cais do Sodré -> Carcavelos
const STATIC_SCHEDULE_CAIS_TO_CASCAIS_WEEKDAYS = [
    '07:12', '07:24', '07:36', '07:48', '08:12', '08:24', '08:36', '08:48',
    '09:12', '16:12', '16:24', '16:36', '16:48', '17:12', '17:24', '17:36',
    '17:48', '18:12', '18:24', '18:36', '18:48', '19:12', '19:24', '19:36',
    '19:48', '20:12'
];

// Reverse schedule (Cascais -> Cais do Sodre)
// From Carcavelos to Lisbon (Cais do Sodré)
const STATIC_SCHEDULE_CASCAIS_TO_CAIS_DAILY = [
    '05:40', '06:10', '06:30', '06:50', '07:10', '07:30', '07:50', '08:10',
    '08:30', '08:50', '09:10', '09:30', '09:50', '10:10', '10:30', '10:50',
    '11:10', '11:30', '11:50', '12:10', '12:30', '12:50', '13:10', '13:30',
    '13:50', '14:10', '14:30', '14:50', '15:10', '15:30', '15:50', '16:10',
    '16:30', '16:50', '17:10', '17:30', '17:50', '18:10', '18:30', '18:50',
    '19:10', '19:30', '19:50', '20:10', '20:30', '20:50', '21:10', '21:40',
    '22:10', '22:40', '23:10', '23:40', '00:10', '00:40', '01:10', '01:40',
    '02:10'
];

// Additional weekday-only schedule (Monday-Friday) for Carcavelos -> Cais do Sodré
const STATIC_SCHEDULE_CASCAIS_TO_CAIS_WEEKDAYS = [
    '07:22', '07:34', '07:46', '07:58', '08:22', '08:34', '08:46', '08:58',
    '09:22', '16:22', '16:34', '16:46', '16:58', '17:22', '17:34', '17:46',
    '17:58', '18:22', '18:34', '18:46', '18:58', '19:22', '19:34', '19:46',
    '19:58', '20:22'
];

// Helper function to get schedule based on day of week
function getScheduleForDay(dailySchedule, weekdaySchedule) {
    const now = new Date();
    const dayOfWeek = now.getDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
    const isWeekday = dayOfWeek >= 1 && dayOfWeek <= 5; // Monday to Friday
    
    if (isWeekday) {
        // Combine daily and weekday schedules, remove duplicates, and sort
        const combined = [...dailySchedule, ...weekdaySchedule];
        const unique = [...new Set(combined)];
        return unique.sort((a, b) => {
            const [hA, mA] = a.split(':').map(Number);
            const [hB, mB] = b.split(':').map(Number);
            const timeA = hA * 60 + mA;
            const timeB = hB * 60 + mB;
            return timeA - timeB;
        });
    } else {
        // Weekend: only daily schedule
        return dailySchedule;
    }
}

function parseTime(timeStr) {
    const [hours, minutes] = timeStr.split(':').map(Number);
    const date = new Date();
    date.setHours(hours, minutes, 0, 0);
    return date;
}

function findNextScheduledTime(now, schedule, stationOffsetMinutes) {
    // Find the next scheduled departure from origin, then add station offset
    for (const scheduledTimeStr of schedule) {
        const scheduledTime = parseTime(scheduledTimeStr);
        const arrivalAtStation = new Date(scheduledTime.getTime() + stationOffsetMinutes * 60000);
        
        // If this train hasn't arrived yet at our station
        if (arrivalAtStation > now) {
            return {
                scheduledTime: scheduledTimeStr,
                arrivalTime: arrivalAtStation,
                minutesToArrival: Math.round((arrivalAtStation - now) / 60000)
            };
        }
    }
    // If all trains passed, return first train tomorrow
    const firstTomorrow = parseTime(schedule[0]);
    firstTomorrow.setDate(firstTomorrow.getDate() + 1);
    const arrivalTomorrow = new Date(firstTomorrow.getTime() + stationOffsetMinutes * 60000);
    return {
        scheduledTime: schedule[0],
        arrivalTime: arrivalTomorrow,
        minutesToArrival: Math.round((arrivalTomorrow - now) / 60000)
    };
}

// Mock data generator
function getMockTrains(stationId) {
    const now = new Date();
    const trains = [];
    for (let i = 0; i < 5; i++) {
        const offset = (i * 15) + Math.floor(Math.random() * 10) + 2; 
        const departure = new Date(now.getTime() + offset * 60000);
        const hours = departure.getHours().toString().padStart(2, '0');
        const minutes = departure.getMinutes().toString().padStart(2, '0');
        const delay = Math.random() > 0.8 ? Math.floor(Math.random() * 10) + 1 : 0;
        const status = delay > 0 ? delay.toString() : "P";
        
            trains.push({
                trainNr: 10000 + i,
                scheduledTime: `${hours}:${minutes}`,
                trainStatus: status
            });
    }
    return trains;
}

// Try to fetch schedule from CP API
async function fetchCPSchedule(fromId, toId, date) {
    // Try different header combinations
    const headerSets = [
        {
            'x-api-key': CP_API_KEY,
            'User-Agent': 'CP/3.4.0 (Android)',
            'Accept': 'application/json',
            'Origin': 'https://www.cp.pt',
            'Referer': 'https://www.cp.pt/'
        },
        {
            'x-api-key': CP_API_KEY,
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'application/json',
            'Origin': 'https://www.cp.pt',
            'Referer': 'https://www.cp.pt/',
            'X-Requested-With': 'XMLHttpRequest'
        },
        {
            'x-api-key': CP_API_KEY,
            'User-Agent': 'CP-Mobile/3.4.0',
            'Accept': 'application/json',
            'Content-Type': 'application/json'
        }
    ];

    // Convert numeric ID to hyphenated format (9434007 -> 94-34007)
    const fromIdHyphen = fromId.length === 7 ? `94-${fromId.slice(2)}` : fromId;
    const toIdHyphen = toId.length === 7 ? `94-${toId.slice(2)}` : toId;
    
    // Try multiple endpoint variations with different ID formats
    // NOTE: /trains endpoint returns 401 - needs authentication
    const endpoints = [
        // Most promising - returns 401 (needs auth) instead of 404
        `${CP_API_BASE}/trains?from=${fromId}&to=${toId}&date=${date}`,
        `${CP_API_BASE}/trains?from=${fromIdHyphen}&to=${toIdHyphen}&date=${date}`,
        // Other variations
        `${CP_API_BASE}/itinerary?from=${fromId}&to=${toId}&date=${date}`,
        `${CP_API_BASE}/v2/itinerary?from=${fromId}&to=${toId}&date=${date}`,
        `${CP_API_BASE}/trains/search?from=${fromId}&to=${toId}&date=${date}`,
        `${CP_API_BASE}/v2/trains/search?from=${fromId}&to=${toId}&date=${date}`,
        // Hyphenated IDs
        `${CP_API_BASE}/itinerary?from=${fromIdHyphen}&to=${toIdHyphen}&date=${date}`,
        `${CP_API_BASE}/v2/itinerary?from=${fromIdHyphen}&to=${toIdHyphen}&date=${date}`,
        // Next trains endpoints
        `https://api-gateway.cp.pt/cp/services/stations-api/stations/${fromId}/next-trains`,
        `https://api-gateway.cp.pt/cp/services/stations-api/v2/stations/${fromId}/next-trains`
    ];

    // Try each endpoint with different header sets
    for (const endpoint of endpoints) {
        for (const headers of headerSets) {
            try {
                console.log(`Trying CP API: ${endpoint.substring(0, 80)}...`);
                
                // Try GET first
                let response = await fetch(endpoint, {
                    agent,
                    headers,
                    timeout: 5000
                });

            if (response.ok) {
                const data = await response.json();
                console.log(`✅ Success! Got data from CP API (GET)`);
                return data;
            } else if (response.status === 401) {
                // 401 means endpoint exists but needs auth - this is progress!
                console.log(`⚠️  CP API endpoint exists but needs authentication: ${endpoint.substring(0, 60)}`);
                // Continue trying other endpoints, but note this one works
            } else if (response.status !== 404) {
                const errorText = await response.text().catch(() => '');
                console.log(`CP API returned ${response.status} for ${endpoint.substring(0, 60)}`);
                if (errorText && errorText.length < 200) {
                    console.log(`Error body: ${errorText}`);
                }
            }
                
                // If GET failed with 404, try POST for search/itinerary endpoints
                if (endpoint.includes('search') || endpoint.includes('itinerary')) {
                    const url = endpoint.split('?')[0];
                    const params = new URL(endpoint).searchParams;
                    const body = {
                        from: params.get('from') || fromId,
                        to: params.get('to') || toId,
                        date: params.get('date') || date
                    };
                    
                    response = await fetch(url, {
                        method: 'POST',
                        agent,
                        headers: {
                            ...headers,
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify(body),
                        timeout: 5000
                    });
                    
                    if (response.ok) {
                        const data = await response.json();
                        console.log(`✅ Success! Got data from CP API (POST)`);
                        return data;
                    }
                }
            } catch (error) {
                // Continue to next header set
                continue;
            }
        }
    }
    
    return null;
}

app.get('/api/trains', async (req, res) => {
    // Prevent caching of API responses - always fetch fresh data
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    
    const { stationId } = req.query;
    
    if (!stationId) {
        return res.status(400).json({ error: 'Station ID required' });
    }

    const stationInfo = STATION_MAP[stationId];
    if (!stationInfo) {
        return res.status(400).json({ error: 'Unknown station ID' });
    }

    try {
        const liveStationId = stationInfo.liveId;
        const stationData = CASCAIS_LINE.find(s => s.id === liveStationId);
        
        if (!stationData) {
            console.log('Station not on Cascais line, using mock data');
            return res.json(getMockTrains(stationId));
        }

        const stationIndex = CASCAIS_LINE.indexOf(stationData);
        const now = new Date();
        const today = now.toISOString().split('T')[0];
        const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;
        
        // Fetch live vehicle data for delays from comboios.live API
        console.log(`Fetching live vehicles from comboios.live...`);
        let liveTrains = [];
        try {
            const response = await fetch('https://comboios.live/api/vehicles', {
            agent,
            headers: {
                    'User-Agent': 'Mozilla/5.0 (Chrome/120.0.0.0)',
                    'Accept': 'application/json'
                },
                timeout: 10000
            });

            if (response.ok) {
                const data = await response.json();
                if (data && data.vehicles) {
                    // Filter for Cascais line trains (Service 45)
                    liveTrains = data.vehicles.filter(v => 
                        v.service && v.service.code === '45' && 
                        (v.destination && (v.destination.code === '94-69260' || v.destination.code === '94-69005') ||
                         v.origin && (v.origin.code === '94-69260' || v.origin.code === '94-69005'))
                    );
                    console.log(`📡 Found ${liveTrains.length} live trains from comboios.live`);
                    liveTrains.forEach(t => {
                        console.log(`  - Train ${t.trainNumber}: ${t.origin?.designation || t.origin?.code} → ${t.destination?.designation || t.destination?.code}, lastStation=${t.lastStation}, status=${t.status}, delay=${t.delay || 0}s`);
                    });
                }
            }
        } catch (error) {
            console.log('Error fetching live trains:', error.message);
        }
        
        // Use static schedule (from Google Maps) + live delays from API
        // GTFS removed - not accurate enough
        console.log('📅 Using static schedule + live delays from API');
        
        // Use static schedule with live delays
        {
            console.log('🔄 Building schedule from static data + live delays');
            const results = [];
            
            // Determine which static schedule to use based on direction
            let staticSchedule = null;
            let stationOffset = 0;
            
            if (stationId === '94-21014') {
                // Carcavelos - "To Lisbon" means trains going TO Cais (from Cascais)
                // STATIC_SCHEDULE_CASCAIS_TO_CAIS is already the schedule FROM Carcavelos (departure times)
                // No offset needed - these are departure times from Carcavelos
                staticSchedule = getScheduleForDay(
                    STATIC_SCHEDULE_CASCAIS_TO_CAIS_DAILY,
                    STATIC_SCHEDULE_CASCAIS_TO_CAIS_WEEKDAYS
                );
                stationOffset = 0; // These are already departure times from Carcavelos
            } else if (stationId === '94-20006') {
                // Cais do Sodre - "To Carcavelos" means trains going TO Cascais (from Cais)
                staticSchedule = getScheduleForDay(
                    STATIC_SCHEDULE_CAIS_TO_CASCAIS_DAILY,
                    STATIC_SCHEDULE_CAIS_TO_CASCAIS_WEEKDAYS
                );
                stationOffset = stationData.minutes; // Minutes from Cais to station (0 for Cais)
            }
            
            if (staticSchedule) {
                // Track which live trains have been used to prevent duplicates
                const usedLiveTrainNumbers = new Set();
                
                // First, collect all live trains going in the correct direction that haven't passed our station
                const isToCais = stationId === '94-21014';
                const availableLiveTrains = liveTrains
                    .filter(live => {
                        // Check direction
                        const liveToCais = live.destination && live.destination.code === '94-69005';
                        if (isToCais !== liveToCais) {
                            console.log(`🚫 Train ${live.trainNumber} wrong direction: liveToCais=${liveToCais}, isToCais=${isToCais}`);
                            return false;
                        }
                        
                        // Check if train is relevant to our station
                        const lastStationIndex = CASCAIS_LINE.findIndex(s => s.id === live.lastStation);
                        if (lastStationIndex === -1) {
                            console.log(`🚫 Train ${live.trainNumber} not on Cascais line: lastStation=${live.lastStation}`);
                            return false;
                        }
                        
                        // For trains going to Cais: only include if train hasn't passed our station
                        if (isToCais && lastStationIndex < stationIndex) {
                            console.log(`🚫 Train ${live.trainNumber} already passed station: lastStationIndex=${lastStationIndex}, stationIndex=${stationIndex}`);
                            return false; // Train has passed our station
                        }
                        // For trains going to Cascais: only include if train hasn't passed our station
                        if (!isToCais && lastStationIndex > stationIndex) {
                            console.log(`🚫 Train ${live.trainNumber} already passed station: lastStationIndex=${lastStationIndex}, stationIndex=${stationIndex}`);
                            return false; // Train has passed our station
                        }
                        
                        // Exclude completed trains
                        if (live.status === 'COMPLETED') {
                            console.log(`🚫 Train ${live.trainNumber} is COMPLETED`);
                            return false;
                        }
                        
                        console.log(`✅ Train ${live.trainNumber} is available: lastStation=${live.lastStation}, status=${live.status}, delay=${live.delay || 0}s`);
                        return true;
                    })
                    .map(live => {
                        const lastStationIndex = CASCAIS_LINE.findIndex(s => s.id === live.lastStation);
                        const stationsRemaining = isToCais
                            ? Math.max(0, lastStationIndex - stationIndex)
                            : Math.max(0, stationIndex - lastStationIndex);
                        return {
                            train: live,
                            lastStationIndex,
                            stationsRemaining
                        };
                    })
                    .sort((a, b) => {
                        // Sort by position: trains closer to our station come first
                        // If same position, prefer trains with less delay
                        if (a.stationsRemaining !== b.stationsRemaining) {
                            return a.stationsRemaining - b.stationsRemaining;
                        }
                        return (a.train.delay || 0) - (b.train.delay || 0);
                    });
                
                console.log(`📊 Available live trains for matching: ${availableLiveTrains.length}`);
                availableLiveTrains.forEach((lt, idx) => {
                    console.log(`  ${idx + 1}. Train ${lt.train.trainNumber}, stationsRemaining=${lt.stationsRemaining}, delay=${lt.train.delay || 0}s`);
                });
                
                // Get next trains from static schedule
                // First, find all schedule times (including past ones for delayed trains)
                const allScheduleTimes = [];
                for (let i = 0; i < staticSchedule.length; i++) {
                    const scheduledTimeStr = staticSchedule[i];
                    const scheduledTime = parseTime(scheduledTimeStr);
                    const departureTime = stationOffset === 0 
                        ? scheduledTime 
                        : new Date(scheduledTime.getTime() + stationOffset * 60000);
                    
                    const minutesToDeparture = Math.round((departureTime - now) / 60000);
                    allScheduleTimes.push({
                        index: i,
                        scheduledTimeStr,
                        scheduledTime,
                        departureTime,
                        minutesToDeparture
                    });
                }
                
                // Filter out trains that have already passed (no 2-minute buffer)
                const futureScheduleTimes = allScheduleTimes.filter(st => st.minutesToDeparture > 0);
                console.log(`📅 Found ${futureScheduleTimes.length} future schedule times (out of ${allScheduleTimes.length} total)`);
                
                // Match trains to schedule times: nearest train to station = nearest schedule time
                // First, try to match live trains with their corresponding schedule times
                for (const liveData of availableLiveTrains) {
                    if (usedLiveTrainNumbers.has(liveData.train.trainNumber)) continue;
                    
                    // Find the nearest schedule time to this train's expected arrival
                    // For trains close to station, match with nearest past/future schedule time
                    let bestScheduleMatch = null;
                    let bestTimeDiff = Infinity;
                    
                    for (const scheduleItem of allScheduleTimes) {
                        // Prefer schedule times that are close to now (within 30 minutes past or future)
                        const timeDiff = Math.abs(scheduleItem.minutesToDeparture);
                        if (timeDiff < bestTimeDiff && timeDiff <= 30) {
                            bestTimeDiff = timeDiff;
                            bestScheduleMatch = scheduleItem;
                        }
                    }
                    
                    if (bestScheduleMatch) {
                        usedLiveTrainNumbers.add(liveData.train.trainNumber);
                        console.log(`🔗 Matched Train ${liveData.train.trainNumber} to schedule time ${bestScheduleMatch.scheduledTimeStr} (timeDiff=${bestScheduleMatch.minutesToDeparture}min)`);
                        
                        // Process this matched train
                        const { scheduledTimeStr, departureTime } = bestScheduleMatch;
                        const liveTrain = liveData.train;
                        const delaySeconds = liveTrain.delay || 0;
                        const delayMinutes = Math.round(delaySeconds / 60);
                        const trainNr = liveTrain.trainNumber;
                        
                        const actualDepartureTime = new Date(departureTime.getTime() + delayMinutes * 60000);
                        const stationsRemaining = liveData.stationsRemaining;
                        
                        // Calculate minutes to scheduled arrival
                        const scheduledMinutesToArrival = Math.round((departureTime - now) / 60000);
                        
                        // Key for storing fixed disappearance time
                        const trainKey = `${trainNr}_${scheduledTimeStr}`;
                        
                        // Check if we're 3 minutes or less before scheduled arrival
                        // If yes, and we haven't fixed the disappearance time yet, fix it now
                        let disappearanceTime = null;
                        if (scheduledMinutesToArrival <= 3) {
                            if (!fixedDisappearanceTimes.has(trainKey)) {
                                // Fix disappearance time = scheduled time + current delay
                                const fixedTime = new Date(departureTime.getTime() + delayMinutes * 60000);
                                fixedDisappearanceTimes.set(trainKey, fixedTime);
                                console.log(`🔒 Fixed disappearance time for train ${trainNr} (${scheduledTimeStr}): ${fixedTime.toLocaleTimeString()} (delay was ${delayMinutes}min)`);
                            }
                            disappearanceTime = fixedDisappearanceTimes.get(trainKey);
                        } else {
                            // More than 3 minutes before arrival - no fixed time yet
                            disappearanceTime = actualDepartureTime;
                        }
                        
                        let actualMinutesToDeparture = 0;
                        if (stationsRemaining === 0) {
                            const scheduledMinutesToDeparture = Math.round((departureTime - now) / 60000);
                            actualMinutesToDeparture = scheduledMinutesToDeparture + delayMinutes;
                        } else {
                            const etaFromPosition = stationsRemaining * 2;
                            const scheduledMinutesToDeparture = Math.round((departureTime - now) / 60000);
                            const delayedMinutesToDeparture = scheduledMinutesToDeparture + delayMinutes;
                            actualMinutesToDeparture = Math.max(0, Math.min(etaFromPosition, delayedMinutesToDeparture));
                        }
                        
                        // Show train if current time is before the disappearance time (no 2-minute buffer)
                        const shouldShow = now < disappearanceTime;
                        
                        if (shouldShow) {
                            console.log(`  📤 Adding matched train: trainNr=${trainNr}, scheduledTime=${scheduledTimeStr}, actualDeparture=${actualDepartureTime.toLocaleTimeString()}, minutesToDeparture=${actualMinutesToDeparture}, timeSinceDeparture=${timeSinceActualDeparture > 0 ? Math.round(timeSinceActualDeparture) + 'min ago' : 'not yet'}`);
                            results.push({
                                trainNr: trainNr,
                                scheduledTime: scheduledTimeStr,
                                minutesToDeparture: actualMinutesToDeparture,
                                trainStatus: delayMinutes > 0 ? delayMinutes.toString() : "P",
                                destination: stationId === '94-21014' ? 'Cais do Sodre' : 'Cascais',
                                isDelayed: delayMinutes > 0
                            });
                        } else {
                            console.log(`  🚫 Train ${trainNr} already departed: scheduled=${scheduledTimeStr}, delay=${delayMinutes}min, actualDeparture=${actualDepartureTime.toLocaleTimeString()}, timeSinceDeparture=${Math.round(timeSinceActualDeparture)}min`);
                        }
                    }
                }
                
                // Then, add remaining schedule times without live trains
                // First, add today's future schedule times
                for (let i = 0; i < futureScheduleTimes.length && results.length < 10; i++) {
                    const scheduleItem = futureScheduleTimes[i];
                    const { scheduledTimeStr, departureTime } = scheduleItem;
                    
                    // Skip if this schedule time was already matched to a live train
                    const alreadyMatched = results.some(r => r.scheduledTime === scheduledTimeStr && r.trainNr !== null);
                    if (alreadyMatched) {
                        console.log(`  ⏭️  Skipping ${scheduledTimeStr}: already matched to live train`);
                        continue;
                    }
                    
                    // No live train for this schedule time - use scheduled time only
                    const scheduledMinutesToDeparture = Math.round((departureTime - now) / 60000);
                    const actualMinutesToDeparture = scheduledMinutesToDeparture;
                    
                    // Only show if time is in the future
                    if (actualMinutesToDeparture > 0) {
                        console.log(`  📤 Adding schedule-only result: trainNr=null, scheduledTime=${scheduledTimeStr}, minutesToDeparture=${actualMinutesToDeparture}`);
                        results.push({
                            trainNr: null, // No train number - frontend will show "Schedule" instead
                            scheduledTime: scheduledTimeStr,
                            minutesToDeparture: actualMinutesToDeparture,
                            trainStatus: "P",
                            destination: stationId === '94-21014' ? 'Cais do Sodre' : 'Cascais',
                            isDelayed: false
                        });
                    }
                }
                
                // If we have fewer than 4 results, add tomorrow's morning trains
                if (results.length < 4) {
                    // Add first morning trains from tomorrow (up to 4 total)
                    const morningTrainsCount = Math.min(4 - results.length, staticSchedule.length);
                    for (let i = 0; i < morningTrainsCount && results.length < 4; i++) {
                        const scheduledTimeStr = staticSchedule[i];
                        const scheduledTime = parseTime(scheduledTimeStr);
                        // Set to tomorrow
                        scheduledTime.setDate(scheduledTime.getDate() + 1);
                        
                        const departureTime = stationOffset === 0 
                            ? scheduledTime 
                            : new Date(scheduledTime.getTime() + stationOffset * 60000);
                        
                        const minutesToDeparture = Math.round((departureTime - now) / 60000);
                        
                        // Skip if this schedule time was already in results (either matched or already added)
                        const alreadyExists = results.some(r => r.scheduledTime === scheduledTimeStr);
                        if (!alreadyExists) {
                            console.log(`  📤 Adding tomorrow's morning train: trainNr=null, scheduledTime=${scheduledTimeStr}, minutesToDeparture=${minutesToDeparture}`);
                            results.push({
                                trainNr: null,
                                scheduledTime: scheduledTimeStr,
                                minutesToDeparture: minutesToDeparture,
                                trainStatus: "P",
                                destination: stationId === '94-21014' ? 'Cais do Sodre' : 'Cascais',
                                isDelayed: false
                            });
                        }
                    }
                }
                
                // Sort results by minutesToDeparture to ensure correct order
                results.sort((a, b) => a.minutesToDeparture - b.minutesToDeparture);
                
                if (results.length > 0) {
                    console.log(`✅ Found ${results.length} trains from static schedule`);
                    return res.json(results);
                }
            }
        }
        
        // Try to get schedule from CP API
        let cpSchedule = null;
        if (stationId === '94-21014') {
            // Carcavelos -> Cais do Sodre
            cpSchedule = await fetchCPSchedule(stationInfo.cpId, '9430005', today);
        } else if (stationId === '94-20006') {
            // Cais do Sodre -> Carcavelos
            cpSchedule = await fetchCPSchedule('9430005', stationInfo.cpId, today);
        }

        // If we got schedule from CP API, use it!
        if (cpSchedule) {
            console.log(`Using CP API schedule`);
            // Log structure to understand it
            console.log('CP Schedule structure:', JSON.stringify(cpSchedule).substring(0, 500));
            
            // Try to parse different possible response structures
            let itineraries = [];
            if (cpSchedule.itineraries) {
                itineraries = cpSchedule.itineraries;
            } else if (cpSchedule.data && cpSchedule.data.itineraries) {
                itineraries = cpSchedule.data.itineraries;
            } else if (Array.isArray(cpSchedule)) {
                itineraries = cpSchedule;
            } else if (cpSchedule.trains) {
                itineraries = cpSchedule.trains;
            } else if (cpSchedule.nextTrains) {
                itineraries = cpSchedule.nextTrains;
            }
            
            if (itineraries.length > 0) {
                const results = itineraries.slice(0, 4).map(it => {
                    // Parse CP API response structure - try multiple field names
                    const depTime = it.departureTime || it.departure?.time || it.scheduledDeparture || 
                                   it.departure?.scheduledTime || it.departureTimeString;
                    const arrTime = it.arrivalTime || it.arrival?.time || it.scheduledArrival ||
                                   it.arrival?.scheduledTime || it.arrivalTimeString;
                    const delay = it.delay || it.delayMinutes || it.delaySeconds ? Math.round(it.delaySeconds / 60) : 0;
                    
                    // Use departure time for our station
                    const timeToUse = depTime || arrTime;
                    
                    // Parse time string (format may vary: "HH:mm" or "HH:mm:ss" or ISO)
                    let scheduledTime = "00:00";
                    if (timeToUse) {
                        const match = timeToUse.match(/(\d{2}):(\d{2})/);
                        if (match) scheduledTime = `${match[1]}:${match[2]}`;
                    }
                    
                    // Calculate minutes to departure
                    const [h, m] = scheduledTime.split(':').map(Number);
                    const scheduledDate = new Date();
                    scheduledDate.setHours(h, m, 0, 0);
                    if (scheduledDate < now) scheduledDate.setDate(scheduledDate.getDate() + 1);
                    const minutesToDeparture = Math.max(0, Math.round((scheduledDate - now) / 60000) + delay);
                    
                    return {
                        trainNr: it.trainNumber || it.train?.number || it.number || null, // null if not available - frontend will show "Schedule"
                        scheduledTime: scheduledTime,
                        minutesToDeparture: minutesToDeparture,
                        trainStatus: delay > 0 ? delay.toString() : "P",
                        destination: it.destination?.name || it.destinationName || it.destination?.designation || "—",
                        isDelayed: delay > 0
                    };
                });
                
                // Merge with live delay data if available
                results.forEach(result => {
                    const liveTrain = liveTrains.find(v => v.trainNumber === result.trainNr);
                    if (liveTrain) {
                        const delaySeconds = liveTrain.delay || 0;
                        const delayMinutes = Math.round(delaySeconds / 60);
                        result.trainStatus = delayMinutes > 0 ? delayMinutes.toString() : "P";
                        result.isDelayed = delayMinutes > 0;
                        // Adjust minutesToDeparture with live delay
                        result.minutesToDeparture = Math.max(0, result.minutesToDeparture + delayMinutes);
                    }
                });
                
                return res.json(results);
            }
        }
        
        // Fallback: Build schedule from static data + live delays
        console.log('Using hybrid approach: static schedule + live delays');
        const results = [];
        
        // Trains going Cais -> Cascais
        const caisToCascaisSchedule = findNextScheduledTime(
            now, 
            getScheduleForDay(STATIC_SCHEDULE_CAIS_TO_CASCAIS_DAILY, STATIC_SCHEDULE_CAIS_TO_CASCAIS_WEEKDAYS), 
            stationData.minutes
        );
        const liveTrainToCascais = liveTrains.find(v => 
            v.destination.code === '94-69260' && 
            v.origin.code === '94-69005'
        );
        
        if (liveTrainToCascais) {
            // Use live data if available
            // Delay is in SECONDS in comboios.live API
            const delaySeconds = liveTrainToCascais.delay || 0;
            const delayMinutes = Math.round(delaySeconds / 60);
            const lastStationIndex = CASCAIS_LINE.findIndex(s => s.id === liveTrainToCascais.lastStation);
            
            if (lastStationIndex !== -1) {
                const stationsRemaining = Math.max(0, stationIndex - lastStationIndex);
                const etaMinutes = stationsRemaining * 2; // ~2 min per station
                
                const arrivalTime = new Date(now.getTime() + etaMinutes * 60000);
                const scheduledTime = new Date(arrivalTime.getTime() - delayMinutes * 60000);
                
                results.push({
                    trainNr: liveTrainToCascais.trainNumber,
                    scheduledTime: `${scheduledTime.getHours().toString().padStart(2, '0')}:${scheduledTime.getMinutes().toString().padStart(2, '0')}`,
                    minutesToDeparture: Math.max(0, etaMinutes),
                    trainStatus: delayMinutes > 0 ? delayMinutes.toString() : "P",
                    destination: 'Cascais',
                    isDelayed: delayMinutes > 0
                });
            }
        } else {
            // Fallback to static schedule - no train number available from API
            results.push({
                trainNr: null, // No train number - frontend will show "Schedule" instead
                scheduledTime: caisToCascaisSchedule.scheduledTime,
                minutesToDeparture: caisToCascaisSchedule.minutesToArrival,
                trainStatus: "P",
                destination: 'Cascais',
                isDelayed: false
            });
        }

        // Trains going Cascais -> Cais
        const cascaisToCaisSchedule = findNextScheduledTime(
            now, 
            getScheduleForDay(STATIC_SCHEDULE_CASCAIS_TO_CAIS_DAILY, STATIC_SCHEDULE_CASCAIS_TO_CAIS_WEEKDAYS), 
            32 - stationData.minutes
        );
        const liveTrainToCais = liveTrains.find(v => 
            v.destination.code === '94-69005' && 
            v.origin.code === '94-69260'
        );
        
        if (liveTrainToCais) {
            // Delay is in SECONDS in comboios.live API
            const delaySeconds = liveTrainToCais.delay || 0;
            const delayMinutes = Math.round(delaySeconds / 60);
            const lastStationIndex = CASCAIS_LINE.findIndex(s => s.id === liveTrainToCais.lastStation);
            
            if (lastStationIndex !== -1) {
                const stationsRemaining = Math.max(0, lastStationIndex - stationIndex);
                const etaMinutes = stationsRemaining * 2;
                
                const arrivalTime = new Date(now.getTime() + etaMinutes * 60000);
                const scheduledTime = new Date(arrivalTime.getTime() - delayMinutes * 60000);
                
                results.push({
                    trainNr: liveTrainToCais.trainNumber,
                    scheduledTime: `${scheduledTime.getHours().toString().padStart(2, '0')}:${scheduledTime.getMinutes().toString().padStart(2, '0')}`,
                    minutesToDeparture: Math.max(0, etaMinutes),
                    trainStatus: delayMinutes > 0 ? delayMinutes.toString() : "P",
                    destination: 'Cais do Sodre',
                    isDelayed: delayMinutes > 0
                });
            }
        } else {
            // Fallback to static schedule - no train number available from API
            results.push({
                trainNr: null, // No train number - frontend will show "Schedule" instead
                scheduledTime: cascaisToCaisSchedule.scheduledTime,
                minutesToDeparture: cascaisToCaisSchedule.minutesToArrival,
                trainStatus: "P",
                destination: 'Cais do Sodre',
                isDelayed: false
            });
        }

        // Sort by actual departure time (scheduled + delay)
        results.sort((a, b) => a.minutesToDeparture - b.minutesToDeparture);
        
        // Filter out trains that have already departed (no 2-minute buffer)
        const activeTrains = results.filter(t => t.minutesToDeparture > 0);
        
        // Limit to next 4 trains
        return res.json(activeTrains.slice(0, 4));

    } catch (error) {
        console.error('Error:', error.message);
        return res.json(getMockTrains(stationId));
    }
});

app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});
