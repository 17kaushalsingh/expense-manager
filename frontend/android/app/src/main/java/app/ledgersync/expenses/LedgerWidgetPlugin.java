package app.ledgersync.expenses;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.time.Instant;
@CapacitorPlugin(name="LedgerWidget")
public class LedgerWidgetPlugin extends Plugin {
 @PluginMethod public void update(PluginCall call){try{if(call.getInt("version",0)!=1)throw new IllegalArgumentException();long expiry=Instant.parse(call.getString("expiresAt","")).toEpochMilli(),now=System.currentTimeMillis();if(expiry<=now||expiry>now+310000)throw new IllegalArgumentException();boolean show=call.getBoolean("showAmounts",false);String net=show?call.getString("net","••••"):"••••";if(net.length()>80)throw new IllegalArgumentException();getContext().getSharedPreferences("ledger_widget",0).edit().putBoolean("show",show).putLong("expiry",expiry).putString("net",net).apply();LedgerWidget.refresh(getContext());call.resolve();}catch(Exception e){call.reject("Invalid widget snapshot");}}
 @PluginMethod public void clear(PluginCall call){LedgerWidget.clear(getContext());call.resolve();}
}
