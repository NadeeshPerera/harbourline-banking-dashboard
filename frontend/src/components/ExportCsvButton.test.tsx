import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/api/client";
import { DemoBankApi } from "@/api/demo/demoApi";
import { DEMO_USER } from "@/api/demo/seed";
import { AuthProvider } from "@/auth/AuthProvider";
import type { TransactionFilters } from "@/lib/types";
import { ExportCsvButton } from "./ExportCsvButton";

function setup(filters: TransactionFilters = {}, total: number | undefined = 42) {
  sessionStorage.setItem("harbourline.session", JSON.stringify({ token: "demo-session", user: DEMO_USER }));
  const api = new DemoBankApi(() => "demo-session", { latencyMs: 0, now: () => new Date("2026-11-15T04:00:00Z") });
  const spy = vi.spyOn(api, "exportTransactions");
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <AuthProvider api={api}>
      <QueryClientProvider client={client}>
        <ExportCsvButton filters={filters} total={total} />
      </QueryClientProvider>
    </AuthProvider>,
  );
  return { spy, user: userEvent.setup() };
}

describe("<ExportCsvButton />", () => {
  let clicked: HTMLAnchorElement[];

  beforeEach(() => {
    clicked = [];
    // jsdom has no object URLs or real downloads; record what would be saved.
    URL.createObjectURL = vi.fn(() => "blob:csv");
    URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      clicked.push(this);
    });
  });
  afterEach(() => vi.restoreAllMocks());

  it("exports the current filters and announces the download", async () => {
    const filters = { category: "dining", q: "kopi" } as const;
    const { spy, user } = setup(filters);

    await user.click(screen.getByRole("button", { name: "Export CSV" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Downloaded harbourline-transactions-2026-11-15.csv");
    expect(spy).toHaveBeenCalledWith(filters);
    expect(clicked).toHaveLength(1);
    expect(clicked[0].download).toBe("harbourline-transactions-2026-11-15.csv");
    expect(clicked[0].href).toBe("blob:csv");

    const blob = vi.mocked(URL.createObjectURL).mock.calls[0][0] as Blob;
    expect(blob.type).toBe("text/csv;charset=utf-8");
    // jsdom's Blob has no .text()/.arrayBuffer(); FileReader works everywhere.
    const bytes = await new Promise<Uint8Array>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
      reader.readAsArrayBuffer(blob);
    });
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]); // UTF-8 BOM for Excel
    const text = new TextDecoder().decode(bytes); // strips the BOM
    expect(text.split("\r\n")[0]).toBe("Date (SGT),Description,Reference,Category,Account,Amount (SGD),Balance (SGD)");
  });

  it("is disabled when there is nothing to export", () => {
    setup({}, 0);
    expect(screen.getByRole("button", { name: "Export CSV" })).toBeDisabled();
  });

  it("shows the server's error", async () => {
    const { spy, user } = setup();
    spy.mockRejectedValueOnce(new ApiError(400, "Validation failed", "Unknown category 'crypto'."));

    await user.click(screen.getByRole("button", { name: "Export CSV" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Unknown category 'crypto'.");
    expect(clicked).toHaveLength(0);
  });
});
