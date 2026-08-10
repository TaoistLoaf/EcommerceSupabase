import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  FAQ_ENTRIES,
  KNOWLEDGE_FACTS,
  OUT_OF_SCOPE_REPLY,
  PLATFORM_KEYWORDS,
  PRODUCT_CONTEXT_KEYWORDS,
  SUPPORT_EMAIL,
} from "./knowledge.ts";
import { sendOrderSummaryEmail } from "./orderEmail.ts";
import { sendRecentOrderSummaryEmail } from "./orderSummaryEmail.ts";
import { getChatIntent } from "./router.ts";

// CORS and JSON headers for browser POST requests.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

const MAX_MESSAGES = 12;
const MAX_CONTENT_LENGTH = 1200;
const MAX_PAGE_CONTEXT_LENGTH = 1800;
const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const DEFAULT_MODEL = "gpt-5-mini";
const OPENAI_MAX_OUTPUT_TOKENS = 900;
const OPENAI_RETRY_MAX_OUTPUT_TOKENS = 1600;
const ORDER_AUTH_REPLY =
  "You are signed in. I can continue helping with your order request.";
const ORDER_AUTH_REQUIRED_REPLY =
  "Please sign in before asking about your order or tracking information.";

const ORDER_AUTH_KEYWORDS = [
  "where is my order",
  "track my order",
  "track order",
  "tracking",
  "order status",
  "live order",
  "payment status",
  "my order",
  "我的订单",
  "订单状态",
  "支付状态",
  "物流",
  "追踪",
  "查看订单",
];

const ORDER_EMAIL_ACTION_KEYWORDS = [
  "email",
  "mail",
  "send",
  "forward",
  "inbox",
  "邮箱",
  "邮件",
  "发送",
  "发给",
  "发到",
];

const ORDER_SUMMARY_KEYWORDS = [
  "order",
  "orders",
  "order content",
  "order details",
  "order summary",
  "order information",
  "recent orders",
  "latest orders",
  "订单",
  "订单内容",
  "订单信息",
  "订单详情",
  "订单摘要",
  "最近订单",
];

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

// Normalize a text field and cap input length before it reaches the model.
const sanitizeText = (value: unknown, maxLength = MAX_CONTENT_LENGTH) =>
  typeof value === "string" ? value.trim().slice(0, maxLength) : "";

const normalizeSearchText = (value: string) => value.toLowerCase();

const escapeRegExp = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const includesKeyword = (text: string, keyword: string) => {
  const normalizedKeyword = normalizeSearchText(keyword).trim();
  if (!normalizedKeyword) return false;

  if (/[a-z0-9]/i.test(normalizedKeyword)) {
    const escapedKeyword = escapeRegExp(normalizedKeyword);
    const suffix = /^[a-z]+$/i.test(normalizedKeyword)
      ? "(?:s|ed|ing)?"
      : "";
    return new RegExp(`\\b${escapedKeyword}${suffix}\\b`, "i").test(text);
  }

  return text.includes(normalizedKeyword);
};

const jsonResponse = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: corsHeaders,
  });

const isOrderAuthRequest = (text: string) => {
  const normalized = normalizeSearchText(text);
  return ORDER_AUTH_KEYWORDS.some((keyword) =>
    includesKeyword(normalized, keyword)
  );
};

const isRecentOrderSummaryEmailRequest = (text: string) => {
  const normalized = normalizeSearchText(text);
  const mentionsEmailAction = ORDER_EMAIL_ACTION_KEYWORDS.some((keyword) =>
    includesKeyword(normalized, keyword)
  );
  const mentionsOrderSummary = ORDER_SUMMARY_KEYWORDS.some((keyword) =>
    includesKeyword(normalized, keyword)
  );

  return mentionsEmailAction && mentionsOrderSummary;
};

