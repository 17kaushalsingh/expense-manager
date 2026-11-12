import Foundation
import UIKit
import Capacitor

/// User-initiated export of encrypted archives only. No financial plaintext or credentials.
@objc(LedgerFilesPlugin)
public final class LedgerFilesPlugin: CAPPlugin, CAPBridgedPlugin, UIDocumentPickerDelegate {
    public let identifier = "LedgerFilesPlugin"
    public let jsName = "LedgerFiles"
    public let pluginMethods: [CAPPluginMethod] = [CAPPluginMethod(name: "saveBackup", returnType: CAPPluginReturnPromise)]
    private var pending: CAPPluginCall?
    private var temporary: URL?

    @objc func saveBackup(_ call: CAPPluginCall) {
        guard let contents = call.getString("contents"), contents.utf8.count <= 180 * 1024 * 1024,
              let data = contents.data(using: .utf8),
              let envelope = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any],
              envelope["format"] as? String == "ledgersync-vault", envelope["version"] as? Int == 1,
              envelope["ciphertext"] is String else { call.reject("Invalid encrypted backup"); return }
        DispatchQueue.main.async { [weak self] in
            guard let self = self, self.pending == nil, let controller = self.bridge?.viewController else { call.reject("Another file operation is open"); return }
            do {
                let folder = FileManager.default.temporaryDirectory.appendingPathComponent("ledgerbackup-" + UUID().uuidString, isDirectory: true)
                try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
                let file = folder.appendingPathComponent("LedgerSync.ledgerbackup")
                try data.write(to: file, options: [.atomic, .completeFileProtection])
                self.pending = call; self.temporary = folder
                let picker = UIDocumentPickerViewController(forExporting: [file], asCopy: true)
                picker.delegate = self
                controller.present(picker, animated: true)
            } catch { self.cleanup(); call.reject("Unable to prepare encrypted backup") }
        }
    }
    public func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) {
        let call = pending; cleanup(); call?.resolve()
    }
    public func documentPickerWasCancelled(_ controller: UIDocumentPickerViewController) {
        let call = pending; cleanup(); call?.reject("Backup save cancelled")
    }
    private func cleanup() {
        if let folder = temporary { try? FileManager.default.removeItem(at: folder) }
        temporary = nil; pending = nil
    }
}
