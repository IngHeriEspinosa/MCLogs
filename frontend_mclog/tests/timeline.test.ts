import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { binTimeline, DAY_MS, fillTimeline, HOUR_MS, MAX_FILLED_BINS, trendBins } from "@/common/time/timeline";

const MINUTE = 60 * 1000;
const iso = (time: number) => new Date(time).toISOString();
const bucket = (time: number, error = 0, info = 0) => ({ bucket: iso(time), error, warn: 0, info, debug: 0 });

describe("relleno de la serie", () => {
  it("rellena los intervalos vacios con el tamano de intervalo de la API", () => {
    const start = Date.UTC(2026, 9, 1, 10, 0);
    const bins = fillTimeline([bucket(start, 1), bucket(start + 10 * MINUTE, 0, 2)], iso(start), iso(start + 15 * MINUTE), 5 * MINUTE);
    assert.deepEqual(
      bins.map((bin) => [bin.start - start, bin.total]),
      [
        [0, 1],
        [5 * MINUTE, 0],
        [10 * MINUTE, 2],
      ],
    );
  });

  it("marca como parciales el primer y el ultimo intervalo si la ventana los corta", () => {
    const from = Date.UTC(2026, 9, 1, 10, 30);
    const bins = fillTimeline([], iso(from), iso(from + 3 * HOUR_MS), HOUR_MS);
    assert.equal(bins.length, 4);
    assert.deepEqual(
      bins.map((bin) => bin.partial),
      [true, false, false, true],
    );
  });

  it("si la ventana acaba justo en un borde, no anade un intervalo vacio al final", () => {
    const from = Date.UTC(2026, 9, 1, 10, 0);
    const bins = fillTimeline([], iso(from), iso(from + 2 * HOUR_MS), HOUR_MS);
    assert.equal(bins.length, 2);
    assert.ok(bins.every((bin) => !bin.partial));
  });

  it("con mas intervalos que el tope conserva los mas recientes", () => {
    const to = Date.UTC(2026, 9, 1, 12, 0);
    const from = to - (MAX_FILLED_BINS + 500) * HOUR_MS;
    const bins = fillTimeline([bucket(to - HOUR_MS, 5)], iso(from), iso(to), HOUR_MS);
    assert.equal(bins.length, MAX_FILLED_BINS);
    assert.equal(bins[bins.length - 1].start, to - HOUR_MS);
    assert.equal(bins[bins.length - 1].total, 5);
  });

  it("sin intervalo explicito, la serie es por hora (respuestas antiguas)", () => {
    const from = Date.UTC(2026, 9, 1, 0, 0);
    const bins = fillTimeline([], iso(from), iso(from + DAY_MS));
    assert.equal(bins.length, 24);
    assert.equal(bins[0].end - bins[0].start, HOUR_MS);
  });
});

describe("agrupacion de la serie", () => {
  const hourly = (count: number) =>
    fillTimeline(
      Array.from({ length: count }, (_, index) => bucket(Date.UTC(2026, 9, 1) + index * HOUR_MS, 1)),
      iso(Date.UTC(2026, 9, 1)),
      iso(Date.UTC(2026, 9, 1) + count * HOUR_MS),
    );

  it("agrupa desde el final: el grupo corto es el primero", () => {
    const { bins, stepMs } = binTimeline(hourly(25), 12);
    assert.equal(stepMs, 3 * HOUR_MS);
    assert.equal(bins[bins.length - 1].total, 3);
    assert.equal(bins[bins.length - 1].partial, false);
    assert.equal(bins[0].total, 1);
    assert.equal(bins[0].partial, true);
  });

  it("no agrupa si caben todos", () => {
    const { bins, stepMs } = binTimeline(hourly(10), 24);
    assert.equal(bins.length, 10);
    assert.equal(stepMs, HOUR_MS);
  });

  it("la tendencia deja fuera los intervalos parciales de los extremos", () => {
    const from = Date.UTC(2026, 9, 1, 10, 30);
    const bins = fillTimeline([bucket(Date.UTC(2026, 9, 1, 13), 9)], iso(from), iso(from + 3 * HOUR_MS), HOUR_MS);
    const trend = trendBins(bins, 24);
    assert.equal(trend.length, 2);
    assert.ok(trend.every((bin) => !bin.partial));
  });
});
