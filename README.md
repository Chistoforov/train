# Carcavelos Trains

Mobile-first web application for checking train schedules between Carcavelos and Cais do Sodré.

## Features
- Real-time train data (proxied from CP API, with mock fallback if API is unreachable)
- Mobile-first design
- Auto-refresh
- Urgent train highlighting

## How to Run

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Start the Server**
   ```bash
   node server.js
   ```

3. **Open Application**
   Open [http://localhost:3001](http://localhost:3001) in your browser.

## Project Structure
- `public/index.html`: The main application (React + Babel Standalone). No build step required.
- `server.js`: Node.js server to proxy API requests (solving CORS) and serve the static file.
- `package.json`: Dependencies.

