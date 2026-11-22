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

### Marketplace (Home Assistant 2026.11 and later, recommended)

1. Go to **Settings → Marketplace** and select **Add from link** in the upper-right corner.
2. Enter `https://github.com/Knoedelauflauf/xenia-home-card` and select **Add**. Adding a custom repository needs a GitHub connection; the Marketplace asks you to connect if you have not yet.
3. Open **Xenia Home Card** and select **Install**. The card is added to your dashboard resources.
4. Reload the browser. If a repair under **Settings → System → Repairs** asks for a restart, restart Home Assistant first.

### HACS (Home Assistant 2026.10)

1. In Home Assistant, open HACS.
2. Open the three-dot menu in the top right and choose **Custom repositories**.
3. Add `https://github.com/Knoedelauflauf/xenia-home-card` with category **Dashboard**, then click **Add**.
4. Search HACS for **Xenia Home Card** and download it.
5. Reload the browser.

### Manual

1. Download `xenia-home-card.js` from the latest release on the [Releases page](https://github.com/Knoedelauflauf/xenia-home-card/releases).
2. Copy it to `config/www/xenia-home-card.js`.
3. Go to **Settings → Dashboards**, open the three-dot menu, choose **Resources** and add `/local/xenia-home-card.js` as a **JavaScript module**. With dashboards in YAML mode, add it under `lovelace: resources:` instead:

```yaml
resources:
  - url: /local/xenia-home-card.js
    type: module
```

## Configuration

Add the card to your dashboard. It detects your Xenia machine automatically:

```yaml
type: custom:xenia-home-card
```

### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `entity` | string | auto-detect | The shot tracker event entity (optional) |
| `title` | string | shot tracker name | Card title; without a name the localized "Espresso Shots" |
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
> receives nothing from it. With it set, the integration's live shot updates
> are bypassed.

## Requirements

- Home Assistant
- Xenia Espresso Machine integration version 0.7.0 or newer installed and configured (shot history is loaded through the integration's own WebSocket API, added in 0.7.0)

> [!NOTE]
> With an older integration version, the card shows live shots only, and an
> upgrade hint until the first live shot arrives. Shot history is unavailable
> until the integration is updated to 0.7.0 or newer.

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
