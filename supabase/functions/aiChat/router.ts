export type ChatIntent =
  | "email_order_summary"
  | "general_chat";

const ORDER_WORDS = [
  "order",
  "orders",
  "purchase",
  "tracking",
  "shipment",
  "delivery",
  "订单",
  "购买",
  "物流",
  "快递",
  "配送",
];

const EMAIL_WORDS = [
  "email",
  "mail",
  "send",
  "forward",
  "inbox",
  "邮箱",
  "邮件",
  "发送",
  "发给我",
];

const includesAny = (text: string, words: string[]) =>
  words.some((word) => text.includes(word));

export const getChatIntent = (message: string): ChatIntent => {
  const normalized = message.toLowerCase();
  const mentionsOrder = includesAny(normalized, ORDER_WORDS);
  const mentionsEmail = includesAny(normalized, EMAIL_WORDS);

  if (mentionsOrder && mentionsEmail) {
    return "email_order_summary";
  }

  return "general_chat";
};
