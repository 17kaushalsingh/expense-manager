package app.ledgersync.expenses;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.app.PendingIntent;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.widget.RemoteViews;
public class LedgerWidget extends AppWidgetProvider {
 public static void refresh(Context context){AppWidgetManager m=AppWidgetManager.getInstance(context);for(int id:m.getAppWidgetIds(new ComponentName(context,LedgerWidget.class)))render(context,m,id);}
 @Override public void onUpdate(Context context,AppWidgetManager manager,int[] ids){for(int id:ids)render(context,manager,id);}
 private static void render(Context context,AppWidgetManager manager,int id){SharedPreferences s=context.getSharedPreferences("ledger_widget",Context.MODE_PRIVATE);boolean show=s.getBoolean("show",false)&&s.getLong("expiry",0)>System.currentTimeMillis();RemoteViews v=new RemoteViews(context.getPackageName(),R.layout.ledger_widget);v.setTextViewText(R.id.ledger_widget_amount,show?s.getString("net","••••"):"••••");v.setTextViewText(R.id.ledger_widget_status,context.getString(show?R.string.widget_net:R.string.widget_unlock));Intent open=new Intent(context,MainActivity.class);open.putExtra("ledgerTab","Activity");open.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK|Intent.FLAG_ACTIVITY_CLEAR_TOP);v.setOnClickPendingIntent(R.id.ledger_widget_root,PendingIntent.getActivity(context,id,open,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE));manager.updateAppWidget(id,v);}
 public static void clear(Context context){context.getSharedPreferences("ledger_widget",Context.MODE_PRIVATE).edit().clear().apply();refresh(context);}
}
