# Xenia Home Card

A Home Assistant Lovelace card for visualizing espresso shots from Xenia espresso machines.

## Disclaimer

> [!IMPORTANT]
> This project is an unofficial Home Assistant Lovelace card for visualizing espresso shots from machines produced by Xenia Espresso GmbH.
> It is **not affiliated with, endorsed by, or supported by Xenia Espresso GmbH** in any way.
> All product and company names, trademarks, and registered trademarks are the property of their respective owners.
> Use of names or trademarks in this project is solely for identification purposes to indicate device compatibility.
> This software is provided "as is", without any warranty. Use at your own risk.

## Features

- **Shot history**: View past shots with timestamps, duration, and weight
- **Interactive chart**: Pressure, flow, weight, and temperature over time
- **Real-time updates**: Automatically updates when new shots are completed
- **Localization**: Available in English and German

## Installation

### HACS (Recommended)

1. Open HACS in Home Assistant
2. Go to "Frontend" section
3. Click the three dots menu and select "Custom repositories"
4. Add this repository URL and select "Lovelace" as the category
5. Install "Xenia Home Card"
6. Refresh your browser (hard-reload: Ctrl+Shift+R / Cmd+Shift+R) to load the card

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

### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `entity` | string | auto-detect | The shot tracker event entity (optional) |
| `title` | string | (localized) | Card title |
| `show_chart` | boolean | `true` | Show the shot chart |
| `chart_height` | number | `200` | Chart height in pixels |
| `max_shots` | number | `10` | Maximum shots to display |

### Example with all options

```yaml
type: custom:xenia-home-card
entity: event.xenia_espresso_machine_shot_tracker
title: My Espresso Shots
show_chart: true
chart_height: 250
max_shots: 20
```

### Advanced

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `event_type` | string | (unset) | Custom event bus type to subscribe to for shot data (YAML only) |

Setting `event_type` switches the card from the integration's shot tracker
entity to events of that type on the Home Assistant event bus. This is meant
for users who fire their own events carrying shot data (e.g. from
automations). The event data must contain the shot fields (`start_time`,
`duration_seconds`, `timestamps`, `pump_pressures`, `flow_rates`, `weights`),
either directly or nested under `event_data`, `shot`, or `shot_data`.

> [!NOTE]
> `event_type` is not needed with the Xenia Espresso Machine integration and
> receives nothing from it — with it set, the integration's live shot updates
> are bypassed.

## Requirements

- Home Assistant
- Xenia Espresso Machine integration version 0.4.0 or newer installed and configured (the card reads its shot tracker event entity, introduced in 0.4.0)

> [!NOTE]
> Shot history is backfilled via the `recorder` and `history` integrations
> (enabled by default in Home Assistant). Without them the card shows live
> shots only, and excluding the shot tracker event entity from the recorder
> leaves the history empty.

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
