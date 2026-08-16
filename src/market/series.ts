import type { ListedToken, Pool } from "../types";
import { loadJson, saveJson } from "../lib/storage";
import { emitMarket } from "./bus";
import { spotPrice } from "./price";
import { CANDLE_COUNT, INTERVAL_SEC, type Candle, type PairStats, type Timeframe } from "./types";

interface SeriesFile {
  [key: string]: Candle[];
}

function store(): SeriesFile {
  return loadJson<SeriesFile>("series", {});
}

function persist(next: SeriesFile): void {
  saveJson("series", next);
}

function hashStr(value: string): number {
  let h = 2166136261;
  for (let i = 0; i < value.length; i++) h = Math.imul(h ^ value.charCodeAt(i), 16777619);
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function volatility(pool: Pool, base: ListedToken, quote: ListedToken): number {
  if (pool.curve === "stable") return 0.00055;
  const tags = [...(base.tags ?? []), ...(quote.tags ?? [])];
  if (tags.includes("custom") || tags.includes("u128")) return 0.042;
  if (base.symbol === "BONK" || base.symbol === "WIF" || quote.symbol === "BONK" || quote.symbol === "WIF") {
    return 0.032;
  }
  return 0.016;
}

function seriesKey(poolId: string, timeframe: Timeframe): string {
  return `${poolId}:${timeframe}`;
}

function align(ts: number, interval: number): number {
  return Math.floor(ts / interval) * interval;
}

function generate(pool: Pool, base: ListedToken, quote: ListedToken, timeframe: Timeframe, last: number): Candle[] {
  const interval = INTERVAL_SEC[timeframe];
  const count = CANDLE_COUNT[timeframe];
  const end = align(Math.floor(Date.now() / 1000), interval);
  const rand = mulberry32(hashStr(`${pool.id}:${timeframe}:${base.mint}`));
  const vol = volatility(pool, base, quote);
  const stepVol = vol * Math.sqrt(interval / 3600);
  const logLast = Math.log(Math.max(last, 1e-18));
  const logs: number[] = new Array(count);
  logs[count - 1] = logLast;
  for (let i = count - 2; i >= 0; i--) {
    const shock = (rand() * 2 - 1) * stepVol;
    logs[i] = logs[i + 1]! - shock;
  }

  const candles: Candle[] = [];
  for (let i = 0; i < count; i++) {
    const open = Math.exp(logs[i]!);
    const close = i === count - 1 ? last : Math.exp(logs[i + 1]!);
    const wick = Math.abs(close - open) * (0.35 + rand() * 1.4) + open * stepVol * (0.15 + rand());
    const high = Math.max(open, close) + wick * rand();
    const low = Math.max(1e-18, Math.min(open, close) - wick * rand());
    const volume = (0.35 + rand()) * (Math.abs(close - open) / Math.max(open, 1e-12) + 0.002) * 50_000;
    candles.push({
      time: end - (count - 1 - i) * interval,
      open,
      high,
      low,
      close,
      volume,
    });
  }
  return candles;
}

function ensure(
  pool: Pool,
  base: ListedToken,
  quote: ListedToken,
  timeframe: Timeframe,
  last: number,
): Candle[] {
  const key = seriesKey(pool.id, timeframe);
  const all = store();
  let rows = all[key];
  let dirty = false;
  if (!rows?.length) {
    rows = generate(pool, base, quote, timeframe, last);
    dirty = true;
  } else {
    const interval = INTERVAL_SEC[timeframe];
    const now = align(Math.floor(Date.now() / 1000), interval);
    const next = rows.map((row) => ({ ...row }));
    const lastRow = next[next.length - 1]!;
    if (now > lastRow.time) {
      let cursor = lastRow.time;
      let price = lastRow.close;
      while (cursor < now) {
        cursor += interval;
        next.push({ time: cursor, open: price, high: price, low: price, close: price, volume: 0 });
      }
      while (next.length > CANDLE_COUNT[timeframe]) next.shift();
      dirty = true;
    }
    const live = next[next.length - 1]!;
    if (live.close !== last) {
      live.close = last;
      live.high = Math.max(live.high, last);
      live.low = Math.min(live.low, last);
      dirty = true;
    }
    rows = next;
  }
  if (dirty) {
    all[key] = rows;
    persist(all);
  }
  return rows;
}

export function nativeCandles(
  pool: Pool,
  tokens: ListedToken[],
  timeframe: Timeframe,
): Candle[] {
  const base = tokens.find((t) => t.mint === pool.tokenA);
  const quote = tokens.find((t) => t.mint === pool.tokenB);
  if (!base || !quote) return [];
  const last = spotPrice(pool, base.mint, quote.mint, tokens);
  if (last <= 0) return [];
  return ensure(pool, base, quote, timeframe, last).map((row) => ({ ...row }));
}

export function applyTradeToSeries(pool: Pool, price: number, quoteVolume: number, timeMs = Date.now()): void {
  if (price <= 0) return;
  const all = store();
  const ts = Math.floor(timeMs / 1000);
  for (const timeframe of Object.keys(INTERVAL_SEC) as Timeframe[]) {
    const key = seriesKey(pool.id, timeframe);
    const interval = INTERVAL_SEC[timeframe];
    const bucket = align(ts, interval);
    let rows = all[key];
    if (!rows?.length) continue;
    const next = rows.map((row) => ({ ...row }));
    const last = next[next.length - 1]!;
    if (last.time === bucket) {
      last.close = price;
      last.high = Math.max(last.high, price);
      last.low = Math.min(last.low, price);
      last.volume += quoteVolume;
    } else if (bucket > last.time) {
      let cursor = last.time;
      let px = last.close;
      while (cursor + interval < bucket) {
        cursor += interval;
        next.push({ time: cursor, open: px, high: px, low: px, close: px, volume: 0 });
      }
      next.push({
        time: bucket,
        open: last.close,
        high: Math.max(last.close, price),
        low: Math.min(last.close, price),
        close: price,
        volume: quoteVolume,
      });
      while (next.length > CANDLE_COUNT[timeframe]) next.shift();
    }
    all[key] = next;
  }
  persist(all);
  emitMarket();
}

export function statsFromCandles(rows: Candle[], last: number): PairStats {
  const cutoff = Math.floor(Date.now() / 1000) - 86_400;
  const window = rows.filter((row) => row.time >= cutoff);
  const use = window.length ? window : rows;
  const open = use[0]?.open ?? last;
  let high = last;
  let low = last;
  let volume = 0;
  for (const row of use) {
    high = Math.max(high, row.high);
    low = Math.min(low, row.low);
    volume += row.volume;
  }
  return {
    last,
    open,
    high,
    low,
    changePct: open > 0 ? ((last - open) / open) * 100 : 0,
    volume,
  };
}
