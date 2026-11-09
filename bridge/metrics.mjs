// SmartSpectra MetricType codes. Arterial pressure (16), EDA (10) and
// micromotion (8, 9) need a device key that fails to provision on some
// computers ("device_id is required for remote model download"), which makes
// the whole SDK configuration fail. CalmPulse only needs pulse, HRV and breathing.
const BREATHING = [0, 1, 2, 3, 4, 5, 6, 7];
const PULSE_RATE = 15;
const HRV = 17;

/** Metric sets to try in order; later sets are fallbacks if configuration fails. */
export const METRIC_TIERS = Object.freeze([
  Object.freeze({ label: "pulse, HRV and breathing", metrics: Object.freeze([...BREATHING, PULSE_RATE, HRV]) }),
  Object.freeze({ label: "breathing only", metrics: Object.freeze([...BREATHING]) }),
]);

/** SmartSpectra error code for "configuration failed". */
export const CONFIG_FAILED = 3;
