export const getFunctionErrorMessage = async (error, fallbackMessage) => {
  const response = error?.context;
  if (response && typeof response.clone === "function") {
    try {
      const body = await response.clone().json();
      const message = body?.error || body?.message;
      if (typeof message === "string" && message.trim()) return message;
    } catch {
      // The response was not JSON; use the client error below.
    }
  }

  return error?.message || fallbackMessage;
};
