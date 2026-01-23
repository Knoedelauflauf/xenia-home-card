# Xenia Home Card

A Home Assistant Lovelace card for visualizing espresso shots from the Xenia espresso machine.

## Features

- **Auto-detection**: Automatically finds your Xenia espresso machine - no configuration needed
- View shot history with timestamps, duration, and weight
- Interactive chart showing pressure, flow, weight, and temperature over time
- Real-time updates when new shots are completed
- Click on any shot to view its detailed chart

## Installation

### HACS (Recommended)

1. Open HACS in Home Assistant
2. Go to "Frontend" section
3. Click the three dots menu and select "Custom repositories"
4. Add this repository URL and select "Lovelace" as the category
5. Install "Xenia Home Card"
6. Restart Home Assistant

### Manual Installation

1. Download `xenia-home-card.js` from the latest release
2. Copy it to `config/www/xenia-home-card.js`
3. Add the resource in your Lovelace configuration:

```yaml
resources:
  - url: /local/xenia-home-card.js
    type: module
```

## Configuration

Add the card to your dashboard - it will automatically detect your Xenia machine:

```yaml
type: custom:xenia-home-card
```

That's it! The card will auto-detect your Xenia espresso machine.

### Optional Configuration

```yaml
type: custom:xenia-home-card
title: Espresso Shots
show_chart: true
chart_height: 200
max_shots: 10
```

### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `entity` | string | auto-detect | The shot tracker event entity (optional) |
| `title` | string | "Espresso Shots" | Card title |
| `show_chart` | boolean | true | Show the shot chart |
| `chart_height` | number | 200 | Chart height in pixels |
| `max_shots` | number | 10 | Maximum shots to display (from last 30 days) |

The card uses Home Assistant's built-in history to retrieve past shots - no additional configuration needed in the integration.

## Requirements

- Home Assistant with the Xenia Espresso Machine integration installed
- The integration must be configured and connected to your machine

## Development

```bash
# Install dependencies
npm install

# Build for development (with watch)
npm run watch

# Build for production
npm run build
```

## License

MIT
