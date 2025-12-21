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
const STATIC_SCHEDULE_CAIS_TO_CASCAIS = [
    '05:30', '06:00', '06:30',
    '07:00', '07:15', '07:30', '07:45', '08:00', '08:15', '08:30', '08:45',
    '09:00', '09:20', '09:40', '10:00', '10:20', '10:40',
    '11:00', '11:20', '11:40', '12:00', '12:20', '12:40', '13:00', '13:20',
    '13:40', '14:00', '14:20', '14:40', '15:00', '15:20', '15:40', '16:00',
    '16:20', '16:40', '17:00', '17:20', '17:40',
    '18:00', '18:20', '18:40', '19:00', '19:20', '19:40', '20:00', '20:20',
    '20:40', '21:00', '21:20', '21:40', '22:00', '22:20', '22:40',
    '23:00', '23:20', '23:40'
];

// Reverse schedule (Cascais -> Cais do Sodre)
const STATIC_SCHEDULE_CASCAIS_TO_CAIS = [
    '05:13', '05:43',
    '06:13', '06:43', '07:04', '07:19', '07:34', '07:49', '08:04', '08:19',
    '08:37', '08:57',
    '09:17', '09:37', '09:57', '10:17', '10:37', '10:57', '11:17', '11:37',
    '11:57', '12:17', '12:37', '12:57', '13:17', '13:37', '13:57', '14:17',
    '14:37', '14:57', '15:17', '15:37', '15:57', '16:17', '16:37', '16:57',
    '17:17', '17:37', '17:57', '18:17', '18:37', '18:57',
    '19:17', '19:47', '20:17', '20:37', '20:57', '21:17', '21:37', '21:57',
    '22:17', '22:37', '22:57', '23:17', '23:37'
];

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

// Main handler function for Vercel
module.exports = async (req, res) => {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

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
            staticSchedule = STATIC_SCHEDULE_CASCAIS_TO_CAIS;
            stationOffset = 0;
        } else if (stationId === '94-20006') {
            staticSchedule = STATIC_SCHEDULE_CAIS_TO_CASCAIS;
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
            
            const futureScheduleTimes = allScheduleTimes.filter(st => st.minutesToDeparture >= -2);
            
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
                    
                    const timeSinceActualDeparture = (now - actualDepartureTime) / 60000;
                    const shouldShow = actualDepartureTime > now || timeSinceActualDeparture <= 2;
                    
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

