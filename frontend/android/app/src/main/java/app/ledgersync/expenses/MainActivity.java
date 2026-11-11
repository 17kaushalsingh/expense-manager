package app.ledgersync.expenses;
import android.os.Bundle;
import android.view.WindowManager;
import com.getcapacitor.BridgeActivity;
public class MainActivity extends BridgeActivity {
 @Override public void onCreate(Bundle state){registerPlugin(LedgerWidgetPlugin.class);super.onCreate(state);getWindow().setFlags(WindowManager.LayoutParams.FLAG_SECURE,WindowManager.LayoutParams.FLAG_SECURE);}
 @Override public void onPause(){LedgerWidget.clear(this);super.onPause();}
}
