import React from "react";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Sidebar from "~/components/Sidebar";
// Mock assets to avoid loading actual image files
jest.mock("~/assets/assets", () => ({
  assets: {
    add_icon: "add-icon.png",
    order_icon: "order-icon.png",
  },
}));

describe("Sidebar", () => {
  const sellerId = "seller-123";

  test("renders all navigation links with correct text", () => {
    render(
      <MemoryRouter>
        <Sidebar sellerId={sellerId} />
      </MemoryRouter>
    );

    expect(screen.getByText("Add Sell Item")).toBeInTheDocument();
    expect(screen.getByText("Sell Item List")).toBeInTheDocument();
    expect(screen.getByText("Add Lend Item")).toBeInTheDocument();
    expect(screen.getByText("Lend Item List")).toBeInTheDocument();
    expect(screen.getByText("Orders")).toBeInTheDocument();
    expect(screen.getByText("Inventory")).toBeInTheDocument();
    expect(screen.getByText("Edit Banner")).toBeInTheDocument();
    expect(screen.getByText("Edit Store Info")).toBeInTheDocument();

    // Verify link count
    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(8);
  });

  test("each NavLink points to the correct route", () => {
    render(
      <MemoryRouter>
        <Sidebar sellerId={sellerId} />
      </MemoryRouter>
    );

    const links = screen.getAllByRole("link");
    expect(links[0]).toHaveAttribute("href", `/admin/${sellerId}/add-sell`);
    expect(links[1]).toHaveAttribute("href", `/admin/${sellerId}/list`);
    expect(links[2]).toHaveAttribute("href", `/admin/${sellerId}/add-lend`);
    expect(links[3]).toHaveAttribute("href", `/admin/${sellerId}/lend-list`);
    expect(links[4]).toHaveAttribute("href", `/admin/${sellerId}/orders`);
  });

  test("renders correct icons with accessible alt text", () => {
    render(
      <MemoryRouter>
        <Sidebar sellerId={sellerId} />
      </MemoryRouter>
    );

    // Find all images by their alt text
    const addIcon = screen.getByAltText("add_icon");
    const orderIcon = screen.getByAltText("order_icon");

    expect(addIcon).toHaveAttribute("src", "add-icon.png");
    expect(orderIcon).toHaveAttribute("src", "order-icon.png");
  });

  test("orders link includes the current seller id", () => {
    render(
      <MemoryRouter initialEntries={["/"]}>
        <Sidebar sellerId={sellerId} />
      </MemoryRouter>
    );

    const ordersLink = screen.getByText("Orders");
    expect(ordersLink.closest("a")).toHaveAttribute(
      "href",
      `/admin/${sellerId}/orders`
    );
  });
});
