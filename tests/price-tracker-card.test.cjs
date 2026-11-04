const { test } = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const fs = require("node:fs");
const path = require("node:path");

function setup() {
  const registry = new Map();

  class HTMLElement {
    constructor() {
      this.isConnected = true;
      this.dispatchedEvents = [];
    }

    attachShadow() {
      this.shadowRoot = {
        innerHTML: "",
        querySelector: () => null,
        querySelectorAll: () => [],
      };

      return this.shadowRoot;
    }

    dispatchEvent(event) {
      this.dispatchedEvents.push(event);
      return true;
    }
  }

  class CustomEvent {
    constructor(type, options = {}) {
      this.type = type;
      this.detail = options.detail;
      this.bubbles = Boolean(options.bubbles);
      this.composed = Boolean(options.composed);
    }
  }

  const window = {
    customCards: [],
  };

  const context = vm.createContext({
    HTMLElement,
    CustomEvent,
    window,

    customElements: {
      get(name) {
        return registry.get(name);
      },

      define(name, value) {
        registry.set(name, value);
      },
    },

    console: {
      info() {},
      warn() {},
      error() {},
    },

    Intl,
    Date,
    Number,
    String,
    Boolean,
    Array,
    Object,
    Math,
    JSON,
    Map,
    Set,
    Promise,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
  });

  const source = fs.readFileSync(
    path.join(__dirname, "..", "price-tracker-card.js"),
    "utf8"
  );

  vm.runInContext(source, context, {
    filename: "price-tracker-card.js",
  });

  const Card = registry.get("price-tracker-card");
  const card = new Card();

  return {
    registry,
    window,
    context,
    source,
    Card,
    card,
  };
}

function configure(card, overrides = {}) {
  card.setConfig({
    name: "Test product",
    icon: "",
    accent: "var(--accent-5-color)",
    accent_end: "",
    unavailable_text: "Price unavailable",
    entities: [
      "sensor.variant_one",
      "sensor.variant_two",
      "sensor.variant_three",
    ],
    labels: [
      "Variant one",
      "Variant two",
      "Variant three",
    ],
    ...overrides,
  });
}

function setHass(card, states = {}) {
  card.hass = {
    states,
    locale: {
      language: "en",
      time_zone: "server",
    },
    config: {
      time_zone: "Europe/Amsterdam",
    },
  };
}

test("registers the card", () => {
  const { registry } = setup();

  assert.ok(registry.has("price-tracker-card"));
});

test("adds the card to the Home Assistant card picker", () => {
  const { window } = setup();

  const registration = window.customCards.find(
    (item) => item.type === "price-tracker-card"
  );

  assert.ok(registration);
  assert.equal(registration.name, "Price Tracker Card");
  assert.equal(registration.preview, false);
});

test("provides a visual configuration form", () => {
  const { Card } = setup();

  const form = Card.getConfigForm();

  assert.ok(form);
  assert.ok(Array.isArray(form.schema));
  assert.equal(typeof form.computeLabel, "function");
  assert.equal(typeof form.computeHelper, "function");
  assert.equal(typeof form.assertConfig, "function");
});

test("rejects non-list entities in the configuration form", () => {
  const { Card } = setup();

  const form = Card.getConfigForm();

  assert.throws(
    () => form.assertConfig({ entities: "sensor.test" }),
    /must be a list/
  );
});

test("rejects non-list labels in the configuration form", () => {
  const { Card } = setup();

  const form = Card.getConfigForm();

  assert.throws(
    () => form.assertConfig({ labels: "Test label" }),
    /must be a list/
  );
});

test("provides a stub configuration using the first sensor", () => {
  const { Card } = setup();

  const config = Card.getStubConfig(
    null,
    ["light.test", "sensor.product_price"],
    ["sensor.fallback_price"]
  );

  assert.equal(config.name, "Price tracker");
  assert.equal(config.entities.length, 1);
  assert.equal(config.entities[0], "sensor.product_price");
  assert.equal(config.accent, "var(--accent-5-color)");
  assert.equal(config.unavailable_text, "Price unavailable");
});

