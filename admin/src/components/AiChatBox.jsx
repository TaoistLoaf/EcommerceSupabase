import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { toast } from "react-toastify";
import { supabase } from "../supabaseClient";

const starterPrompts = [
  "How do I add a product?",
  "How do I manage orders?",
  "How do I update inventory?",
];

const CLIENT_MESSAGE_LIMIT = 12;
const SHOW_CHAT_DEBUG = import.meta.env.DEV;

const initialMessages = [
  {
    role: "assistant",
    content:
      "Hi, I can help with ReShareLoop admin tasks, orders, inventory, seller setup, and account questions.",
  },
];

const formatFunctionError = (payload) => {
  if (!payload || typeof payload !== "object") return "";

  const details = [
    payload.upstreamStatus ? `Upstream status: ${payload.upstreamStatus}` : "",
    payload.requestId ? `Request ID: ${payload.requestId}` : "",
  ]
    .filter(Boolean)
    .join(" ");

  return `${payload.error || payload.message || ""}${
    details ? ` ${details}` : ""
  }`.trim();
};

const getFunctionErrorMessage = async (error) => {
  const response = error?.context;
  if (response && typeof response.json === "function") {
    const payload = await response.json().catch(() => null);
    const message = formatFunctionError(payload);
    if (message) return message;
  }

  return error instanceof Error ? error.message : "AI chat is unavailable.";
};

const formatChatDebug = (payload) => {
  if (!SHOW_CHAT_DEBUG || (!payload?.debug && !payload?.requestId)) return "";

  const details = [
    payload.debug,
    payload.requestId ? `Request ID: ${payload.requestId}` : "",
  ]
    .filter(Boolean)
    .join(" ");

  return details ? `\n\nDebug: ${details}` : "";
};

const getAdminSection = (pathname) => {
  const match = pathname.match(/^\/admin\/[^/]+\/([^/]+)/);
  return match?.[1] || "dashboard";
};

const AiChatBox = () => {
  const location = useLocation();
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState(initialMessages);
  const [draft, setDraft] = useState("");
  const [isSending, setIsSending] = useState(false);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isSending]);

  // Send only lightweight admin context; private order data stays server-side.
  const pageContext = useMemo(
    () => ({
      page: "admin",
      section: getAdminSection(location.pathname),
      path: location.pathname,
      signedIn: true,
      userRole: "seller",
    }),
    [location.pathname]
  );

  const sendMessage = async (content, options = {}) => {
    const text = content.trim();
    if (!text || isSending) return;

    const nextMessages = options.skipUserMessage
      ? messages
      : [...messages, { role: "user", content: text }];
    setMessages(nextMessages);
    setDraft("");
    setIsSending(true);

    try {
      const { data, error } = await supabase.functions.invoke("aiChat", {
        body: {
          messages: nextMessages.slice(-CLIENT_MESSAGE_LIMIT),
          pageContext,
          forceAi: options.forceAi === true,
          responseMode: options.forceAi ? "ai" : "auto",
        },
      });

      if (error) {
        throw new Error(await getFunctionErrorMessage(error));
      }
      if (data?.success === false) {
        const details = data.requestId ? ` Request ID: ${data.requestId}` : "";
        throw new Error(
          `${data.error || "Unable to get an AI response."}${details}`
        );
      }

      const debugDetails = formatChatDebug(data);
      setMessages((current) => [
        ...current,
        {
          role: "assistant",
          content:
            `${
              data?.reply ||
              "I could not generate a response. Please try again."
            }${debugDetails}`,
          canAskAi:
            !options.forceAi &&
            (data?.source === "faq" || data?.source === "scope_guard"),
          originalQuestion: text,
        },
      ]);
    } catch (error) {
      const message = await getFunctionErrorMessage(error);
      toast.error(message);
      setMessages((current) => [
        ...current,
        {
          role: "assistant",
          content: message,
        },
      ]);
    } finally {
      setIsSending(false);
    }
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    sendMessage(draft);
  };

  return (
    <div className="fixed bottom-5 right-4 z-50 sm:right-6">
      {isOpen && (
        <section className="mb-3 flex h-[min(620px,calc(100vh-120px))] w-[calc(100vw-32px)] max-w-[380px] flex-col overflow-hidden border border-gray-200 bg-white shadow-2xl">
          <div className="flex items-center justify-between border-b bg-black px-4 py-3 text-white">
            <div>
              <h2 className="text-sm font-semibold">Admin Assistant</h2>
              <p className="text-xs text-gray-300">
                AI help for seller dashboard tasks
              </p>
            </div>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="flex h-8 w-8 items-center justify-center border border-white/30 text-lg leading-none hover:bg-white hover:text-black"
              aria-label="Close AI chat"
            >
              x
            </button>
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto bg-gray-50 px-4 py-4">
            {messages.map((message, index) => (
              <div
                key={`${message.role}-${index}`}
                className={`flex ${
                  message.role === "user" ? "justify-end" : "justify-start"
                }`}
              >
                <div
                  className={`max-w-[82%] ${
                    message.role === "user" ? "items-end" : "items-start"
                  } flex flex-col gap-2`}
                >
                  <p
                    className={`whitespace-pre-wrap rounded-sm px-3 py-2 text-sm leading-5 ${
                      message.role === "user"
                        ? "bg-black text-white"
                        : "border border-gray-200 bg-white text-gray-700"
                    }`}
                  >
                    {message.content}
                  </p>
                  {message.canAskAi && (
                    <button
                      type="button"
                      onClick={() =>
                        sendMessage(message.originalQuestion, {
                          forceAi: true,
                          skipUserMessage: true,
                        })
                      }
                      disabled={isSending}
                      className="self-start border border-gray-300 bg-white px-2 py-1 text-xs text-gray-700 hover:border-black disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Need more deep responses
                    </button>
                  )}
                </div>
              </div>
            ))}
            {isSending && (
              <div className="flex justify-start">
                <p className="border border-gray-200 bg-white px-3 py-2 text-sm text-gray-500">
                  Thinking...
                </p>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          <div className="border-t bg-white p-3">
            <div className="mb-3 flex flex-wrap gap-2">
              {starterPrompts.map((prompt) => (
                <button
                  type="button"
                  key={prompt}
                  onClick={() => sendMessage(prompt)}
                  disabled={isSending}
                  className="border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:border-black disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {prompt}
                </button>
              ))}
            </div>
            <form onSubmit={handleSubmit} className="flex gap-2">
              <textarea
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    handleSubmit(event);
                  }
                }}
                placeholder="Ask a question..."
                rows={2}
                className="min-h-[44px] flex-1 resize-none border border-gray-300 px-3 py-2 text-sm outline-none focus:border-black"
              />
              <button
                type="submit"
                disabled={!draft.trim() || isSending}
                className="w-16 bg-black text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-gray-300"
              >
                Send
              </button>
            </form>
          </div>
        </section>
      )}

      <button
        type="button"
        onClick={() => setIsOpen((value) => !value)}
        className="flex h-14 w-14 items-center justify-center rounded-full bg-black text-sm font-semibold text-white shadow-xl hover:bg-gray-800"
        aria-label={isOpen ? "Hide AI chat" : "Open AI chat"}
      >
        AI
      </button>
    </div>
  );
};

export default AiChatBox;
