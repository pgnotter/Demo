# Stock Market Prediction Game

Static web app that uses real market data from Alpha Vantage to power a simple up/down prediction game. Built for deployment on GitHub Pages.

## Features

- Enter any valid stock ticker (e.g., `MSFT`, `COF`).
- Fetches real daily adjusted prices from Alpha Vantage.
- Randomly selects a starting trading day between 7 and 100 days ago (non-holiday/weekday).
- Shows the previous 7 trading days plus the starting day on a line chart.
- Predict up/down beginning the next trading day; score +1 for correct predictions.
- After each guess, the next day is revealed, the chart and current date advance, and score updates.

## Local Development

This is a static site; open `index.html` in a browser. For best results, serve via a local web server:

```bash
python3 -m http.server 8000
# then visit http://localhost:8000/
```

## Deployment to GitHub Pages

1. Create a new GitHub repository and push these files.
2. In GitHub, go to Settings → Pages.
3. Under "Build and deployment", set:
   - Source: "Deploy from a branch"
   - Branch: `main` and folder `/ (root)`
4. Click Save. After a few minutes, your site will be live at the URL shown.

Notes:
- Free Alpha Vantage API is rate limited (5 requests/min, 500/day). The app makes one request per game start.
- The API key is embedded client-side as provided by the user for this exercise.

## Tech

- Plain HTML/CSS/JS
- Chart.js for the line chart
- Alpha Vantage TIME_SERIES_DAILY_ADJUSTED endpoint

# Demo