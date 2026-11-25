import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";

const nav = vi.hoisted(() => ({ query: "" }));

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(nav.query),
}));
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));

import VerifyEmailPage from "@/app/(auth)/verify-email/page";

describe("verify-email page", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows the missing-token error without calling the API", async () => {
    nav.query = "";
    render(<VerifyEmailPage />);

    expect(await screen.findByRole("heading", { name: "verificationFailed" })).toBeTruthy();
    expect(screen.getByText("missingToken")).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("shows success for a valid token", async () => {
    nav.query = "token=good";
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ message: "Verified!" }) });
    render(<VerifyEmailPage />);

    expect(screen.getByText("verifyingEmail")).toBeTruthy();
    expect(await screen.findByRole("heading", { name: "verificationSuccess" })).toBeTruthy();
    expect(screen.getByText("Verified!")).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith("/api/auth/verify-email?token=good");
  });

  it("shows the API error for an invalid token", async () => {
    nav.query = "token=bad";
    fetchMock.mockResolvedValue({ ok: false, json: async () => ({ error: "Invalid token" }) });
    render(<VerifyEmailPage />);

    expect(await screen.findByRole("heading", { name: "verificationFailed" })).toBeTruthy();
    expect(screen.getByText("Invalid token")).toBeTruthy();
  });

  it("falls back to the default texts when the API sends none", async () => {
    nav.query = "token=bad";
    fetchMock.mockResolvedValue({ ok: false, json: async () => ({}) });
    render(<VerifyEmailPage />);

    await waitFor(() => expect(screen.getByText("verificationErrorDefault")).toBeTruthy());
  });

  it("shows the network error when the request fails", async () => {
    nav.query = "token=any";
    fetchMock.mockRejectedValue(new Error("offline"));
    render(<VerifyEmailPage />);

    await waitFor(() => expect(screen.getByText("networkError")).toBeTruthy());
  });
});
