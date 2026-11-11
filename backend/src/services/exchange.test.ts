import { describe, it, expect, vi, afterEach } from "vitest";
import { convertedAmount, exchangeQuote } from "./exchange";
describe("exchange reference and exact minor units", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("rounds half up deterministically for zero, two, three and four decimals", () => {
    expect(convertedAmount("1", "1.005", "USD")).toBe("1.01");
    expect(convertedAmount("10", "1.25", "JPY")).toBe("13");
    expect(convertedAmount("1", "1.2345", "BHD")).toBe("1.235");
  });
  it.each([
    [0, 1],
    [-1, 1],
    [1, 0],
    [1, Infinity],
    [1e12, 1],
    [1, 1e12],
  ])("rejects invalid values %s %s", (a, r) =>
    expect(() => convertedAmount(a, r, "USD")).toThrow(),
  );
  it("rejects unsupported currencies and rounds-to-zero", () => {
    expect(() => convertedAmount(1, 1, "XXX")).toThrow();
    expect(() => convertedAmount("0.01", "0.01", "JPY")).toThrow();
  });
  it("sends only currency/date and retains actual effective date", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({
            base: "EUR",
            quote: "USD",
            rate: 1.1234,
            date: "2026-11-06",
          }),
        ),
      );
    vi.stubGlobal("fetch", fetcher);
    const quote = await exchangeQuote("EUR", "USD", "2026-11-08");
    expect(quote.date).toBe("2026-11-06");
    expect(fetcher.mock.calls[0][0]).toBe(
      "https://api.frankfurter.dev/v2/rate/eur/usd?date=2026-11-08",
    );
  });
  it("does not substitute invented rates on provider failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(Error("network")));
    await expect(exchangeQuote("GBP", "INR", "2026-11-09")).rejects.toThrow(
      "unavailable",
    );
  });
  it("rejects spoofed pair responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(
            JSON.stringify({
              base: "USD",
              quote: "INR",
              rate: 10,
              date: "2026-11-09",
            }),
          ),
        ),
    );
    await expect(exchangeQuote("GBP", "USD", "2026-11-09")).rejects.toThrow(
      "Invalid reference",
    );
  });
});
