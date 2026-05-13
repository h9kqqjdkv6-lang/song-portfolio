// Netlify Function: proxy QWeather API, hide API Key
// GET /.netlify/functions/weather?location=101120201

export default async (request) => {
  const url = new URL(request.url);
  const location = url.searchParams.get("location") || "101120201";
  const apiKey = process.env.QWEATHER_KEY;

  if (!apiKey) {
    return new Response(JSON.stringify({ error: "QWEATHER_KEY not configured" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const apiUrl =
    "https://n84ewu8re9.re.qweatherapi.com/v7/weather/now?location=" +
    encodeURIComponent(location) +
    "&key=" +
    apiKey;

  try {
    const resp = await fetch(apiUrl);
    const data = await resp.json();
    return new Response(JSON.stringify(data), {
      status: resp.status,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 502,
      headers: { "Content-Type": "application/json" },
    });
  }
};

export const config = {
  path: "/api/weather",
  method: "GET",
};
