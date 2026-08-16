export default async function handler(event) {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Content-Type": "application/json",
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers };
  }

  const key = process.env.JUPITER_API_KEY;
  if (!key) {
    return { statusCode: 200, headers, body: JSON.stringify({ skipped: true }) };
  }

  const params = event.queryStringParameters ?? {};
  const { inputMint, outputMint, amount } = params;
  if (!inputMint || !outputMint || !amount) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: "missing params" }) };
  }

  const url = new URL("https://api.jup.ag/swap/v2/order");
  url.searchParams.set("inputMint", inputMint);
  url.searchParams.set("outputMint", outputMint);
  url.searchParams.set("amount", amount);

  const res = await fetch(url, { headers: { "x-api-key": key } });
  const text = await res.text();
  if (!res.ok) {
    return { statusCode: 200, headers, body: JSON.stringify({ skipped: true, error: text.slice(0, 200) }) };
  }

  const data = JSON.parse(text);
  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({
      outAmount: data.outAmount ?? data.outAmountResult ?? data.outputAmount,
      priceImpactPct: data.priceImpactPct ?? 0,
    }),
  };
}
