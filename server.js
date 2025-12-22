const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const https = require('https');
const path = require('path');
// GTFS parser removed as we are switching to official API

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.static('public'));

// HTTPS Agent to ignore SSL errors
const agent = new https.Agent({
    rejectUnauthorized: false
});

// Station ID mappings
// User IDs (from frontend) -> CP Internal IDs (for travel API)
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

async function fetchStationSchedule(stationId) {
    const today = new Date().toISOString().split('T')[0];
    // Start from current time minus 30 mins to show recent trains, or just current time
    // API expects time in HH:MM format
    const now = new Date();
    // Go back 10 minutes to ensure we don't miss a train that is just departing
    now.setMinutes(now.getMinutes() - 10);
    const time = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
    
    const url = `${CP_API_CONFIG.BASE_URL}/stations/${stationId}/timetable/${today}?start=${time}`;
    
    console.log(`Fetching schedule from: ${url}`);
    
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

        if (!response.ok) {
            console.error(`CP API Error: ${response.status} ${response.statusText}`);
            const text = await response.text();
            console.error('Error body:', text.substring(0, 200));
            return [];
        }

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

app.get('/api/trains', async (req, res) => {
    // Prevent caching
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    
    const { stationId } = req.query;
    
    if (!stationId || !STATION_MAP[stationId]) {
        return res.status(400).json({ error: 'Valid Station ID required' });
    }

    const cpStationId = STATION_MAP[stationId];
    
    try {
        const stationStops = await fetchStationSchedule(cpStationId);
        
        // Filter and format the data
        const results = stationStops.map(stop => {
            // Determine destination name
            const destinationName = stop.trainDestination ? stop.trainDestination.designation : 'Unknown';
            const destinationCode = stop.trainDestination ? stop.trainDestination.code : '';
            
            // Filter based on direction requested
            // If we are at Carcavelos (94-69187):
            // - To Lisbon (Cais do Sodre): destination is Cais do Sodre (94-69005)
            // - To Cascais: destination is Cascais (94-69260)
            
            // If we are at Cais do Sodre (94-69005):
            // - To Carcavelos/Cascais: destination is Cascais (94-69260)
            
            // The frontend requests:
            // - Carcavelos (94-21014) -> expecting trains TO Lisbon
            // - Cais do Sodre (94-20006) -> expecting trains TO Carcavelos (Cascais)
            
            // We need to check if the train is going in the right direction
            
            let isRelevant = false;
            
            if (stationId === '94-21014') { // From Carcavelos
                // We want trains to Cais do Sodre
                if (destinationCode === '94-69005' || destinationCode === '94-30005') {
                    isRelevant = true;
                }
            } else if (stationId === '94-20006') { // From Cais do Sodre
                // We want trains to Cascais
                if (destinationCode === '94-69260' || destinationCode === '94-30260') {
                    isRelevant = true;
                }
            }
            
            if (!isRelevant) return null;

            // Calculate delay
            const delayMinutes = stop.delay || 0;
            
            // Parse time
            const timeStr = stop.departureTime || stop.arrivalTime; // "HH:MM"
            const [hours, minutes] = timeStr.split(':').map(Number);
            const now = new Date();
            const scheduledDate = new Date();
            scheduledDate.setHours(hours, minutes, 0, 0);
            
            // Handle day rollover (if scheduled time is much earlier than now, it might be tomorrow, 
            // but the API usually returns today's schedule. If it's late at night, be careful.)
            // The API returns date-specific timetable, so the time should be for 'today' (the date passed in URL)
            
            // Calculate minutes to departure (scheduled)
            // If the time is in the past, it might be a delayed train or one that just left
            let minutesToDeparture = Math.round((scheduledDate - now) / 60000);
            
            // Add delay
            const actualMinutesToDeparture = minutesToDeparture + delayMinutes;
            
            // Don't show trains that departed more than 2 minutes ago
            if (actualMinutesToDeparture < -2) return null;

            return {
                trainNr: stop.trainNumber,
                scheduledTime: timeStr,
                minutesToDeparture: Math.max(0, actualMinutesToDeparture),
                trainStatus: delayMinutes > 0 ? delayMinutes.toString() : "P",
                destination: destinationName,
                isDelayed: delayMinutes > 0,
                platform: stop.platform ? stop.platform.trim() : null
            };
        }).filter(Boolean); // Remove nulls
        
        // Sort by departure time
        results.sort((a, b) => {
            // Helper to get absolute time value
            const getVal = (t) => {
                const [h, m] = t.scheduledTime.split(':').map(Number);
                return h * 60 + m + (t.isDelayed ? parseInt(t.trainStatus) : 0);
            };
            return getVal(a) - getVal(b);
        });

        // Limit results
        const limitedResults = results.slice(0, 10);
        
        console.log(`✅ Returning ${limitedResults.length} trains for station ${stationId}`);
        res.json(limitedResults);

    } catch (error) {
        console.error('Handler error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});
