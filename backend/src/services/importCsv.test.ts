import { describe, expect, it } from "vitest";
import { parseCsv, prepareImport, parseImportDate } from "./importCsv";
const options = { delimiter: ",", dateFormat: "ISO" as const, decimalSeparator: "." as const, defaultType: "SIGNED" as const, account: { name: "Cash", currency: "USD" }, categories: [{ id: "food", name: "Food", type: "EXPENSE" }] };
describe("CSV import parsing and review", () => {
  it("handles BOM, escaped quotes, quoted commas/newlines, CRLF, and trailing empty lines", () => {
    const data = parseCsv('\uFEFFDate,Amount,Notes\r\n2026-11-05,-12.50,"A, B\nsaid ""hello"""\r\n\r\n');
    expect(data.records).toEqual([["2026-11-05", "-12.50", 'A, B\nsaid "hello"']]);
  });
  it("maps signed amounts and known categories without executing spreadsheet formulas", () => {
    const result = prepareImport('Date,Amount,Category,Notes\n2026-11-05,-12.50,Food,=1+1\n2026-11-06,15,,Wages', options);
    expect(result.rows[0].data).toMatchObject({ type: "EXPENSE", amount: 12.5, categoryId: "food", localDate: "2026-11-05", notes: "=1+1" });
    expect(result.rows[1].data?.type).toBe("INCOME");
  });
  it("supports explicit column mapping, decimal commas and DMY dates", () => {
    const result = prepareImport('When;Value;Details\n05/11/2026;"12,50";Tea', { ...options, delimiter: ";", dateFormat: "DMY", decimalSeparator: ",", defaultType: "EXPENSE", mapping: { date: "When", amount: "Value", notes: "Details" } });
    expect(result.rows[0].data).toMatchObject({ amount: 12.5, type: "EXPENSE", localDate: "2026-11-05" });
  });
  it.each(["2026-02-30", "02/03/2026", "2026-11-05T12:00:00", "not a date"])("rejects ambiguous or invalid ISO date %s", value => expect(() => parseImportDate(value, "ISO")).toThrow());
  it("preserves timestamp instants and supports leap days", () => {
    expect(parseImportDate("2024-02-29", "ISO")).toEqual({ localDate: "2024-02-29" });
    expect(parseImportDate("2026-11-05T00:00:00+05:30", "ISO")).toEqual({ dateTime: "2026-11-04T18:30:00.000Z" });
  });
  it.each(['Date,Amount\n"2026-11-05,1', 'Date,Date\n2026-11-05,1', 'Date,Amount\n2026-11-05,"1"bad'])("rejects malformed CSV %s", value => expect(() => parseCsv(value)).toThrow());
  it("rejects oversized or overlong batches", () => {
    expect(() => parseCsv("x".repeat(200001))).toThrow();
    expect(() => parseCsv("Date,Amount\n" + "2026-11-05,1\n".repeat(501))).toThrow();
  });
  it.each([
    "Date,Amount,Currency\n2026-11-05,1,EUR",
    "Date,Amount,Source\n2026-11-05,1,SETTLEMENT",
    "Date,Amount,Type\n2026-11-05,1,TRANSFER",
    "Date,Amount,Account\n2026-11-05,1,Other",
    "Date,Amount,Category\n2026-11-05,-1,Missing",
    "Date,Amount\n2026-11-05,0",
    "Date,Amount\n2026-11-05,1.001",
  ])("reports row errors for invalid or incompatible content %s", value => {
    const result = prepareImport(value, options);
    expect(result.rows[0].error).toBeTruthy(); expect(result.rows[0].data).toBeUndefined();
  });
});
