const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || "";
const OPENROUTER_MODEL =
  process.env.OPENROUTER_MODEL ||
  process.env.NEXT_PUBLIC_OPENROUTER_MODEL ||
  "google/gemini-2.5-flash-image";
const MAX_RETRIES = Number(process.env.OPENROUTER_MAX_RETRIES ?? 2);
const RETRY_BASE_MS = Number(process.env.OPENROUTER_RETRY_BASE_MS ?? 1200);

export type OpenRouterMessage = {
  role: "system" | "user" | "assistant";
  content:
    | string
    | Array<
        | { type: "text"; text: string }
        | { type: "image_url"; image_url: { url: string } }
      >;
};

type OpenRouterContentPart = {
  text?: string;
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isHardQuotaError(message: string) {
  const lower = message.toLowerCase();
  return (
    lower.includes("limit: 0") ||
    lower.includes("quota exceeded") ||
    lower.includes("billing") ||
    lower.includes("insufficient credits")
  );
}

function isRetryableStatus(status: number) {
  return status === 429 || status === 500 || status === 502 || status === 503 || status === 504;
}

export async function callOpenRouter(
  messages: OpenRouterMessage[],
  options?: { expectJson?: boolean }
) {
  if (!OPENROUTER_API_KEY) {
    throw new Error("OPENROUTER_API_KEY is not configured.");
  }

  let attempt = 0;
  let lastError = "OpenRouter request failed";

  while (attempt <= MAX_RETRIES) {
    try {
      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${OPENROUTER_API_KEY}`,
          "Content-Type": "application/json",
          "HTTP-Referer": process.env.APP_BASE_URL || "http://localhost:3001",
          "X-Title": "Autodealer Workflow Backend",
        },
        body: JSON.stringify({
          model: OPENROUTER_MODEL,
          messages,
          temperature: 0,
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        const errorText =
          payload?.error?.message ||
          payload?.message ||
          `OpenRouter request failed (${response.status})`;
        lastError = errorText;

        if (!isRetryableStatus(response.status) || isHardQuotaError(errorText) || attempt === MAX_RETRIES) {
          throw new Error(errorText);
        }

        const delayMs = RETRY_BASE_MS * Math.pow(2, attempt);
        await sleep(delayMs);
        attempt += 1;
        continue;
      }

      const message = payload?.choices?.[0]?.message?.content;
      return Array.isArray(message)
        ? message.map((part: OpenRouterContentPart) => part?.text || "").join("\n")
        : String(message || "");
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error ?? "Unknown error");
      if (attempt === MAX_RETRIES) {
        throw new Error(lastError);
      }
      const delayMs = RETRY_BASE_MS * Math.pow(2, attempt);
      await sleep(delayMs);
      attempt += 1;
    }
  }

  throw new Error(lastError);
}
