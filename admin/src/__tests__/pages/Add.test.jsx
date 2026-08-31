import React from "react";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const mockUnsubscribe = jest.fn();
jest.mock("~/supabaseClient", () => ({
  supabase: {
    auth: {
      getSession: jest.fn(),
      onAuthStateChange: jest.fn(() => ({
        data: { subscription: { unsubscribe: mockUnsubscribe } },
      })),
    },
    from: jest.fn(),
    functions: { invoke: jest.fn() },
  },
}));

jest.mock("~/components/Navbar", () => () => <div data-testid="navbar">Navbar</div>);
jest.mock("~/components/Sidebar", () => () => <div data-testid="sidebar">Sidebar</div>);
jest.mock("~/components/Login", () => () => <div data-testid="login">Login</div>);
jest.mock("~/components/AiChatBox", () => () => <div data-testid="ai-chat">AI Chat</div>);
jest.mock("~/pages/Add", () => () => <div data-testid="add">Add page</div>);

import App from "~/App";
import { supabase } from "~/supabaseClient";

describe("App authentication boundary", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
  });

  test("shows login when there is no authenticated session", async () => {
    supabase.auth.getSession.mockResolvedValue({ data: { session: null }, error: null });
    render(
      <MemoryRouter initialEntries={["/"]}>
        <App />
      </MemoryRouter>
    );
    expect(await screen.findByTestId("login")).toBeInTheDocument();
    expect(screen.queryByTestId("navbar")).not.toBeInTheDocument();
  });

  test("renders the seller route from a valid Supabase session", async () => {
    supabase.auth.getSession.mockResolvedValue({
      data: {
        session: {
          access_token: "token-1",
          user: { id: "seller-1", email: "seller@example.com", user_metadata: {} },
        },
      },
      error: null,
    });
    render(
      <MemoryRouter initialEntries={["/admin/seller-1/add-sell"]}>
        <App />
      </MemoryRouter>
    );
    expect(await screen.findByTestId("navbar")).toBeInTheDocument();
    expect(screen.getByTestId("sidebar")).toBeInTheDocument();
    expect(screen.getByTestId("add")).toBeInTheDocument();
    expect(localStorage.getItem("token")).toBe("token-1");
  });
});