test("requires a configuration", () => {
  const { card } = setup();

  assert.throws(
    () => card.setConfig(null),
    /configuration is required/
  );
});

test("accepts the current entities and labels configuration", () => {
  const { card } = setup();

  assert.doesNotThrow(() => configure(card));

  assert.equal(card._config.entities.length, 3);
  assert.equal(card._config.labels.length, 3);
  assert.equal(card._config.entities[0], "sensor.variant_one");
  assert.equal(card._config.labels[0], "Variant one");
});

test("converts legacy variants configuration", () => {
  const { card } = setup();

  card.setConfig({
    name: "Legacy product",
    variants: [
      {
        entity: "sensor.legacy_one",
        label: "Legacy one",
      },
      {
        entity: "sensor.legacy_two",
        label: "Legacy two",
      },
    ],
  });

  assert.equal(card._config.entities.length, 2);
  assert.equal(card._config.entities[0], "sensor.legacy_one");
  assert.equal(card._config.entities[1], "sensor.legacy_two");

  assert.equal(card._config.labels[0], "Legacy one");
  assert.equal(card._config.labels[1], "Legacy two");
});

test("selects the cheapest available positive price", () => {
  const { card } = setup();

  configure(card);

  setHass(card, {
    "sensor.variant_one": {
      state: "19.95",
      attributes: {
        friendly_name: "Variant one",
      },
    },
    "sensor.variant_two": {
      state: "14.50",
      attributes: {
        friendly_name: "Variant two",
      },
    },
    "sensor.variant_three": {
      state: "17.25",
      attributes: {
        friendly_name: "Variant three",
      },
    },
  });

  const cheapest = card._getCheapestVariant();

  assert.ok(cheapest);
  assert.equal(cheapest.entity, "sensor.variant_two");
  assert.equal(cheapest.price, 14.5);
  assert.equal(cheapest.label, "Variant two");
});

test("ignores unavailable, invalid, zero and negative prices", () => {
  const { card } = setup();

  configure(card, {
    entities: [
      "sensor.unavailable",
      "sensor.invalid",
      "sensor.zero",
      "sensor.negative",
      "sensor.valid",
    ],
    labels: [],
  });

  setHass(card, {
    "sensor.unavailable": {
      state: "unavailable",
      attributes: {},
    },
    "sensor.invalid": {
      state: "not-a-number",
      attributes: {},
    },
    "sensor.zero": {
      state: "0",
      attributes: {},
    },
    "sensor.negative": {
      state: "-5",
      attributes: {},
    },
    "sensor.valid": {
      state: "9.99",
      attributes: {},
    },
  });

  const available = card._getAvailableVariants();

  assert.equal(available.length, 1);
  assert.equal(available[0].entity, "sensor.valid");
  assert.equal(available[0].price, 9.99);
});

test("keeps the first configured sensor when prices are equal", () => {
  const { card } = setup();

  configure(card, {
    entities: [
      "sensor.first",
      "sensor.second",
    ],
    labels: [
      "First",
      "Second",
    ],
  });

  setHass(card, {
    "sensor.first": {
      state: "12.50",
      attributes: {},
    },
    "sensor.second": {
      state: "12.50",
      attributes: {},
    },
  });

  const cheapest = card._getCheapestVariant();

  assert.equal(cheapest.entity, "sensor.first");
  assert.equal(cheapest.label, "First");
});

test("returns null when no valid prices are available", () => {
  const { card } = setup();

  configure(card);

  setHass(card, {
    "sensor.variant_one": {
      state: "unavailable",
      attributes: {},
    },
    "sensor.variant_two": {
      state: "unknown",
      attributes: {},
    },
    "sensor.variant_three": {
      state: "0",
      attributes: {},
    },
  });

  assert.equal(card._getCheapestVariant(), null);
});

