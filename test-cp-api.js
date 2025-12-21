#!/usr/bin/env node
/**
 * Test script to find working CP API endpoints
 * Run: node test-cp-api.js
 */

const fetch = require('node-fetch');
const https = require('https');

const agent = new https.Agent({ rejectUnauthorized: false });
const API_KEY = 'ca3923e4-1d3c-424f-a3d0-9554cf3ef859';

const fromId = '9434007'; // Carcavelos
const toId = '9430005';   // Cais do Sodre
const date = '2025-12-21';

const headerSets = [
    {
        name: 'Mobile App',
        headers: {
            'x-api-key': API_KEY,
            'User-Agent': 'CP/3.4.0 (Android)',
            'Accept': 'application/json'
        }
    },
    {
        name: 'Web Browser',
        headers: {
            'x-api-key': API_KEY,
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': 'application/json',
            'Origin': 'https://www.cp.pt',
            'Referer': 'https://www.cp.pt/',
            'X-Requested-With': 'XMLHttpRequest'
        }
    }
];

const endpoints = [
    // Travel API variations
    `/cp/services/travel-api/itinerary?from=${fromId}&to=${toId}&date=${date}`,
    `/cp/services/travel-api/v2/itinerary?from=${fromId}&to=${toId}&date=${date}`,
    `/cp/services/travel-api/v1/itinerary?from=${fromId}&to=${toId}&date=${date}`,
    `/cp/services/travel-api/search?from=${fromId}&to=${toId}&date=${date}`,
    `/cp/services/travel-api/v2/search?from=${fromId}&to=${toId}&date=${date}`,
    `/cp/services/travel-api/trains?from=${fromId}&to=${toId}&date=${date}`,
    `/cp/services/travel-api/v2/trains?from=${fromId}&to=${toId}&date=${date}`,
    // Stations API
    `/cp/services/stations-api/stations/${fromId}/next-trains`,
    `/cp/services/stations-api/v2/stations/${fromId}/next-trains`,
    `/cp/services/stations-api/v1/stations/${fromId}/next-trains`,
    `/cp/services/stations-api/stations/${fromId}/departures`,
    `/cp/services/stations-api/stations/${fromId}/arrivals`,
];

async function testEndpoint(path, headers) {
    const url = `https://api-gateway.cp.pt${path}`;
    try {
        const response = await fetch(url, {
            agent,
            headers,
            timeout: 5000
        });
        
        const status = response.status;
        const contentType = response.headers.get('content-type') || '';
        
        if (status === 200) {
            const data = await response.json();
            return { success: true, status, data, contentType };
        } else if (status !== 404) {
            const text = await response.text().catch(() => '');
            return { success: false, status, error: text.substring(0, 200), contentType };
        }
        return { success: false, status: 404 };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

async function main() {
    console.log('Testing CP API endpoints...\n');
    
    for (const headerSet of headerSets) {
        console.log(`\n=== Testing with ${headerSet.name} headers ===`);
        
        for (const endpoint of endpoints) {
            const result = await testEndpoint(endpoint, headerSet.headers);
            
            if (result.success) {
                console.log(`\n✅ SUCCESS! ${endpoint}`);
                console.log(`Status: ${result.status}`);
                console.log(`Content-Type: ${result.contentType}`);
                console.log(`Response: ${JSON.stringify(result.data).substring(0, 500)}`);
                return; // Found working endpoint!
            } else if (result.status && result.status !== 404) {
                console.log(`⚠️  ${endpoint.substring(0, 60)}... → ${result.status} ${result.error || ''}`);
            }
        }
    }
    
    console.log('\n❌ No working endpoints found. All returned 404 or errors.');
}

main().catch(console.error);




