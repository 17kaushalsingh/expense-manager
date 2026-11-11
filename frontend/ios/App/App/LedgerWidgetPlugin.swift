import Foundation
import Capacitor
import WidgetKit

@objc(LedgerWidgetPlugin)
public final class LedgerWidgetPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "LedgerWidgetPlugin"
    public let jsName = "LedgerWidget"
    public let pluginMethods: [CAPPluginMethod] = [CAPPluginMethod(name: "update", returnType: CAPPluginReturnPromise), CAPPluginMethod(name: "clear", returnType: CAPPluginReturnPromise)]
    static let suite = "group.app.ledgersync.expenses"
    @objc func update(_ call: CAPPluginCall) {
        guard call.getInt("version") == 1,
              let updatedAt = call.getString("updatedAt"), let expiresAt = call.getString("expiresAt"),
              let expiry = ISO8601DateFormatter.ledger.date(from: expiresAt), expiry > Date(), expiry.timeIntervalSinceNow <= 310,
              let shared = UserDefaults(suiteName: Self.suite) else { call.reject("Invalid widget snapshot"); return }
        let show = call.getBool("showAmounts") ?? false
        var value: [String: Any] = ["version": 1, "updatedAt": updatedAt, "expiresAt": expiresAt, "showAmounts": show,
            "locale": String((call.getString("locale") ?? "en").prefix(32)), "currency": String((call.getString("currency") ?? "USD").prefix(3)),
            "pending": show ? max(0, min(10000, call.getInt("pending") ?? 0)) : 0]
        for field in ["net", "income", "expense"] { value[field] = show ? String((call.getString(field) ?? "").prefix(80)) : "••••" }
        shared.set(value, forKey: "ledgerSnapshot")
        WidgetCenter.shared.reloadAllTimelines()
        call.resolve()
    }
    @objc func clear(_ call: CAPPluginCall) { Self.clearSnapshot(); call.resolve() }
    static func clearSnapshot() { UserDefaults(suiteName: suite)?.removeObject(forKey: "ledgerSnapshot"); WidgetCenter.shared.reloadAllTimelines() }
}
extension ISO8601DateFormatter { static var ledger: ISO8601DateFormatter { let f = ISO8601DateFormatter(); f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]; return f } }
