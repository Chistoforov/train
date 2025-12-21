# CP API Integration Notes

## Current Status
- ✅ Found API key: `ca3923e4-1d3c-424f-a3d0-9554cf3ef859` (from fe-config.json)
- ✅ Found API base: `https://api-gateway.cp.pt/cp/services/travel-api`
- ❌ All endpoints return 404 "No resources match requested URI"

## Station IDs
- Carcavelos: `9434007` (numeric) or `94-34007` (hyphenated)
- Cais do Sodré: `9430005` (numeric) or `94-30005` (hyphenated)

## Endpoints Tried
1. `/cp/services/travel-api/itinerary?from={id}&to={id}&date={date}`
2. `/cp/services/travel-api/v2/itinerary?from={id}&to={id}&date={date}`
3. `/cp/services/travel-api/trains/search?from={id}&to={id}&date={date}`
4. `/cp/services/travel-api/v2/trains/search?from={id}&to={id}&date={date}`
5. `/cp/services/stations-api/stations/{id}/next-trains`
6. `/cp/services/stations-api/v2/stations/{id}/next-trains`

## Headers Used
- `x-api-key: ca3923e4-1d3c-424f-a3d0-9554cf3ef859`
- `User-Agent: CP/3.4.0 (Android)` or browser UA
- `Accept: application/json`
- `Origin: https://www.cp.pt`
- `Referer: https://www.cp.pt/`

## Possible Issues
1. **JWT Token Required**: Some endpoints may require user authentication
2. **Wrong Path Structure**: Actual path might be different
3. **Additional Headers**: May need `X-Requested-With`, `Accept-Language`, etc.
4. **Date Format**: May need different date format (DD-MM-YYYY vs YYYY-MM-DD)

## Current Solution
Using hybrid approach:
- Static schedule (hardcoded) + Live delays from comboios.live API
- This works but doesn't use official CP schedule API

## Next Steps
1. Monitor browser Network tab on cp.pt to see actual API calls
2. Try to extract JWT token from browser session
3. Check if mobile app uses different endpoints
4. Consider using comboios.live as primary source (it works!)


