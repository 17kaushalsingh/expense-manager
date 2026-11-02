import { describe, it, expect } from "vitest";
import { csvCell, csvDocument, escapeLike } from "./csv";
describe("safe CSV export", () => {
  it("preserves commas, quotes, Unicode, and multiline notes", () => {
    expect(csvCell('Dinner, "Asha"\n₹12')).toBe('"Dinner, ""Asha""\n₹12"');
    expect(csvDocument(["Note"], [["₹"]])).toBe('\uFEFF"Note"\r\n"₹"\r\n');
  });
  it.each(["=SUM(A1)", "+cmd", "@formula", "-formula", "  =1", "\t+1"])(
    "neutralizes formula text: %s",
    (value) => expect(csvCell(value)).toBe(`"'${value}"`),
  );
  it("keeps numeric negative values numeric and null empty", () => {
    expect(csvCell(-12.01)).toBe('"-12.01"');
    expect(csvCell(null)).toBe('""');
  });
  it("treats SQL wildcard characters as literal search text", () => {
    expect(escapeLike("50%_\\")).toBe("50\\%\\_\\\\");
  });
});
