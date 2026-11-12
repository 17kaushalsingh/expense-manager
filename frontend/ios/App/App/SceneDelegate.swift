import UIKit
import Capacitor

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?
    private var privacyEpoch = 0

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }

        window = UIWindow(windowScene: windowScene)
        window?.rootViewController = LedgerViewController()
        window?.makeKeyAndVisible()

        SceneDelegateProxy.shared.scene(scene, willConnectTo: session, options: connectionOptions)
    }

    func sceneWillResignActive(_ scene: UIScene) {
        privacyEpoch += 1
        LedgerWidgetPlugin.clearSnapshot()
        if let controller = window?.rootViewController as? LedgerViewController {
            controller.webView?.evaluateJavaScript("window.dispatchEvent(new Event('ledgersync-native-lock'))", completionHandler: nil)
        }
        let cover = UIView(frame: window?.bounds ?? .zero); cover.tag = 93615; cover.backgroundColor = .systemBackground; window?.addSubview(cover)
    }
    func sceneDidBecomeActive(_ scene: UIScene) {
        let epoch = privacyEpoch
        guard let controller = window?.rootViewController as? LedgerViewController else { return }
        controller.webView?.callAsyncJavaScript("window.dispatchEvent(new Event('ledgersync-native-lock')); await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));", arguments: [:], in: nil, in: .page) { [weak self] _ in
            guard let self = self, self.privacyEpoch == epoch, UIApplication.shared.applicationState == .active else { return }
            self.window?.viewWithTag(93615)?.removeFromSuperview()
        }
    }
    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        if let url = URLContexts.first?.url, url.scheme == "ledgersync", url.host == "device", let controller = window?.rootViewController as? LedgerViewController {
            controller.webView?.load(URLRequest(url: URL(string: "capacitor://localhost/device/")!))
            return
        }
        SceneDelegateProxy.shared.scene(scene, openURLContexts: URLContexts)
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        SceneDelegateProxy.shared.scene(scene, continue: userActivity)
    }
}