test("uses the configured icon before the sensor icon", () => {
  const { card } = setup();

  configure(card, {
    icon: "mdi:cart",
  });

  const cheapest = {
    stateObject: {
      attributes: {
        icon: "mdi:tag",
      },
    },
  };

  assert.equal(card._getIcon(cheapest), "mdi:cart");
});

test("uses the sensor icon when no icon is configured", () => {
  const { card } = setup();

  configure(card, {
    icon: "",
  });

  const cheapest = {
    stateObject: {
      attributes: {
        icon: "mdi:package-variant",
      },
    },
  };

  assert.equal(
    card._getIcon(cheapest),
    "mdi:package-variant"
  );
});

test("falls back to the default tag icon", () => {
  const { card } = setup();

  configure(card, {
    icon: "",
  });

  assert.equal(
    card._getIcon(null),
    "mdi:tag-outline"
  );
});

test("uses the configured label before the friendly name", () => {
  const { card } = setup();

  configure(card);

  const cheapest = {
    entity: "sensor.variant_one",
    label: "Configured label",
    stateObject: {
      attributes: {
        friendly_name: "Friendly name",
      },
    },
  };

  assert.equal(
    card._getVariantLabel(cheapest),
    "Configured label"
  );
});

test("uses the friendly name when no label is configured", () => {
  const { card } = setup();

  configure(card);

  const cheapest = {
    entity: "sensor.variant_one",
    label: "",
    stateObject: {
      attributes: {
        friendly_name: "Friendly name",
      },
    },
  };

  assert.equal(
    card._getVariantLabel(cheapest),
    "Friendly name"
  );
});

test("shows the unavailable text when no price is available", () => {
  const { card } = setup();

  configure(card, {
    unavailable_text: "No current price",
  });

  assert.equal(
    card._getVariantLabel(null),
    "No current price"
  );
});

test("formats prices using Dutch number formatting", () => {
  const { card } = setup();

  configure(card);

  assert.equal(
    card._formatPrice({ price: 1234.5 }),
    "€ 1.234,50"
  );
});

test("shows a dash when no price is available", () => {
  const { card } = setup();

  configure(card);

  assert.equal(card._formatPrice(null), "–");
});

test("rejects unsafe CSS values", () => {
  const { card } = setup();

  assert.equal(
    card._sanitizeCssValue(
      "red; background: black",
      "var(--accent-5-color)"
    ),
    "var(--accent-5-color)"
  );

  assert.equal(
    card._sanitizeCssValue(
      "var(--accent-4-color)",
      "var(--accent-5-color)"
    ),
    "var(--accent-4-color)"
  );
});

test("dispatches Home Assistant more-info event", () => {
  const { card } = setup();

  card._showMoreInfo("sensor.variant_one");

  assert.equal(card.dispatchedEvents.length, 1);

  const event = card.dispatchedEvents[0];

  assert.equal(event.type, "hass-more-info");
  assert.equal(
    event.detail.entityId,
    "sensor.variant_one"
  );
  assert.equal(event.bubbles, true);
  assert.equal(event.composed, true);
});

test("does not dispatch more-info without an entity", () => {
  const { card } = setup();

  card._showMoreInfo("");

  assert.equal(card.dispatchedEvents.length, 0);
});

test("declares one matching semantic version constant and header", () => {
  const { source } = setup();

  const constantMatch = source.match(
    /const PRICE_TRACKER_CARD_VERSION\s*=\s*["'](\d+\.\d+\.\d+)["']/
  );

  const headerMatch = source.match(
    /Version:\s*(\d+\.\d+\.\d+)/
  );

  assert.ok(constantMatch);
  assert.ok(headerMatch);

  assert.equal(
    constantMatch[1],
    headerMatch[1],
    "The version constant and file header must match"
  );
});
