import UIKit
import Capacitor

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }

        window = UIWindow(windowScene: windowScene)
        window?.rootViewController = LedgerViewController()
        window?.makeKeyAndVisible()

        SceneDelegateProxy.shared.scene(scene, willConnectTo: session, options: connectionOptions)
    }

    func sceneWillResignActive(_ scene: UIScene) {
        LedgerWidgetPlugin.clearSnapshot()
        if let controller = window?.rootViewController as? LedgerViewController {
            controller.webView?.evaluateJavaScript("window.dispatchEvent(new Event('ledgersync-native-lock'))", completionHandler: nil)
        }
        let cover = UIView(frame: window?.bounds ?? .zero); cover.tag = 93615; cover.backgroundColor = .systemBackground; window?.addSubview(cover)
    }
    func sceneDidBecomeActive(_ scene: UIScene) { window?.viewWithTag(93615)?.removeFromSuperview() }
    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        SceneDelegateProxy.shared.scene(scene, openURLContexts: URLContexts)
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        SceneDelegateProxy.shared.scene(scene, continue: userActivity)
    }
}
