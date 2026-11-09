import { test } from "node:test";
import assert from "node:assert/strict";
import { FrameClock } from "./frame-clock.mjs";

test("first frame is session-relative even after the companion has waited an hour", () => {
  const clock = new FrameClock();
  assert.equal(clock.next(3_600_000), 66_000);
  assert.equal(clock.next(3_600_066), 132_000);
});

test("preserves actual capture intervals in microseconds", () => {
  const clock = new FrameClock();
  assert.equal(clock.next(100), 66_000);
  assert.equal(clock.next(350), 316_000);
  assert.equal(clock.next(351.5), 317_500);
});

test("timestamps stay strictly increasing for frames received in the same tick", () => {
  const clock = new FrameClock();
  assert.equal(clock.next(100), 66_000);
  assert.equal(clock.next(100), 66_001);
});

test("rejects a five-second interruption rather than fabricating capture timing", () => {
  const clock = new FrameClock();
  clock.next(100);
  assert.equal(clock.next(5100), null);
});

test("a new session starts its own clock", () => {
  const first = new FrameClock();
  first.next(100);
  first.next(166);
  assert.equal(new FrameClock().next(10_000), 66_000);
});

test("rejects invalid and backwards times", () => {
  const clock = new FrameClock();
  assert.equal(clock.next(Number.NaN), null);
  clock.next(100);
  assert.equal(clock.next(99), null);
});