import Capacitor
public final class LedgerViewController: CAPBridgeViewController {
    override public func capacitorDidLoad() { bridge?.registerPluginInstance(LedgerWidgetPlugin()) }
}
