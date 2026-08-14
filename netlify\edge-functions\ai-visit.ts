type NetlifyContext = {
  ip?: string;
  next(): Promise<Response>;
  waitUntil(promise: Promise<unknown>): void;
};

declare const Netlify: {
  env: {
    get(name: string): string | undefined;
  };
};

const DEFAULT_INGEST_URL =
  "https://yangmadam-ai-visits.jjang0625.chatgpt.site/api/ingest";

async function aiVisit(request: Request, context: NetlifyContext) {
  const response = await context.next();

  if (!response.ok || !isHtmlRequest(request, response)) return response;

  const url = new URL(request.url);
  if (!isPublicPage(url.pathname)) return response;

  const userAgent = request.headers.get("user-agent") ?? "";
  if (!looksLikeBot(userAgent)) return response;

  const ingestKey = Netlify.env.get("AI_VISIT_INGEST_KEY");
  if (!ingestKey) return response;

  const ipHash = context.ip
    ? await hashIp(
        context.ip,
        Netlify.env.get("AI_VISIT_IP_SALT") ?? ingestKey,
      )
    : null;

  context.waitUntil(
    fetch(Netlify.env.get("AI_VISIT_INGEST_URL") ?? DEFAULT_INGEST_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${ingestKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        path: url.pathname,
        userAgent: userAgent.slice(0, 512),
        ipHash,
        referrer: request.headers.get("referer"),
      }),
    }).catch((error) => {
      console.warn("[ai-visits] analytics delivery failed", error);
    }),
  );

  return response;
}

export default aiVisit;

export const config = {
  path: "/*",
  excludedPath: [
    "/admin/*",
    "/api/*",
    "/images/*",
    "/videos/*",
    "/*.css",
    "/*.js",
    "/*.json",
    "/*.xml",
    "/*.txt",
    "/*.ico",
    "/*.png",
    "/*.jpg",
    "/*.jpeg",
    "/*.webp",
    "/*.svg",
    "/*.mp4",
    "/*.webm",
  ],
};

function isHtmlRequest(request: Request, response: Response): boolean {
  if (request.method !== "GET" && request.method !== "HEAD") return false;
  return response.headers.get("content-type")?.toLowerCase().includes("text/html") ?? false;
}

function isPublicPage(pathname: string): boolean {
  return pathname === "/" || pathname.endsWith(".html");
}

function looksLikeBot(userAgent: string): boolean {
  return /bot|crawler|spider|fetcher|slurp|ai|gpt|claude|perplexity|bytespider|cohere|mistral|yeti|youbot/i.test(
    userAgent,
  );
}

async function hashIp(ipAddress: string, salt: string): Promise<string | null> {
  if (!salt) return null;
  const payload = new TextEncoder().encode(`${salt}:${ipAddress}`);
  const digest = await crypto.subtle.digest("SHA-256", payload);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 24);
}
