# Price Tracker Card

A custom dashboard card for Home Assistant that displays the lowest valid price from an ordered list of sensor entities.

## Features

- Shows the lowest valid numeric price
- Ignores unavailable, unknown, zero, negative, and non-numeric values
- Uses sensor order as the tie-break preference
- Supports optional labels for product variants
- Uses the icon of the winning sensor or a configured override
- Native Home Assistant visual editor
- Native Home Assistant Layout tab support
- Theme-based two-colour gradient
- Opens more-info for the winning sensor
- Backward compatible with the earlier `variants` configuration format

## Installation with HACS

1. Open HACS.
2. Open the three-dot menu and select **Custom repositories**.
3. Add this GitHub repository URL.
4. Select **Dashboard** as the category.
5. Install **Price Tracker Card**.
6. Refresh Home Assistant.

## Manual installation

1. Copy `price-tracker-card.js` to `/config/www/price-tracker-card.js`.
2. Add `/local/price-tracker-card.js` as a JavaScript module under **Settings > Dashboards > Resources**.
3. Refresh Home Assistant.

## Usage

Add the card from the dashboard card picker or use YAML:

```yaml
type: custom:price-tracker-card
name: Pebble Slide Pro
icon: mdi:car-child-seat
accent: var(--accent-5-color)
accent_end: var(--accent-6-color)
unavailable_text: Price unavailable
entities:
  - sensor.maxi_cosi_pebble_slide_pro_copper_terra_met_isofixbase_familyfix_slide_pro
  - sensor.maxi_cosi_pebble_slide_pro_oak_truffle_met_isofixbase_familyfix_slide_pro
  - sensor.maxi_cosi_pebble_slide_pro_sapphire_sand_met_isofixbase_familyfix_slide_pro
labels:
  - Copper Terra
  - Oak Truffle
  - Sapphire Sand
```

The first sensor wins when two or more sensors have the same lowest price.

## Configuration

- `name`: Product name shown on the card.
- `icon`: Optional icon override. If omitted, the icon of the cheapest sensor is used.
- `accent`: Theme colour used at the left side of the gradient.
- `accent_end`: Optional theme colour used at the right side and for the price pill.
- `unavailable_text`: Text shown when no valid price is available.
- `entities`: Ordered list of price sensors.
- `labels`: Optional labels corresponding to the entities in the same order.

Card dimensions are managed through Home Assistant's native **Layout** tab.

## Updating

Install new releases through HACS. After an update, refresh the Home Assistant frontend if the previous JavaScript remains cached.

## License

MIT License. See [LICENSE](LICENSE).
