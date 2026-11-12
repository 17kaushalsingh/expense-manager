package app.ledgersync.expenses;
import android.os.Bundle;
import android.content.Intent;
import android.view.WindowManager;
import com.getcapacitor.BridgeActivity;
public class MainActivity extends BridgeActivity {
 @Override public void onCreate(Bundle state){registerPlugin(LedgerWidgetPlugin.class);registerPlugin(LedgerFilesPlugin.class);super.onCreate(state);getWindow().setFlags(WindowManager.LayoutParams.FLAG_SECURE,WindowManager.LayoutParams.FLAG_SECURE);}
 @Override protected void onNewIntent(Intent intent){super.onNewIntent(intent);if("Activity".equals(intent.getStringExtra("ledgerTab"))&&getBridge()!=null)getBridge().getWebView().loadUrl("https://localhost/device/");}
 @Override public void onPause(){LedgerWidget.clear(this);super.onPause();}
}