const getAuthUser = async (req: Request) => {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !anonKey) {
    throw new Error("Supabase auth environment is not configured");
  }

  const userSupabase = createClient(supabaseUrl, anonKey, {
    global: {
      headers: {
        Authorization: req.headers.get("Authorization") || "",
      },
    },
  });

  const { data, error } = await userSupabase.auth.getUser();
  if (error || !data.user?.id) return null;
  return data.user;
};

const getOrderAuthResponse = async (req: Request) => {
  const user = await getAuthUser(req);
  return {
    success: true,
    authenticated: Boolean(user),
    source: "order_auth_check",
    reply: user ? ORDER_AUTH_REPLY : ORDER_AUTH_REQUIRED_REPLY,
  };
};

// Build model instructions from local ReShareLoop facts and safe page context.
const getSiteInstructions = (pageContext: unknown) => {
  const context =
    pageContext && typeof pageContext === "object"
      ? JSON.stringify(pageContext).slice(0, MAX_PAGE_CONTEXT_LENGTH)
      : "";

  return [
    "You are ReShareLoop's AI shopping assistant.",
    "Help customers with buying, renting, lending, selling, product discovery, checkout, returns, shipping, account navigation, and basic platform questions.",
    "Use a calm, concise, helpful tone. Keep answers under 140 words unless the customer asks for details.",
    "Only answer using the known facts and current page context below.",
    "If the information is not available, say you do not have enough information and recommend the next in-app step or support contact.",
    "Do not invent live order status, inventory changes, payment outcomes, seller promises, legal advice, or policy exceptions.",
    `For private account, payment, order-specific, refund-specific, or seller-specific issues, explain what the customer can check in the app and recommend contacting ReShareLoop support at ${SUPPORT_EMAIL}.`,
    "Known ReShareLoop facts:",
    ...KNOWLEDGE_FACTS.map((fact) => `- ${fact}`),
    context ? `Current page context: ${context}` : "",
  ]
    .filter(Boolean)
    .join("\n");
};
// Keep only trusted chat roles and bounded text from browser input.
const normalizeMessages = (messages: unknown): ChatMessage[] => {
  if (!Array.isArray(messages)) return [];

  return messages
    .slice(-MAX_MESSAGES)
    .map((message) => {
      if (!message || typeof message !== "object") return null;
      const role = (message as { role?: unknown }).role;
      const content = sanitizeText((message as { content?: unknown }).content);
      if ((role !== "user" && role !== "assistant") || !content) return null;
      return { role, content };
    })
    .filter(Boolean) as ChatMessage[];
};

const isProductPage = (pageContext: unknown) =>
  Boolean(
    pageContext &&
      typeof pageContext === "object" &&
      (pageContext as { page?: unknown }).page === "product"
  );

const isProductContextQuestion = (text: string, pageContext: unknown) =>
  isProductPage(pageContext) &&
  PRODUCT_CONTEXT_KEYWORDS.some((keyword) => includesKeyword(text, keyword));

const isPlatformQuestion = (text: string, pageContext: unknown) => {
  const normalized = normalizeSearchText(text);
  return (
    isProductContextQuestion(normalized, pageContext) ||
    PLATFORM_KEYWORDS.some((keyword) => includesKeyword(normalized, keyword))
  );
};

const findFaqAnswer = (text: string) => {
  const normalized = normalizeSearchText(text);
  return FAQ_ENTRIES.find((entry) =>
    entry.keywords.some((keyword) => includesKeyword(normalized, keyword))
  );
};

// Responses may expose text as a shortcut or nested message content.
const extractText = (response: Record<string, unknown>) => {
  if (typeof response.output_text === "string") {
    return response.output_text.trim();
  }

  const output = Array.isArray(response.output) ? response.output : [];
  const chunks: string[] = [];

  for (const item of output) {
    if (!item || typeof item !== "object") continue;
    const content = (item as { content?: unknown }).content;
    if (!Array.isArray(content)) continue;

    for (const part of content) {
      if (!part || typeof part !== "object") continue;
      const text = (part as { text?: unknown }).text;
      if (typeof text === "string") chunks.push(text);
      const refusal = (part as { refusal?: unknown }).refusal;
      if (typeof refusal === "string") chunks.push(refusal);
    }
  }

  return chunks.join("\n").trim();
};

