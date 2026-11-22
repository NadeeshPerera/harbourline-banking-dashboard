import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DemoBankApi } from "@/api/demo/demoApi";
import { DEMO_USER } from "@/api/demo/seed";
import { AuthProvider } from "@/auth/AuthProvider";
import { TransferFlow } from "./TransferFlow";

function setup() {
  // Signed-in session for the demo API (no network latency in tests).
  sessionStorage.setItem("harbourline.session", JSON.stringify({ token: "demo-session", user: DEMO_USER }));
  // Fixed clock: the seeded balances depend on the date (e.g. before/after payday).
  const api = new DemoBankApi(() => "demo-session", { latencyMs: 0, now: () => new Date(2026, 10, 15, 12) });
  const spy = vi.spyOn(api, "createTransfer");
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <AuthProvider api={api}>
      <QueryClientProvider client={client}>
        <TransferFlow />
      </QueryClientProvider>
    </AuthProvider>,
  );
  return { spy, user: userEvent.setup() };
}

describe("<TransferFlow />", () => {
  beforeEach(() => sessionStorage.clear());

  it("shows validation errors before review", async () => {
    const { user } = setup();
    await user.click(await screen.findByRole("button", { name: "Review transfer" }));
    expect(await screen.findByText("Choose an account to pay from")).toBeInTheDocument();
    expect(screen.getByText("Choose who to pay")).toBeInTheDocument();
    expect(screen.getByText("Enter an amount")).toBeInTheDocument();
  });

  it("blocks amounts above the available balance", async () => {
    const { user } = setup();
    await user.selectOptions(await screen.findByLabelText("From"), "a-goal");
    await user.selectOptions(screen.getByLabelText("To"), "account:a-cur");
    await user.type(screen.getByLabelText("Amount (SGD)"), "999999");
    await user.click(screen.getByRole("button", { name: "Review transfer" }));
    expect(await screen.findByText("This is more than the available balance")).toBeInTheDocument();
  });

  it("reviews, confirms once (even on double-click) and shows a receipt", async () => {
    const { user, spy } = setup();
    await user.selectOptions(await screen.findByLabelText("From"), "a-cur");
    await user.selectOptions(screen.getByLabelText("To"), "payee:p-1");
    await user.type(screen.getByLabelText("Amount (SGD)"), "1,250.50");
    await user.type(screen.getByLabelText(/Reference/), "Dinner split");
    await user.click(screen.getByRole("button", { name: "Review transfer" }));

    expect(await screen.findByRole("heading", { name: "Review transfer" })).toBeInTheDocument();
    expect(screen.getByText("Mei Ling Wong · Harbourline Bank")).toBeInTheDocument();

    const confirm = screen.getByRole("button", { name: "Confirm and send $1,250.50" });
    await user.dblClick(confirm);

    expect(await screen.findByRole("heading", { name: "Transfer complete" })).toBeInTheDocument();
    expect(screen.getByText("to Mei Ling Wong")).toBeInTheDocument();

    // The button disables while sending, and every call reuses one idempotency key.
    const keys = new Set(spy.mock.calls.map(([, key]) => key));
    expect(keys.size).toBe(1);
    expect(spy.mock.calls[0][0]).toEqual({
      fromAccountId: "a-cur",
      to: { type: "payee", payeeId: "p-1" },
      amountCents: 125_050,
      reference: "Dinner split",
    });
  });

  it("shows the server's error, for example the daily limit", async () => {
    const { user } = setup();
    await user.selectOptions(await screen.findByLabelText("From"), "a-sav");
    await user.selectOptions(screen.getByLabelText("To"), "payee:p-2");
    await user.type(screen.getByLabelText("Amount (SGD)"), "5000.01");
    await user.click(screen.getByRole("button", { name: "Review transfer" }));
    await user.click(await screen.findByRole("button", { name: /Confirm and send/ }));

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Daily limit exceeded"));
  });
});
