import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";

jest.mock("~/supabaseClient", () => ({
  supabase: {
    auth: {
      getSession: jest.fn().mockResolvedValue({ data: { session: null } }),
      signInWithPassword: jest.fn(),
      signUp: jest.fn(),
      signInWithOAuth: jest.fn(),
      resetPasswordForEmail: jest.fn(),
    },
    from: jest.fn(),
    functions: { invoke: jest.fn() },
  },
}));

jest.mock("react-toastify", () => ({
  toast: { error: jest.fn(), success: jest.fn(), info: jest.fn() },
}));

import Login from "~/components/Login";
import { supabase } from "~/supabaseClient";
import { toast } from "react-toastify";

describe("Login", () => {
  const renderLogin = () => {
    const setToken = jest.fn();
    render(
      <MemoryRouter>
        <Login setToken={setToken} />
      </MemoryRouter>
    );
    return { setToken };
  };

  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    supabase.auth.getSession.mockResolvedValue({ data: { session: null } });
  });

  test("renders the current seller login form", () => {
    renderLogin();
    expect(screen.getByRole("heading", { name: /admin panel/i })).toBeInTheDocument();
    expect(screen.getByPlaceholderText("your@email.com")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Enter your password")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /login with email/i })).toBeInTheDocument();
  });

  test("authenticates with Supabase and stores the returned session", async () => {
    const user = userEvent.setup();
    const { setToken } = renderLogin();
    supabase.auth.signInWithPassword.mockResolvedValue({
      data: { session: { access_token: "session-token", user: { id: "seller-1" } } },
      error: null,
    });

    await user.type(screen.getByPlaceholderText("your@email.com"), "seller@example.com");
    await user.type(screen.getByPlaceholderText("Enter your password"), "secret123");
    await user.click(screen.getByRole("button", { name: /login with email/i }));

    expect(supabase.auth.signInWithPassword).toHaveBeenCalledWith({
      email: "seller@example.com",
      password: "secret123",
    });
    expect(setToken).toHaveBeenCalledWith("session-token");
    expect(localStorage.getItem("user_id")).toBe("seller-1");
    expect(toast.success).toHaveBeenCalledWith("Login successful!");
  });

  test("keeps the user logged out when Supabase rejects credentials", async () => {
    const user = userEvent.setup();
    const { setToken } = renderLogin();
    supabase.auth.signInWithPassword.mockResolvedValue({
      data: { session: null },
      error: new Error("Invalid credentials"),
    });

    await user.type(screen.getByPlaceholderText("your@email.com"), "seller@example.com");
    await user.type(screen.getByPlaceholderText("Enter your password"), "wrong-password");
    await user.click(screen.getByRole("button", { name: /login with email/i }));

    expect(setToken).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith("Invalid credentials");
  });
});