// Keep empty upstream responses debuggable without breaking the chat UI.
const getOpenAiEmptyReplyDebug = (
  payload: Record<string, unknown>,
  requestId: string | null
) => {
  const status = typeof payload.status === "string" ? payload.status : "";
  const incompleteDetails =
    payload.incomplete_details && typeof payload.incomplete_details === "object"
      ? JSON.stringify(payload.incomplete_details)
      : "";
  const outputTypes = Array.isArray(payload.output)
    ? payload.output
        .map((item) =>
          item && typeof item === "object"
            ? String((item as { type?: unknown }).type || "unknown")
            : "unknown"
        )
        .join(", ")
    : "";

  return [
    "OpenAI returned no readable text.",
    status ? `Status: ${status}` : "",
    incompleteDetails ? `Incomplete details: ${incompleteDetails}` : "",
    outputTypes ? `Output types: ${outputTypes}` : "",
    requestId ? `Request ID: ${requestId}` : "",
  ]
    .filter(Boolean)
    .join(" ");
};

// Extract readable error messages from OpenAI error responses.
const getOpenAiError = (payload: unknown, fallback: string) => {
  if (!payload || typeof payload !== "object") return fallback;

  const error = (payload as { error?: unknown }).error;
  if (error && typeof error === "object") {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message;
  }

  const message = (payload as { message?: unknown }).message;
  return typeof message === "string" && message.trim() ? message : fallback;
};

const supportsReasoningEffort = (model: string) =>
  model.startsWith("gpt-5") || model.startsWith("o");

const isMaxOutputTokenIncomplete = (payload: Record<string, unknown>) => {
  const details = payload.incomplete_details;
  if (!details || typeof details !== "object") return false;

  return (
    payload.status === "incomplete" &&
    (details as { reason?: unknown }).reason === "max_output_tokens"
  );
};

const buildOpenAiPayload = (
  model: string,
  instructions: string,
  messages: ChatMessage[],
  maxOutputTokens: number
) => {
  const payload: Record<string, unknown> = {
    model,
    instructions,
    input: messages,
    max_output_tokens: maxOutputTokens,
  };

  // GPT-5 reasoning can consume output budget before a visible answer is produced.
  if (supportsReasoningEffort(model)) {
    payload.reasoning = { effort: "minimal" };
  }

  return payload;
};

const requestOpenAi = async (
  apiKey: string,
  model: string,
  instructions: string,
  messages: ChatMessage[],
  maxOutputTokens: number
) => {
  const response = await fetch(OPENAI_RESPONSES_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(
      buildOpenAiPayload(model, instructions, messages, maxOutputTokens)
    ),
  });

  const data = await response.json().catch(() => ({}));
  return { response, data: data as Record<string, unknown> };
};

