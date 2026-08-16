const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Content-Type": "application/json",
};

function json(status, body) {
  return { statusCode: status, headers: CORS, body: JSON.stringify(body) };
}

function chunk(items, size) {
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

async function fetchCoin(mint) {
  const urls = [
    `https://frontend-api-v3.pump.fun/coins/${mint}`,
    `https://frontend-api-v3.pump.fun/coins-v2/${mint}`,
  ];
  for (const url of urls) {
    try {
      const res = await fetch(url, {
        headers: { accept: "application/json" },
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) continue;
      const coin = await res.json();
      const usd = Number(coin.usd_market_cap ?? coin.market_cap_usd ?? 0);
      const sol = Number(coin.market_cap ?? coin.market_cap_quote ?? 0);
      return {
        mint,
        usd: Number.isFinite(usd) ? usd : 0,
        sol: Number.isFinite(sol) ? sol : 0,
        complete: Boolean(coin.complete),
        name: coin.name ?? "",
        symbol: coin.symbol ?? "",
      };
    } catch {
      // try next url
    }
  }
  return { mint, usd: 0, sol: 0, complete: false, missing: true };
}

export async function handler(event) {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: CORS, body: "" };
  }

  let mints = [];
  if (event.httpMethod === "GET") {
    const raw = event.queryStringParameters?.mints ?? "";
    mints = raw.split(",").map((m) => m.trim()).filter(Boolean);
  } else {
    try {
      const body = JSON.parse(event.body || "{}");
      mints = Array.isArray(body.mints) ? body.mints : [];
    } catch {
      return json(400, { error: "invalid json" });
    }
  }

  mints = [...new Set(mints.map(String))].slice(0, 80);
  if (!mints.length) return json(200, { coins: [] });

  const coins = [];
  for (const group of chunk(mints, 16)) {
    const part = await Promise.all(group.map(fetchCoin));
    coins.push(...part);
  }

  return json(200, { coins });
}
