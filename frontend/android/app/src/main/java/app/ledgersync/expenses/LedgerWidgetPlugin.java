package app.ledgersync.expenses;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
@CapacitorPlugin(name="LedgerWidget")
public class LedgerWidgetPlugin extends Plugin {
 @PluginMethod public void update(PluginCall call){try{WidgetSnapshot s=WidgetSnapshot.parse(call.getInt("version",0),call.getString("expiresAt",""),call.getBoolean("showAmounts",false),call.getString("net","••••"),System.currentTimeMillis());getContext().getSharedPreferences("ledger_widget",0).edit().putBoolean("show",s.show).putLong("expiry",s.expiry).putString("net",s.net).apply();LedgerWidget.refresh(getContext());call.resolve();}catch(Exception e){call.reject("Invalid widget snapshot");}}
 @PluginMethod public void clear(PluginCall call){LedgerWidget.clear(getContext());call.resolve();}
}
