export default async (request) => {
  if (request.method !== "GET") {
    return new Response(JSON.stringify({ error: "Method not allowed." }), {
      status: 405,
      headers: { "content-type": "application/json; charset=utf-8" },
    });
  }

  return new Response(
    JSON.stringify({
      online: true,
      model: process.env.GEMINI_MODEL || "gemini-3.5-flash-lite",
      geminiConfigured: Boolean(process.env.GEMINI_API_KEY),
    }),
    {
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
      },
    },
  );
};
