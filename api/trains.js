const fetch = require('node-fetch');
const https = require('https');

// HTTPS Agent to ignore SSL errors
const agent = new https.Agent({
    rejectUnauthorized: false
});

// Station ID mappings
const STATION_MAP = {
    '94-21014': '94-69187', // Carcavelos
    '94-20006': '94-69005', // Cais do Sodre
};

// CP API Configuration
const CP_API_CONFIG = {
    BASE_URL: 'https://api-gateway.cp.pt/cp/services/travel-api',
    API_KEY: 'ca3923e4-1d3c-424f-a3d0-9554cf3ef859',
    CONNECT_ID: '1483ea620b920be6328dcf89e808937a',
    CONNECT_SECRET: '74bd06d5a2715c64c2f848c5cdb56e6b'
};

async function fetchStationSchedule(stationId, timeOffsetMinutes = -10) {
    const now = new Date();
    now.setMinutes(now.getMinutes() + timeOffsetMinutes);
    
    const today = now.toISOString().split('T')[0];
    const time = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
    
    const url = `${CP_API_CONFIG.BASE_URL}/stations/${stationId}/timetable/${today}?start=${time}`;
    
    try {
        const response = await fetch(url, {
            agent,
            headers: {
                'x-api-key': CP_API_CONFIG.API_KEY,
                'x-cp-connect-id': CP_API_CONFIG.CONNECT_ID,
                'x-cp-connect-secret': CP_API_CONFIG.CONNECT_SECRET,
                'Accept': 'application/json',
                'Accept-Language': 'en-US,en;q=0.9',
                'Origin': 'https://www.cp.pt',
                'Referer': 'https://www.cp.pt/',
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            },
            timeout: 8000
        });

        if (!response.ok) return [];

        const data = await response.json();
        if (data && data.stationStops) {
            return data.stationStops;
        }
        return [];
    } catch (error) {
        console.error('Fetch error:', error.message);
        return [];
    }
}

module.exports = async (req, res) => {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    // Prevent caching
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    const { stationId } = req.query;
    
    if (!stationId || !STATION_MAP[stationId]) {
        return res.status(400).json({ error: 'Valid Station ID required' });
    }

    const cpStationId = STATION_MAP[stationId];
    
    try {
        // Fetch current trains (using -10 min buffer as before) and future trains (+20 min)
        const [currentStops, futureStops] = await Promise.all([
            fetchStationSchedule(cpStationId, -10),
            fetchStationSchedule(cpStationId, 20)
        ]);
        
        // Merge and deduplicate based on trainNumber
        const allStopsMap = new Map();
        
        [...currentStops, ...futureStops].forEach(stop => {
            if (stop.trainNumber && !allStopsMap.has(stop.trainNumber)) {
                allStopsMap.set(stop.trainNumber, stop);
            }
        });
        
        const stationStops = Array.from(allStopsMap.values());
        
        // Mock train for localhost testing
        if (req.headers.host && (req.headers.host.includes('localhost') || req.headers.host.includes('127.0.0.1'))) {
            stationStops.push({
                trainNumber: '99999',
                trainDestination: { code: stationId === '94-21014' ? '94-69005' : '94-69260', designation: 'Teste Local' },
                delay: 5,
                departureTime: new Date(Date.now() + 10 * 60000).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' }),
                arrivalTime: new Date(Date.now() + 10 * 60000).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' }),
                platform: '1'
            });
        }

        const results = stationStops.map(stop => {
            const destinationCode = stop.trainDestination ? stop.trainDestination.code : '';
            const destinationName = stop.trainDestination ? stop.trainDestination.designation : 'Unknown';
            
            let isRelevant = false;
            
            if (stationId === '94-21014') { // From Carcavelos to Lisbon
                if (destinationCode === '94-69005' || destinationCode === '94-30005') {
                    isRelevant = true;
                }
            } else if (stationId === '94-20006') { // From Cais do Sodre to Cascais
                if (destinationCode === '94-69260' || destinationCode === '94-30260') {
                    isRelevant = true;
                }
            }
            
            if (!isRelevant) return null;

            const delayMinutes = stop.delay || 0;
            const timeStr = stop.departureTime || stop.arrivalTime; 
            const [hours, minutes] = timeStr.split(':').map(Number);
            const now = new Date();
            const scheduledDate = new Date();
            scheduledDate.setHours(hours, minutes, 0, 0);
            
            let minutesToDeparture = Math.round((scheduledDate - now) / 60000);
            const actualMinutesToDeparture = minutesToDeparture + delayMinutes;
            
            // Filter out trains that have already departed (negative minutes)
            if (actualMinutesToDeparture < 0) return null;

            return {
                trainNr: stop.trainNumber,
                scheduledTime: timeStr,
                minutesToDeparture: Math.max(0, actualMinutesToDeparture),
                trainStatus: delayMinutes > 0 ? delayMinutes.toString() : "P",
                destination: destinationName,
                isDelayed: delayMinutes > 0,
                platform: stop.platform ? stop.platform.trim() : null
            };
        }).filter(Boolean);
        
        results.sort((a, b) => {
            const getVal = (t) => {
                const [h, m] = t.scheduledTime.split(':').map(Number);
                return h * 60 + m + (t.isDelayed ? parseInt(t.trainStatus) : 0);
            };
            return getVal(a) - getVal(b);
        });

        res.json(results.slice(0, 10));

    } catch (error) {
        console.error('Handler error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};
