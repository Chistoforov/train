#!/bin/bash
# Script to help capture CP API requests
# Run this, then open cp.pt in your browser and search for a route

echo "To capture CP API requests:"
echo "1. Open Chrome/Edge DevTools (F12)"
echo "2. Go to Network tab"
echo "3. Filter by 'api-gateway'"
echo "4. Search for a route on cp.pt"
echo "5. Right-click on the request → Copy → Copy as cURL"
echo "6. Paste it here"
echo ""
echo "Or use browser extension to export all requests"
echo ""
echo "Alternative: Install mitmproxy and capture traffic:"
echo "  pip install mitmproxy"
echo "  mitmproxy -p 8080"
echo "  Then set browser proxy to localhost:8080"

