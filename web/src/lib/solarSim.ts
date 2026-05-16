"use client";

import { useEffect, useState } from "react";

// Simulated solar farms — real coordinates, real Open-Meteo radiation data.
// Each farm has a nameplate capacity. We compute kWh = capacity * radiation/1000 per hour.
export const SIM_FARMS = [
  { id: "0x7f2c1a3b4d5e6f70a1b2c3d4e5f6a7b8c9d0e1f2",     name: "Konya Field 07", country: "TR", lat: 37.8746, lon: 32.4932, capacityKw: 1200, sunPerKwh: 1.0 },
  { id: "0x9d31b7c8e2f4a5061728394a5b6c7d8e9f0a1b2c",     name: "Murcia 12",      country: "ES", lat: 37.9922, lon: -1.1307, capacityKw:  840, sunPerKwh: 1.0 },
  { id: "0x1ee02d3c4b5a69788796a5b4c3d2e1f0a9b8c7d6",     name: "Antalya 02",     country: "TR", lat: 36.8969, lon: 30.7133, capacityKw:  620, sunPerKwh: 1.0 },
  { id: "0x4b8a51c2d3e4f50617283940a1b2c3d4e5f60718",     name: "Jaipur 18",      country: "IN", lat: 26.9124, lon: 75.7873, capacityKw: 1480, sunPerKwh: 1.0 },
] as const;

export type SimFarm = (typeof SIM_FARMS)[number];

export type FarmSeries = {
  farm: SimFarm;
  hours: number[];       // hourly kWh, oldest → newest, length 168 (7 days)
  lifetimeKwh: number;   // sum
  pendingSun: number;    // sum × sunPerKwh; treated as unclaimed
  lastHourKwh: number;
  lastTimestamp: string; // ISO
};

export type SimNetwork = {
  farms: FarmSeries[];
  totalKwh: number;
  totalSun: number;
  hourlyAggregate: number[]; // sum across farms, length 168
  last24hKwh: number;
  activeFarms: number;
  loading: boolean;
  error: string | null;
};

const STC_W_PER_M2 = 1000;

type OpenMeteoResp = {
  hourly?: { time: string[]; shortwave_radiation: number[] };
};

async function fetchFarm(farm: SimFarm): Promise<FarmSeries> {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${farm.lat}&longitude=${farm.lon}&hourly=shortwave_radiation&past_days=7&forecast_days=1&timezone=auto`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Open-Meteo ${res.status} for ${farm.name}`);
  const json: OpenMeteoResp = await res.json();
  const rad = json.hourly?.shortwave_radiation ?? [];
  const times = json.hourly?.time ?? [];

  // Slice trailing 168 hours up to "now" (last full past hour).
  const nowIdx = Math.min(rad.length, 7 * 24 + new Date().getHours());
  const start = Math.max(0, nowIdx - 168);
  const window = rad.slice(start, nowIdx);
  const windowTimes = times.slice(start, nowIdx);

  const hours = window.map((wm2) => (farm.capacityKw * Math.max(0, wm2)) / STC_W_PER_M2);
  const lifetimeKwh = hours.reduce((a, b) => a + b, 0);
  return {
    farm,
    hours,
    lifetimeKwh,
    pendingSun: lifetimeKwh * farm.sunPerKwh * 0.18, // 18% unclaimed buffer for demo realism
    lastHourKwh: hours[hours.length - 1] ?? 0,
    lastTimestamp: windowTimes[windowTimes.length - 1] ?? new Date().toISOString(),
  };
}

let cached: SimNetwork | null = null;
let cachedAt = 0;
const TTL_MS = 5 * 60_000;

async function loadNetwork(): Promise<SimNetwork> {
  if (cached && Date.now() - cachedAt < TTL_MS) return cached;
  try {
    const farms = await Promise.all(SIM_FARMS.map(fetchFarm));
    const maxLen = Math.max(...farms.map((f) => f.hours.length));
    const hourlyAggregate = Array.from({ length: maxLen }, (_, i) =>
      farms.reduce((sum, f) => sum + (f.hours[i] ?? 0), 0),
    );
    const totalKwh = farms.reduce((a, f) => a + f.lifetimeKwh, 0);
    const last24hKwh = hourlyAggregate.slice(-24).reduce((a, b) => a + b, 0);
    const network: SimNetwork = {
      farms,
      totalKwh,
      totalSun: farms.reduce((a, f) => a + f.lifetimeKwh * f.farm.sunPerKwh, 0),
      hourlyAggregate,
      last24hKwh,
      activeFarms: farms.length,
      loading: false,
      error: null,
    };
    cached = network;
    cachedAt = Date.now();
    return network;
  } catch (e: any) {
    return {
      farms: [],
      totalKwh: 0,
      totalSun: 0,
      hourlyAggregate: [],
      last24hKwh: 0,
      activeFarms: 0,
      loading: false,
      error: e?.message ?? "network error",
    };
  }
}

export function useSolarSim(): SimNetwork {
  const [state, setState] = useState<SimNetwork>(
    cached ?? {
      farms: [],
      totalKwh: 0,
      totalSun: 0,
      hourlyAggregate: [],
      last24hKwh: 0,
      activeFarms: 0,
      loading: true,
      error: null,
    },
  );

  useEffect(() => {
    let alive = true;
    loadNetwork().then((n) => {
      if (alive) setState(n);
    });
    const id = setInterval(() => {
      loadNetwork().then((n) => alive && setState(n));
    }, TTL_MS);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  return state;
}

// Synthesize a recent activity feed from the latest hours of each farm.
export type SimActivity = {
  kind: "proof" | "claim" | "register";
  farm: string;
  kwh?: number;
  sun?: number;
  time: string;
  hash: string;
};

export function buildActivity(net: SimNetwork, limit = 8): SimActivity[] {
  if (!net.farms.length) return [];
  const out: SimActivity[] = [];
  // Take the last 3 hours of each farm, sort by recency
  for (const f of net.farms) {
    const tail = f.hours.slice(-3);
    tail.forEach((kwh, i) => {
      const minsAgo = (tail.length - 1 - i) * 60 + Math.floor(Math.random() * 30);
      if (kwh > 0.01) {
        out.push({
          kind: "proof",
          farm: f.farm.name,
          kwh: Math.round(kwh * 10) / 10,
          sun: Math.round(kwh * f.farm.sunPerKwh * 10) / 10,
          time: minsAgo < 60 ? `${minsAgo} min ago` : `${Math.round(minsAgo / 60)}h ago`,
          hash: shortHashFrom(f.farm.id, i),
        });
      }
    });
  }
  return out.slice(0, limit);
}

function shortHashFrom(seed: string, salt: number): string {
  // Deterministic short-hash style from the farm id.
  const s = seed.replace(/^0x/, "");
  const a = s.slice(salt * 4, salt * 4 + 4);
  const b = s.slice(-(4 + salt));
  return `0x${a}…${b.slice(0, 4)}`;
}
