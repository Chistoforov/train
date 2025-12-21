const fetch = require('node-fetch');
const https = require('https');

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

// CP API Configuration - use environment variable or fallback to hardcoded value
const CP_API_KEY = process.env.CP_API_KEY || 'ca3923e4-1d3c-424f-a3d0-9554cf3ef859';
const CP_API_BASE = 'https://api-gateway.cp.pt/cp/services/travel-api';

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
// Daily: 05:30, 06:00, 06:30, 07:00, 07:20, 07:40, 08:00, 08:20, 08:40, 09:00
// Then every 20 minutes (:00, :20, :40) until 21:00
// Evening (30 min): 21:30, 22:00, 22:30, 23:00, 23:30, 00:00, 00:30, 01:00, 01:30
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
// Morning peak: 07:12, 07:24, 07:36, 07:48, 08:12, 08:24, 08:36, 08:48
// Evening peak: 16:12, 16:24, 16:36, 16:48, 17:12, 17:24, 17:36, 17:48, 18:12, 18:24, 18:36, 18:48, 19:12, 19:24, 19:36, 19:48, 20:12
const STATIC_SCHEDULE_CAIS_TO_CASCAIS_WEEKDAYS = [
    '07:12', '07:24', '07:36', '07:48', '08:12', '08:24', '08:36', '08:48',
    '16:12', '16:24', '16:36', '16:48', '17:12', '17:24', '17:36', '17:48',
    '18:12', '18:24', '18:36', '18:48', '19:12', '19:24', '19:36', '19:48',
    '20:12'
];

// Reverse schedule (Cascais -> Cais do Sodre)
// From Carcavelos to Lisbon (Cais do Sodré)
// Daily: 05:40, 06:10, 06:30, 06:50, 07:10, 07:30, 07:50, 08:10, 08:30, 08:50, 09:10, 09:30, 09:50
// Then every 20 minutes (:10, :30, :50) until 21:10
// Evening (30 min): 21:40, 22:10, 22:40, 23:10, 23:40, 00:10, 00:40, 01:10, 01:40, 02:10
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
// Morning peak: 07:22, 07:34, 07:46, 07:58, 08:22, 08:34, 08:46, 08:58
// Evening peak: 16:22, 16:34, 16:46, 16:58, 17:22, 17:34, 17:46, 17:58, 18:22, 18:34, 18:46, 18:58, 19:22, 19:34, 19:46, 19:58, 20:22
const STATIC_SCHEDULE_CASCAIS_TO_CAIS_WEEKDAYS = [
    '07:22', '07:34', '07:46', '07:58', '08:22', '08:34', '08:46', '08:58',
    '16:22', '16:34', '16:46', '16:58', '17:22', '17:34', '17:46', '17:58',
    '18:22', '18:34', '18:46', '18:58', '19:22', '19:34', '19:46', '19:58',
    '20:22'
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

    const fromIdHyphen = fromId.length === 7 ? `94-${fromId.slice(2)}` : fromId;
    const toIdHyphen = toId.length === 7 ? `94-${toId.slice(2)}` : toId;
    
    const endpoints = [
        `${CP_API_BASE}/trains?from=${fromId}&to=${toId}&date=${date}`,
        `${CP_API_BASE}/trains?from=${fromIdHyphen}&to=${toIdHyphen}&date=${date}`,
        `${CP_API_BASE}/itinerary?from=${fromId}&to=${toId}&date=${date}`,
        `${CP_API_BASE}/v2/itinerary?from=${fromId}&to=${toId}&date=${date}`,
        `${CP_API_BASE}/trains/search?from=${fromId}&to=${toId}&date=${date}`,
        `${CP_API_BASE}/v2/trains/search?from=${fromId}&to=${toId}&date=${date}`,
        `${CP_API_BASE}/itinerary?from=${fromIdHyphen}&to=${toIdHyphen}&date=${date}`,
        `${CP_API_BASE}/v2/itinerary?from=${fromIdHyphen}&to=${toIdHyphen}&date=${date}`,
        `https://api-gateway.cp.pt/cp/services/stations-api/stations/${fromId}/next-trains`,
        `https://api-gateway.cp.pt/cp/services/stations-api/v2/stations/${fromId}/next-trains`
    ];

    for (const endpoint of endpoints) {
        for (const headers of headerSets) {
            try {
                let response = await fetch(endpoint, {
                    agent,
                    headers,
                    timeout: 5000
                });

                if (response.ok) {
                    const data = await response.json();
                    return data;
                } else if (response.status === 401) {
                    continue;
                } else if (response.status !== 404) {
                    const errorText = await response.text().catch(() => '');
                    if (errorText && errorText.length < 200) {
                        console.log(`Error body: ${errorText}`);
                    }
                }
                
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
                        return data;
                    }
                }
            } catch (error) {
                continue;
            }
        }
    }
    
    return null;
}

