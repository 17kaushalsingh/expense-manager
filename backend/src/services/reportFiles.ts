import path from "node:path";
import { FinanceReport } from "./reports";
export async function reportExcel(report: FinanceReport) {
  const { default: writeXlsxFile } = await import("write-excel-file/node");
  const text = (value: string) => ({ type: String, value }),
    number = (value: number) => ({
      type: Number,
      value,
      format: "#,##0.00;[Red]-#,##0.00",
    });
  const header = (values: string[]) =>
    values.map((value) => ({
      value,
      type: String,
      fontWeight: "bold" as const,
      backgroundColor: "#E9EEE8",
    }));
  const buffer = await writeXlsxFile([
    {
      sheet: "Summary",
      data: [
        header(["LedgerSync financial report", "Value"]),
        [text("From"), text(report.fromDate)],
        [text("Through"), text(report.toDate)],
        [text("Timezone"), text(report.timezone)],
        [text("Currency"), text(report.currency)],
        [text("Income"), number(report.income)],
        [text("Personal expenses"), number(report.expense)],
        [text("Saved"), number(report.saving)],
        [
          text("Savings rate (%)"),
          report.savingRate === null
            ? text("No income recorded")
            : number(report.savingRate),
        ],
      ],
      columns: [{ width: 28 }, { width: 30 }],
    },
    {
      sheet: "Transactions",
      data: [
        header([
          "ID",
          "UTC timestamp",
          "Type",
          "Account",
          "Category",
          "Currency",
          "Amount",
          "Balance change",
          "Personal income/expense",
          "Source",
          "Notes",
          "Labels",
        ]),
        ...report.transactions.map((t) => [
          text(t.id),
          text(t.date),
          text(t.type),
          text(t.account),
          text(t.category),
          text(report.currency),
          number(t.amount),
          number(t.balanceDelta),
          number(t.analyticsAmount),
          text(t.source),
          text(t.notes),
          text(t.labels),
        ]),
      ],
      columns: [
        { width: 38 },
        { width: 28 },
        { width: 14 },
        { width: 24 },
        { width: 24 },
        { width: 12 },
        { width: 16 },
        { width: 18 },
        { width: 24 },
        { width: 20 },
        { width: 50 },
        { width: 30 },
      ],
    },
    {
      sheet: "Categories",
      data: [
        header(["Category", "Personal expense"]),
        ...report.categories.map((c) => [text(c.name), number(c.amount)]),
      ],
      columns: [{ width: 36 }, { width: 24 }],
    },
    {
      sheet: "Daily",
      data: [
        header([
          `Local date (${report.timezone})`,
          "Income",
          "Personal expense",
        ]),
        ...report.days.map((d) => [
          text(d.date),
          number(d.income),
          number(d.expense),
        ]),
      ],
      columns: [{ width: 36 }, { width: 22 }, { width: 22 }],
    },
  ]).toBuffer();
  return buffer;
}
export async function reportPdf(report: FinanceReport): Promise<Buffer> {
  const { default: PDFDocument } = await import("pdfkit");
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
        size: "A4",
        margin: 48,
        bufferPages: true,
        info: { Title: "LedgerSync financial report", Author: "LedgerSync" },
      }),
      chunks: Buffer[] = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("error", reject);
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.registerFont(
      "Noto",
      path.resolve(__dirname, "../../assets/fonts/NotoSans-Regular.ttf"),
    );
    doc.registerFont(
      "Devanagari",
      path.resolve(
        __dirname,
        "../../assets/fonts/NotoSansDevanagari-Regular.ttf",
      ),
    );
    const font = (text: string) =>
      doc.font(/\p{Script=Devanagari}/u.test(text) ? "Devanagari" : "Noto");
    const amount = (n: number) =>
      `${report.currency} ${new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)}`;
    const ensure = (height: number) => {
      if (doc.y + height > doc.page.height - 90) {
        doc.addPage();
        doc
          .fillColor("#607065")
          .font("Noto")
          .fontSize(9)
          .text("LEDGERSYNC  /  FINANCIAL REPORT")
          .moveDown();
      }
    };
    const row = (label: string, value: string) => {
      label = label.slice(0, 180);
      font(label).fontSize(10);
      const labelHeight = doc.heightOfString(label, { width: 320 });
      const valueHeight = doc
        .font("Noto")
        .heightOfString(value, { width: 165 });
      const height = Math.max(16, labelHeight, valueHeight) + 10;
      ensure(height);
      const y = doc.y;
      doc.fillColor("#26352C");
      font(label).fontSize(10).text(label, 48, y, { width: 320 });
      doc.font("Noto").text(value, 380, y, { width: 165, align: "right" });
      doc.y = y + height;
      doc.x = 48;
    };
    doc
      .font("Noto")
      .fillColor("#3C6350")
      .fontSize(11)
      .text("LEDGERSYNC")
      .moveDown(0.8);
    doc.fillColor("#1C2B22").fontSize(28).text("Your money, in view.");
    doc
      .fontSize(11)
      .fillColor("#607065")
      .text(`${report.fromDate} through ${report.toDate}`)
      .text(`${report.currency} | ${report.timezone}`)
      .moveDown(1.6);
    row("Income", amount(report.income));
    row("Personal expenses", amount(report.expense));
    row("Saved", amount(report.saving));
    row(
      "Savings rate",
      report.savingRate === null
        ? "No income recorded"
        : `${report.savingRate.toFixed(1)}%`,
    );
    doc.moveDown();
    doc
      .font("Noto")
      .fontSize(9)
      .fillColor("#607065")
      .text(
        "Personal expense shares count once. Transfers, settlements and loan principal are excluded. This report summarizes your recorded data.",
        { width: 490 },
      )
      .moveDown(1.3);
    ensure(50);
    doc
      .fontSize(15)
      .fillColor("#1C2B22")
      .text("Spending by category")
      .moveDown(0.6);
    if (!report.categories.length)
      doc
        .fontSize(10)
        .fillColor("#607065")
        .text("No personal expenses in this period.");
    for (const c of report.categories) row(c.name, amount(c.amount));
    doc.moveDown();
    ensure(50);
    doc
      .font("Noto")
      .fontSize(15)
      .fillColor("#1C2B22")
      .text("Daily activity")
      .moveDown(0.6);
    if (!report.days.length)
      doc.fontSize(10).text("No entries in this period.");
    for (const d of report.days)
      row(d.date, `${amount(d.income)} / ${amount(d.expense)}`);
    const pages = doc.bufferedPageRange();
    for (let i = pages.start; i < pages.start + pages.count; i++) {
      doc.switchToPage(i);
      doc
        .font("Noto")
        .fontSize(8)
        .fillColor("#607065")
        .text(
          `LedgerSync | Income / expense on daily rows | ${i + 1} of ${pages.count}`,
          48,
          doc.page.height - 60,
          { width: 499, align: "center", lineBreak: false },
        );
    }
    doc.end();
  });
}
