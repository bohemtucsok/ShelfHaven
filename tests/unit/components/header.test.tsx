import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";

const state = vi.hoisted(() => ({
  pathname: "/",
  session: null as null | { user: { id: string; name: string; email: string; role: string } },
}));

vi.mock("next/navigation", () => ({
  usePathname: () => state.pathname,
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
}));
vi.mock("next-auth/react", () => ({
  useSession: () => ({ data: state.session, status: state.session ? "authenticated" : "unauthenticated" }),
  signOut: vi.fn(),
}));
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "hu",
}));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));
vi.mock("next/image", () => ({
  // eslint-disable-next-line @next/next/no-img-element
  default: ({ src, alt }: { src: string; alt: string }) => <img src={src} alt={alt} />,
}));

import { Header } from "@/components/layout/Header";

function setOnline(online: boolean) {
  Object.defineProperty(window.navigator, "onLine", { configurable: true, get: () => online });
}

describe("Header", () => {
  beforeEach(() => {
    state.pathname = "/";
    state.session = null;
    setOnline(true);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => ({ notifications: [], unreadCount: 0 }) }))
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("logged out", () => {
    it("shows no offline badge while online", () => {
      render(<Header />);
      expect(screen.queryByText("offline")).toBeNull();
    });

    it("shows the offline badge when the browser starts offline", async () => {
      setOnline(false);
      render(<Header />);
      expect(await screen.findByText("offline")).toBeTruthy();
    });

    it("follows offline/online events", async () => {
      render(<Header />);
      setOnline(false);
      act(() => {
        window.dispatchEvent(new Event("offline"));
      });
      expect(await screen.findByText("offline")).toBeTruthy();

      setOnline(true);
      act(() => {
        window.dispatchEvent(new Event("online"));
      });
      await waitFor(() => expect(screen.queryByText("offline")).toBeNull());
    });

    it("closes the mobile menu when the route changes", async () => {
      const { rerender } = render(<Header />);
      const burger = screen.getByRole("button", { name: "menu" });

      fireEvent.click(burger);
      expect(burger.getAttribute("aria-expanded")).toBe("true");

      state.pathname = "/register";
      rerender(<Header />);
      await waitFor(() => expect(burger.getAttribute("aria-expanded")).toBe("false"));
    });

    it("keeps the mobile menu open while the route stays the same", () => {
      const { rerender } = render(<Header />);
      const burger = screen.getByRole("button", { name: "menu" });

      fireEvent.click(burger);
      rerender(<Header />);
      expect(burger.getAttribute("aria-expanded")).toBe("true");
    });
  });

  describe("logged in", () => {
    beforeEach(() => {
      state.session = { user: { id: "u1", name: "Teszt Elek", email: "t@example.com", role: "USER" } };
    });

    it("closes the notifications panel when the route changes", async () => {
      const { rerender } = render(<Header />);
      fireEvent.click(screen.getByRole("button", { name: "notifications" }));
      expect(await screen.findByRole("heading", { name: "notifications" })).toBeTruthy();

      state.pathname = "/library";
      rerender(<Header />);
      await waitFor(() => expect(screen.queryByRole("heading", { name: "notifications" })).toBeNull());
    });

    it("closes an open nav dropdown when the route changes", async () => {
      const { rerender } = render(<Header />);
      const trigger = screen.getAllByText("library")[0].closest("div")!;
      fireEvent.mouseEnter(trigger);
      expect(await screen.findByRole("link", { name: "shelves" })).toBeTruthy();

      state.pathname = "/shelves";
      rerender(<Header />);
      await waitFor(() => expect(screen.queryByRole("link", { name: "shelves" })).toBeNull());
    });
  });
});
