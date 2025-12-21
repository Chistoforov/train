const fs = require('fs');
const path = require('path');

class GTFSParser {
    constructor(gtfsPath = './GTFS') {
        this.gtfsPath = gtfsPath;
        this.stops = new Map();
        this.trips = new Map();
        this.stopTimes = [];
        this.routes = new Map();
        this.calendar = new Map();
    }

    // Load all GTFS files
    load() {
        console.log('Loading GTFS data...');
        this.loadStops();
        this.loadTrips();
        this.loadStopTimes();
        this.loadRoutes();
        this.loadCalendar();
        console.log(`Loaded ${this.stops.size} stops, ${this.trips.size} trips, ${this.stopTimes.length} stop times`);
    }

    loadStops() {
        const content = fs.readFileSync(path.join(this.gtfsPath, 'stops.txt'), 'utf8');
        const lines = content.split('\n');
        const headers = lines[0].split(',');
        
        for (let i = 1; i < lines.length; i++) {
            if (!lines[i].trim()) continue;
            const values = this.parseCSVLine(lines[i]);
            if (values.length < headers.length) continue;
            
            const stop = {};
            headers.forEach((h, idx) => {
                stop[h] = values[idx];
            });
            
            this.stops.set(stop.stop_id, stop);
        }
    }

    loadTrips() {
        const content = fs.readFileSync(path.join(this.gtfsPath, 'trips.txt'), 'utf8');
        const lines = content.split('\n');
        const headers = lines[0].split(',');
        
        for (let i = 1; i < lines.length; i++) {
            if (!lines[i].trim()) continue;
            const values = this.parseCSVLine(lines[i]);
            if (values.length < headers.length) continue;
            
            const trip = {};
            headers.forEach((h, idx) => {
                trip[h] = values[idx];
            });
            
            this.trips.set(trip.trip_id, trip);
        }
    }

    loadStopTimes() {
        const content = fs.readFileSync(path.join(this.gtfsPath, 'stop_times.txt'), 'utf8');
        const lines = content.split('\n');
        const headers = lines[0].split(',');
        
        for (let i = 1; i < lines.length; i++) {
            if (!lines[i].trim()) continue;
            const values = this.parseCSVLine(lines[i]);
            if (values.length < headers.length) continue;
            
            const stopTime = {};
            headers.forEach((h, idx) => {
                stopTime[h] = values[idx];
            });
            
            this.stopTimes.push(stopTime);
        }
    }

    loadRoutes() {
        const content = fs.readFileSync(path.join(this.gtfsPath, 'routes.txt'), 'utf8');
        const lines = content.split('\n');
        const headers = lines[0].split(',');
        
        for (let i = 1; i < lines.length; i++) {
            if (!lines[i].trim()) continue;
            const values = this.parseCSVLine(lines[i]);
            if (values.length < headers.length) continue;
            
            const route = {};
            headers.forEach((h, idx) => {
                route[h] = values[idx];
            });
            
            this.routes.set(route.route_id, route);
        }
    }

    loadCalendar() {
        try {
            const content = fs.readFileSync(path.join(this.gtfsPath, 'calendar.txt'), 'utf8');
            const lines = content.split('\n');
            const headers = lines[0].split(',');
            
            for (let i = 1; i < lines.length; i++) {
                if (!lines[i].trim()) continue;
                const values = this.parseCSVLine(lines[i]);
                if (values.length < headers.length) continue;
                
                const calendar = {};
                headers.forEach((h, idx) => {
                    calendar[h] = values[idx];
                });
                
                this.calendar.set(calendar.service_id, calendar);
            }
        } catch (err) {
            console.log('calendar.txt not found or error reading it');
        }
    }

    parseCSVLine(line) {
        const result = [];
        let current = '';
        let inQuotes = false;
        
        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            if (char === '"') {
                inQuotes = !inQuotes;
            } else if (char === ',' && !inQuotes) {
                result.push(current);
                current = '';
            } else {
                current += char;
            }
        }
        result.push(current);
        return result;
    }

    // Get schedule for a specific station and date
    getSchedule(stopId, date, direction = null) {
        // Format date as YYYYMMDD
        const dateStr = date.replace(/-/g, '');
        
        // Find all stop times for this station
        const stationStopTimes = this.stopTimes.filter(st => st.stop_id === stopId);
        
        // Group by trip_id and filter by date
        const tripsForDate = new Map();
        
        for (const stopTime of stationStopTimes) {
            const trip = this.trips.get(stopTime.trip_id);
            if (!trip) continue;
            
            // Check if trip is for the requested date
            // Trip ID format: number_YYYYMMDD
            if (stopTime.trip_id.includes(dateStr)) {
                if (!tripsForDate.has(stopTime.trip_id)) {
                    tripsForDate.set(stopTime.trip_id, {
                        trip_id: stopTime.trip_id,
                        trip: trip,
                        stopTime: stopTime,
                        route: this.routes.get(trip.route_id)
                    });
                }
            }
        }
        
        // Filter by direction if specified
        let filteredTrips = Array.from(tripsForDate.values());
        
        if (direction === 'to_cascais') {
            // Cais do Sodre -> Cascais
            filteredTrips = filteredTrips.filter(t => 
                t.route && t.route.route_id.includes('94_69005-94_69260')
            );
        } else if (direction === 'to_cais') {
            // Cascais -> Cais do Sodre
            filteredTrips = filteredTrips.filter(t => 
                t.route && t.route.route_id.includes('94_69260-94_69005')
            );
        }
        
        // Sort by departure time
        filteredTrips.sort((a, b) => {
            const timeA = this.timeToSeconds(a.stopTime.departure_time);
            const timeB = this.timeToSeconds(b.stopTime.departure_time);
            return timeA - timeB;
        });
        
        return filteredTrips.map(t => ({
            trip_id: t.trip_id,
            departure_time: t.stopTime.departure_time,
            arrival_time: t.stopTime.arrival_time,
            route: t.route ? t.route.route_long_name || t.route.route_short_name : null,
            destination: t.trip ? t.trip.trip_headsign : null
        }));
    }

    // Get next trains for a station
    getNextTrains(stopId, date, time, limit = 4) {
        const schedule = this.getSchedule(stopId, date);
        const nowSeconds = this.timeToSeconds(time);
        
        // Filter trains that haven't departed yet
        const upcoming = schedule.filter(s => {
            const depSeconds = this.timeToSeconds(s.departure_time);
            return depSeconds >= nowSeconds;
        });
        
        return upcoming.slice(0, limit);
    }

    timeToSeconds(timeStr) {
        if (!timeStr) return 0;
        const [h, m, s] = timeStr.split(':').map(Number);
        return (h * 3600) + (m * 60) + (s || 0);
    }

    secondsToTime(seconds) {
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = seconds % 60;
        return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }
}

module.exports = GTFSParser;


