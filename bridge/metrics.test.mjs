import { test } from "node:test";
import assert from "node:assert/strict";
import { METRIC_TIERS } from "./metrics.mjs";

test("first request includes pulse rate (15), HRV (17) and breathing rate (2)", () => {
  const first = METRIC_TIERS[0].metrics;
  for (const code of [2, 15, 17]) assert.ok(first.includes(code), `missing ${code}`);
});

test("no request asks for device-key metrics: arterial pressure, EDA, micromotion", () => {
  for (const tier of METRIC_TIERS) {
    for (const code of [8, 9, 10, 16]) assert.ok(!tier.metrics.includes(code), `${tier.label} has ${code}`);
  }
});

test("fallback keeps breathing rate without cardio models", () => {
  const last = METRIC_TIERS.at(-1).metrics;
  assert.ok(last.includes(2));
  assert.ok(!last.includes(15) && !last.includes(17));
});