serve(async (req) => {
  // Handle CORS preflight requests.
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: corsHeaders });
  }

  // Only POST is supported for chat requests.
  if (req.method !== "POST") {
    return jsonResponse({ success: false, error: "Method not allowed" }, 405);
  }

  try {
    const body = await req.json().catch(() => ({}));
    const messages = normalizeMessages(body.messages);
    // Allows the user to bypass FAQ/scope guard when they explicitly request AI.
    const forceAi = body.forceAi === true || body.responseMode === "ai";
    // Require at least one user turn after sanitizing untrusted browser input.
    const latestUserMessage = [...messages]
      .reverse()
      .find((message) => message.role === "user");

    if (!latestUserMessage) {
      return jsonResponse(
        { success: false, error: "Missing user message" },
        400
      );
    }

    if (isRecentOrderSummaryEmailRequest(latestUserMessage.content)) {
      return jsonResponse(await sendRecentOrderSummaryEmail(req));
    }

    if (isOrderAuthRequest(latestUserMessage.content)) {
      return jsonResponse(await getOrderAuthResponse(req));
    }

    const intent = getChatIntent(latestUserMessage.content);
    if (intent === "email_order_summary") {
      return jsonResponse(
        await sendOrderSummaryEmail(req, latestUserMessage.content)
      );
    }

    // Reject unrelated questions locally so they do not spend OpenAI tokens.
    if (
      !forceAi &&
      !isPlatformQuestion(latestUserMessage.content, body.pageContext)
    ) {
      return jsonResponse({
        success: true,
        reply: OUT_OF_SCOPE_REPLY,
        source: "scope_guard",
      });
    }

    // Return known FAQ answers locally before using the OpenAI API.
    const faqMatch = forceAi ? null : findFaqAnswer(latestUserMessage.content);
    if (faqMatch) {
      return jsonResponse({
        success: true,
        reply: faqMatch.answer,
        source: "faq",
        faqId: faqMatch.id,
      });
    }

    // OpenAI is only required after local answers are exhausted.
    const apiKey = Deno.env.get("OPENAI_API_KEY");
    if (!apiKey) {
      return jsonResponse(
        {
          success: false,
          error: "OPENAI_API_KEY is not configured",
        },
        500
      );
    }

    const model = Deno.env.get("OPENAI_MODEL") || DEFAULT_MODEL;
    const instructions = getSiteInstructions(body.pageContext);
    let { response: openAiResponse, data } = await requestOpenAi(
      apiKey,
      model,
      instructions,
      messages,
      OPENAI_MAX_OUTPUT_TOKENS
    );

    if (!openAiResponse.ok) {
      const requestId = openAiResponse.headers.get("x-request-id");
      const message = getOpenAiError(
        data,
        `OpenAI request failed with status ${openAiResponse.status}`
      );
      console.error("OpenAI request failed", {
        status: openAiResponse.status,
        requestId,
        error: data,
      });
      return jsonResponse(
        {
          success: false,
          error: message,
          upstreamStatus: openAiResponse.status,
          requestId,
        },
        502
      );
    }

    let requestId = openAiResponse.headers.get("x-request-id");
    let reply = extractText(data);
    if (!reply && isMaxOutputTokenIncomplete(data)) {
      console.warn("Retrying OpenAI request after max_output_tokens", {
        requestId,
      });
      const retry = await requestOpenAi(
        apiKey,
        model,
        instructions,
        messages,
        OPENAI_RETRY_MAX_OUTPUT_TOKENS
      );
      openAiResponse = retry.response;
      data = retry.data;
      requestId = openAiResponse.headers.get("x-request-id");
      if (!openAiResponse.ok) {
        const message = getOpenAiError(
          data,
          `OpenAI retry failed with status ${openAiResponse.status}`
        );
        console.error("OpenAI retry failed", {
          status: openAiResponse.status,
          requestId,
          error: data,
        });
        return jsonResponse(
          {
            success: false,
            error: message,
            upstreamStatus: openAiResponse.status,
            requestId,
          },
          502
        );
      }
      reply = extractText(data);
    }

    if (!reply) {
      const debugMessage = getOpenAiEmptyReplyDebug(data, requestId);
      console.error("OpenAI returned no readable text", {
        requestId,
        response: data,
      });
      return jsonResponse({
        success: true,
        reply:
          "I could not generate a reliable answer from the available ReShareLoop information. Please ask about shopping, renting, selling, returns, orders, or account help, or contact support for account-specific issues.",
        source: "openai_empty",
        debug: debugMessage,
        requestId,
      });
    }

    return jsonResponse({ success: true, reply, source: "openai" });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("aiChat failed:", message);
    return jsonResponse({ success: false, error: message }, 500);
  }
});
