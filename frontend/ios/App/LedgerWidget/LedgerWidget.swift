import SwiftUI
import WidgetKit

struct LedgerEntry: TimelineEntry { let date: Date; let net: String; let income: String; let expense: String; let pending: Int; let visible: Bool; let expiresAt: Date }
struct LedgerProvider: TimelineProvider {
    func placeholder(in context: Context) -> LedgerEntry { hidden() }
    func getSnapshot(in context: Context, completion: @escaping (LedgerEntry) -> Void) { completion(context.isPreview ? hidden() : read()) }
    func getTimeline(in context: Context, completion: @escaping (Timeline<LedgerEntry>) -> Void) {
        let entry = read()
        completion(Timeline(entries: [entry, hidden(at: entry.expiresAt)], policy: .after(Date().addingTimeInterval(300))))
    }
    private func hidden(at date: Date = Date()) -> LedgerEntry { LedgerEntry(date: date, net: "••••", income: "••••", expense: "••••", pending: 0, visible: false, expiresAt: date.addingTimeInterval(300)) }
    private func read() -> LedgerEntry {
        guard let row = UserDefaults(suiteName: "group.app.ledgersync.expenses")?.dictionary(forKey: "ledgerSnapshot"),
              row["showAmounts"] as? Bool == true, let iso = row["expiresAt"] as? String else { return hidden() }
        let f = ISO8601DateFormatter(); f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        guard let expiry = f.date(from: iso), expiry > Date() else { return hidden() }
        return LedgerEntry(date: Date(), net: row["net"] as? String ?? "••••", income: row["income"] as? String ?? "••••", expense: row["expense"] as? String ?? "••••", pending: row["pending"] as? Int ?? 0, visible: true, expiresAt: expiry)
    }
}
struct LedgerWidgetView: View {
    let entry: LedgerEntry
    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("LedgerSync").font(.headline)
            Text(entry.net).font(.title2.bold()).privacySensitive()
            Text(entry.visible ? String(localized: "Net worth") : String(localized: "Open to unlock")).font(.caption).foregroundStyle(.secondary)
            if entry.visible && entry.pending > 0 { Text("\(entry.pending) pending").font(.caption).privacySensitive() }
            Link("Add expense", destination: URL(string: "ledgersync://device?tab=Activity")!).font(.caption.bold())
        }.frame(maxWidth: .infinity, alignment: .leading).containerBackground(.background, for: .widget)
    }
}
@main struct LedgerWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "LedgerSummary", provider: LedgerProvider()) { LedgerWidgetView(entry: $0) }
            .configurationDisplayName("LedgerSync").description("Private finance summary and a shortcut to your encrypted ledger.")
            .supportedFamilies([.systemSmall, .systemMedium])
    }
}