// Store fixed disappearance times for trains
// Key: trainNr_scheduledTime, Value: fixed disappearance time (Date)
const fixedDisappearanceTimes = new Map();

// Main handler function for Vercel
module.exports = async (req, res) => {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    // Prevent caching of API responses - always fetch fresh data
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

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
        
        // Fetch live vehicle data for delays from comboios.live API
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
                    liveTrains = data.vehicles.filter(v => 
                        v.service && v.service.code === '45' && 
                        (v.destination && (v.destination.code === '94-69260' || v.destination.code === '94-69005') ||
                         v.origin && (v.origin.code === '94-69260' || v.origin.code === '94-69005'))
                    );
                }
            }
        } catch (error) {
            console.log('Error fetching live trains:', error.message);
        }
        
        // Use static schedule with live delays
        const results = [];
        let staticSchedule = null;
        let stationOffset = 0;
        
        if (stationId === '94-21014') {
            // Carcavelos -> Cais do Sodré
            staticSchedule = getScheduleForDay(
                STATIC_SCHEDULE_CASCAIS_TO_CAIS_DAILY,
                STATIC_SCHEDULE_CASCAIS_TO_CAIS_WEEKDAYS
            );
            stationOffset = 0;
        } else if (stationId === '94-20006') {
            // Cais do Sodré -> Carcavelos
            staticSchedule = getScheduleForDay(
                STATIC_SCHEDULE_CAIS_TO_CASCAIS_DAILY,
                STATIC_SCHEDULE_CAIS_TO_CASCAIS_WEEKDAYS
            );
            stationOffset = stationData.minutes;
        }
        
        if (staticSchedule) {
            const usedLiveTrainNumbers = new Set();
            
            const isToCais = stationId === '94-21014';
            const availableLiveTrains = liveTrains
                .filter(live => {
                    const liveToCais = live.destination && live.destination.code === '94-69005';
                    if (isToCais !== liveToCais) return false;
                    
                    const lastStationIndex = CASCAIS_LINE.findIndex(s => s.id === live.lastStation);
                    if (lastStationIndex === -1) return false;
                    
                    if (isToCais && lastStationIndex < stationIndex) return false;
                    if (!isToCais && lastStationIndex > stationIndex) return false;
                    
                    if (live.status === 'COMPLETED') return false;
                    
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
                    if (a.stationsRemaining !== b.stationsRemaining) {
                        return a.stationsRemaining - b.stationsRemaining;
                    }
                    return (a.train.delay || 0) - (b.train.delay || 0);
                });
            
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
            
            // Match live trains to schedule times
            for (const liveData of availableLiveTrains) {
                if (usedLiveTrainNumbers.has(liveData.train.trainNumber)) continue;
                
                let bestScheduleMatch = null;
                let bestTimeDiff = Infinity;
                
                for (const scheduleItem of allScheduleTimes) {
                    const timeDiff = Math.abs(scheduleItem.minutesToDeparture);
                    if (timeDiff < bestTimeDiff && timeDiff <= 30) {
                        bestTimeDiff = timeDiff;
                        bestScheduleMatch = scheduleItem;
                    }
                }
                
                if (bestScheduleMatch) {
                    usedLiveTrainNumbers.add(liveData.train.trainNumber);
                    
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
                        results.push({
                            trainNr: trainNr,
                            scheduledTime: scheduledTimeStr,
                            minutesToDeparture: actualMinutesToDeparture,
                            trainStatus: delayMinutes > 0 ? delayMinutes.toString() : "P",
                            destination: stationId === '94-21014' ? 'Cais do Sodre' : 'Cascais',
                            isDelayed: delayMinutes > 0
                        });
                    }
                }
            }
            
            // Add remaining schedule times without live trains
            for (let i = 0; i < futureScheduleTimes.length && results.length < 10; i++) {
                const scheduleItem = futureScheduleTimes[i];
                const { scheduledTimeStr, departureTime } = scheduleItem;
                
                const alreadyMatched = results.some(r => r.scheduledTime === scheduledTimeStr && r.trainNr !== null);
                if (alreadyMatched) continue;
                
                const scheduledMinutesToDeparture = Math.round((departureTime - now) / 60000);
                const actualMinutesToDeparture = scheduledMinutesToDeparture;
                
                if (actualMinutesToDeparture > 0) {
                    results.push({
                        trainNr: null,
                        scheduledTime: scheduledTimeStr,
                        minutesToDeparture: actualMinutesToDeparture,
                        trainStatus: "P",
                        destination: stationId === '94-21014' ? 'Cais do Sodre' : 'Cascais',
                        isDelayed: false
                    });
                }
            }
            
            if (results.length > 0) {
                return res.json(results);
            }
        }
        
        // Try to get schedule from CP API
        let cpSchedule = null;
        if (stationId === '94-21014') {
            cpSchedule = await fetchCPSchedule(stationInfo.cpId, '9430005', today);
        } else if (stationId === '94-20006') {
            cpSchedule = await fetchCPSchedule('9430005', stationInfo.cpId, today);
        }

        if (cpSchedule) {
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
                    const depTime = it.departureTime || it.departure?.time || it.scheduledDeparture || 
                                   it.departure?.scheduledTime || it.departureTimeString;
                    const arrTime = it.arrivalTime || it.arrival?.time || it.scheduledArrival ||
                                   it.arrival?.scheduledTime || it.arrivalTimeString;
                    const delay = it.delay || it.delayMinutes || it.delaySeconds ? Math.round(it.delaySeconds / 60) : 0;
                    
                    const timeToUse = depTime || arrTime;
                    
                    let scheduledTime = "00:00";
                    if (timeToUse) {
                        const match = timeToUse.match(/(\d{2}):(\d{2})/);
                        if (match) scheduledTime = `${match[1]}:${match[2]}`;
                    }
                    
                    const [h, m] = scheduledTime.split(':').map(Number);
                    const scheduledDate = new Date();
                    scheduledDate.setHours(h, m, 0, 0);
                    if (scheduledDate < now) scheduledDate.setDate(scheduledDate.getDate() + 1);
                    const minutesToDeparture = Math.max(0, Math.round((scheduledDate - now) / 60000) + delay);
                    
                    return {
                        trainNr: it.trainNumber || it.train?.number || it.number || null,
                        scheduledTime: scheduledTime,
                        minutesToDeparture: minutesToDeparture,
                        trainStatus: delay > 0 ? delay.toString() : "P",
                        destination: it.destination?.name || it.destinationName || it.destination?.designation || "—",
                        isDelayed: delay > 0
                    };
                });
                
                results.forEach(result => {
                    const liveTrain = liveTrains.find(v => v.trainNumber === result.trainNr);
                    if (liveTrain) {
                        const delaySeconds = liveTrain.delay || 0;
                        const delayMinutes = Math.round(delaySeconds / 60);
                        result.trainStatus = delayMinutes > 0 ? delayMinutes.toString() : "P";
                        result.isDelayed = delayMinutes > 0;
                        result.minutesToDeparture = Math.max(0, result.minutesToDeparture + delayMinutes);
                    }
                });
                
                return res.json(results);
            }
        }
        
        // Fallback to mock data
        return res.json(getMockTrains(stationId));

    } catch (error) {
        console.error('Error:', error.message);
        return res.json(getMockTrains(stationId));
    }
};


