/*
 * Price Tracker Card for Home Assistant
 *
 * Card type: custom:price-tracker-card
 * Version: 1.1.0
 */

const PRICE_TRACKER_CARD_VERSION = "1.1.0";

class PriceTrackerCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._config = null;
    this._hass = null;
    this._lastRenderSignature = null;
  }

  static getConfigForm() {
    const colourOptions = [
      { value: "var(--primary-color)", label: "Primary colour" },
      { value: "var(--accent-color)", label: "Accent colour" },
      { value: "var(--accent-1-color)", label: "Accent 1" },
      { value: "var(--accent-2-color)", label: "Accent 2" },
      { value: "var(--accent-3-color)", label: "Accent 3" },
      { value: "var(--accent-4-color)", label: "Accent 4" },
      { value: "var(--accent-5-color)", label: "Accent 5" },
      { value: "var(--accent-6-color)", label: "Accent 6" },
    ];

    return {
      schema: [
        {
          name: "name",
          required: true,
          selector: { text: {} },
        },
        {
          name: "icon",
          selector: { icon: {} },
        },
        {
          type: "grid",
          name: "",
          flatten: true,
          column_min_width: "200px",
          schema: [
            {
              name: "accent",
              selector: {
                select: {
                  mode: "dropdown",
                  options: colourOptions,
                },
              },
            },
            {
              name: "accent_end",
              selector: {
                select: {
                  mode: "dropdown",
                  options: [
                    { value: "", label: "Same as gradient start" },
                    ...colourOptions,
                  ],
                },
              },
            },
          ],
        },
        {
          name: "unavailable_text",
          selector: { text: {} },
        },
        {
          type: "expandable",
          name: "price_sensors",
          flatten: true,
          schema: [
            {
              name: "entities",
              required: true,
              selector: {
                entity: {
                  multiple: true,
                  reorder: true,
                  filter: [{ domain: "sensor" }],
                },
              },
            },
            {
              name: "labels",
              selector: {
                text: { multiple: true },
              },
            },
          ],
        },
      ],
      computeLabel: (schema) => {
        const labels = {
          name: "Product name",
          icon: "Icon",
          accent: "Gradient start",
          accent_end: "Gradient end",
          unavailable_text: "Unavailable text",
          price_sensors: "Price sensors",
          entities: "Price sensors",
          labels: "Variant labels",
        };
        return labels[schema.name] || schema.name;
      },
      computeHelper: (schema) => {
        const helpers = {
          icon: "Leave empty to use the icon of the cheapest sensor.",
          accent: "Select the theme colour used at the left side of the card.",
          accent_end: "Optional second gradient colour. Leave empty to reuse the start colour.",
          unavailable_text: "Text shown when none of the configured sensors contains a valid price.",
          entities: "Add and reorder sensors from most preferred to least preferred. The first sensor wins when prices are equal.",
          labels: "Optional. Enter one label per sensor in the same order.",
        };
        return helpers[schema.name] || "";
      },
      assertConfig: (config) => {
        if (config.entities !== undefined && !Array.isArray(config.entities)) {
          throw new Error("The 'entities' configuration must be a list.");
        }
        if (config.labels !== undefined && !Array.isArray(config.labels)) {
          throw new Error("The 'labels' configuration must be a list.");
        }
      },
    };
  }

  static getStubConfig(hass, entities = [], entitiesFallback = []) {
    const suggestedEntities = [...entities, ...entitiesFallback];
    const firstSensor = suggestedEntities.find((entityId) => entityId.startsWith("sensor.")) || "";
    return {
      name: "Price tracker",
      icon: "",
      accent: "var(--accent-5-color)",
      accent_end: "",
      unavailable_text: "Price unavailable",
      entities: firstSensor ? [firstSensor] : [],
      labels: [],
    };
  }

  setConfig(config) {
    if (!config) throw new Error("Price Tracker Card configuration is required.");

    const legacyVariants = Array.isArray(config.variants) ? config.variants : [];
    const entities = Array.isArray(config.entities)
      ? config.entities
      : legacyVariants.map((variant) => variant?.entity).filter(Boolean);
    const labels = Array.isArray(config.labels)
      ? config.labels
      : legacyVariants.map((variant) => variant?.label || "");

    this._config = {
      name: "Price tracker",
      icon: "",
      accent: "var(--accent-5-color)",
      accent_end: "",
      unavailable_text: "Price unavailable",
      ...config,
      entities,
      labels,
    };
    this._lastRenderSignature = null;
    this._render();
  }

  set hass(hass) {
    this._hass = hass;
    this._render();
  }

  get hass() {
    return this._hass;
  }

  getCardSize() {
    return 1;
  }

  getGridOptions() {
    return { columns: 12, rows: 1, min_columns: 3, min_rows: 1 };
  }

  _getConfiguredVariants() {
    const entities = Array.isArray(this._config?.entities) ? this._config.entities : [];
    const labels = Array.isArray(this._config?.labels) ? this._config.labels : [];
    return entities.filter(Boolean).map((entity, index) => ({
      entity,
      label: labels[index] || "",
      index,
    }));
  }

  _getAvailableVariants() {
    if (!this._hass || !this._config) return [];
    return this._getConfiguredVariants()
      .map((variant) => {
        const stateObject = this._hass.states[variant.entity];
        const price = Number.parseFloat(stateObject?.state);
        return { ...variant, stateObject, price };
      })
      .filter((variant) => variant.entity && Number.isFinite(variant.price) && variant.price > 0);
  }

  _getCheapestVariant() {
    const available = this._getAvailableVariants();
    if (available.length === 0) return null;
    return available.reduce((best, current) => current.price < best.price ? current : best);
  }

  _getIcon(cheapest) {
    return this._config.icon || cheapest?.stateObject?.attributes?.icon || "mdi:tag-outline";
  }

  _getVariantLabel(cheapest) {
    if (!cheapest) return this._config.unavailable_text || "Price unavailable";
    return cheapest.label || cheapest.stateObject?.attributes?.friendly_name || cheapest.entity;
  }

  _formatPrice(cheapest) {
    if (!cheapest) return "–";
    return `€ ${cheapest.price.toLocaleString("nl-NL", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  }

  _escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  _sanitizeCssValue(value, fallback) {
    const cssValue = String(value || "").trim();
    if (!cssValue || /[;{}<>]/.test(cssValue)) return fallback;
    return cssValue;
  }

  _getRenderSignature(cheapest) {
    const relevantStates = this._getConfiguredVariants().map((variant) => {
      const stateObject = this._hass?.states?.[variant.entity];
      return [
        variant.entity,
        variant.label,
        stateObject?.state,
        stateObject?.attributes?.icon,
        stateObject?.attributes?.friendly_name,
        stateObject?.last_updated,
      ];
    });
    return JSON.stringify({
      name: this._config.name,
      icon: this._config.icon,
      accent: this._config.accent,
      accentEnd: this._config.accent_end,
      unavailableText: this._config.unavailable_text,
      cheapestEntity: cheapest?.entity,
      relevantStates,
    });
  }

  _render() {
    if (!this._config || !this._hass) return;

    const cheapest = this._getCheapestVariant();
    const signature = this._getRenderSignature(cheapest);
    if (signature === this._lastRenderSignature) return;
    this._lastRenderSignature = signature;

    const name = this._escapeHtml(this._config.name || "Price tracker");
    const variantLabel = this._escapeHtml(this._getVariantLabel(cheapest));
    const formattedPrice = this._escapeHtml(this._formatPrice(cheapest));
    const icon = this._escapeHtml(this._getIcon(cheapest));
    const accent = this._sanitizeCssValue(this._config.accent, "var(--accent-5-color)");
    const accentEnd = this._sanitizeCssValue(this._config.accent_end, accent);

    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: block;
          width: 100%;
          height: 100%;
          min-width: 0;
          min-height: 0;
          --price-tracker-accent: ${accent};
          --price-tracker-accent-end: ${accentEnd};
        }
        * { box-sizing: border-box; }
        ha-card {
          position: relative;
          display: block;
          width: 100%;
          height: 100%;
          min-width: 0;
          min-height: 0;
          padding: 0 14px;
          overflow: hidden;
          cursor: ${cheapest ? "pointer" : "default"};
          border: none;
          border-radius: var(--ha-card-border-radius, 16px);
          box-shadow: var(--ha-card-box-shadow);
          background: linear-gradient(
            125deg,
            color-mix(in srgb, var(--price-tracker-accent) 95%, var(--card-background-color)) 30%,
            color-mix(in srgb, var(--price-tracker-accent-end) 42%, var(--card-background-color)) 100%
          );
        }
        ha-card:focus-visible {
          outline: 2px solid var(--primary-color);
          outline-offset: 2px;
        }
        .layout {
          display: grid;
          grid-template-areas: "icon title price" "icon variant price";
          grid-template-columns: 44px minmax(0, 1fr) auto;
          grid-template-rows: minmax(0, 1fr) minmax(0, 1fr);
          column-gap: 12px;
          align-items: center;
          width: 100%;
          height: 100%;
          min-width: 0;
          min-height: 0;
        }
        .icon-cell {
          grid-area: icon;
          display: flex;
          align-items: center;
          justify-content: center;
          width: 42px;
          height: 42px;
          margin: 0;
          padding: 0;
          justify-self: center;
          align-self: center;
          border: 1px solid color-mix(in srgb, var(--price-tracker-accent) 20%, transparent);
          border-radius: 13px;
          background: color-mix(in srgb, var(--price-tracker-accent) 14%, var(--card-background-color));
        }
        .icon-cell ha-icon {
          width: 27px;
          height: 27px;
          color: var(--price-tracker-accent);
        }
        .title {
          grid-area: title;
          align-self: end;
          justify-self: start;
          width: 100%;
          min-width: 0;
          margin: 0 0 2px 0;
          padding: 0;
          overflow: hidden;
          color: var(--primary-text-color);
          font-size: 16px;
          font-weight: 650;
          line-height: 1.15;
          text-align: left;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .variant {
          grid-area: variant;
          align-self: start;
          justify-self: start;
          width: 100%;
          min-width: 0;
          margin: 2px 0 0 0;
          padding: 0;
          overflow: hidden;
          color: color-mix(in srgb, var(--primary-text-color) 72%, transparent);
          font-size: 13px;
          font-weight: 450;
          line-height: 1.15;
          text-align: left;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .price {
          grid-area: price;
          justify-self: end;
          align-self: center;
          margin: 0;
          padding: 6px 10px;
          border: 1px solid color-mix(in srgb, var(--price-tracker-accent-end) 88%, transparent);
          border-radius: 12px;
          background: color-mix(in srgb, var(--price-tracker-accent-end) 72%, var(--card-background-color));
          color: var(--primary-text-color);
          font-size: 14px;
          font-weight: 650;
          line-height: 1;
          letter-spacing: -0.15px;
          white-space: nowrap;
        }
        @media (max-width: 400px) {
          ha-card { padding: 0 10px; }
          .layout { grid-template-columns: 40px minmax(0, 1fr) auto; column-gap: 9px; }
          .icon-cell { width: 38px; height: 38px; border-radius: 12px; }
          .icon-cell ha-icon { width: 24px; height: 24px; }
          .title { font-size: 15px; }
          .variant { font-size: 12px; }
          .price { padding: 6px 8px; font-size: 13px; }
        }
      </style>
      <ha-card tabindex="${cheapest ? "0" : "-1"}" role="${cheapest ? "button" : "group"}" aria-label="${name}, ${variantLabel}, ${formattedPrice}">
        <div class="layout">
          <div class="icon-cell"><ha-icon icon="${icon}"></ha-icon></div>
          <div class="title">${name}</div>
          <div class="variant">${variantLabel}</div>
          <div class="price">${formattedPrice}</div>
        </div>
      </ha-card>
    `;

    const card = this.shadowRoot.querySelector("ha-card");
    if (cheapest && card) {
      card.addEventListener("click", () => this._showMoreInfo(cheapest.entity));
      card.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          this._showMoreInfo(cheapest.entity);
        }
      });
    }
  }

  _showMoreInfo(entityId) {
    if (!entityId) return;
    this.dispatchEvent(new CustomEvent("hass-more-info", {
      detail: { entityId },
      bubbles: true,
      composed: true,
    }));
  }
}

if (!customElements.get("price-tracker-card")) {
  customElements.define("price-tracker-card", PriceTrackerCard);
}

window.customCards = window.customCards || [];
if (!window.customCards.some((card) => card.type === "price-tracker-card")) {
  window.customCards.push({
    type: "price-tracker-card",
    name: "Price Tracker Card",
    description: "Shows the lowest price from an ordered list of price sensors.",
    preview: false,
    documentationURL: "https://github.com/REPLACE_WITH_YOUR_GITHUB_USERNAME/price-tracker-card",
  });
}

console.info(
  `%c PRICE-TRACKER-CARD %c v${PRICE_TRACKER_CARD_VERSION} loaded`,
  "color: white; background: #03a9f4; font-weight: 700; padding: 2px 5px;",
  "color: #03a9f4; background: white; font-weight: 700; padding: 2px 5px;"
);
