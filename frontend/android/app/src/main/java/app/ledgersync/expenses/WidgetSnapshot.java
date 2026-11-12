package app.ledgersync.expenses;
import java.text.SimpleDateFormat;
import java.text.ParsePosition;
import java.util.Locale;
import java.util.TimeZone;
/** Pure boundary validation, also runnable on a JVM without the Android SDK. */
public final class WidgetSnapshot {
 public final boolean show;public final String net;public final long expiry;
 private WidgetSnapshot(boolean show,String net,long expiry){this.show=show;this.net=net;this.expiry=expiry;}
 public static WidgetSnapshot parse(int version,String expiresAt,boolean show,String net,long now){
  if(version!=1||expiresAt==null||!expiresAt.matches("\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}\\.\\d{3}Z"))throw new IllegalArgumentException("Invalid widget snapshot");
  SimpleDateFormat f=new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'",Locale.ROOT);f.setTimeZone(TimeZone.getTimeZone("UTC"));f.setLenient(false);ParsePosition p=new ParsePosition(0);java.util.Date date=f.parse(expiresAt,p);
  if(date==null||p.getIndex()!=expiresAt.length()||date.getTime()<=now||date.getTime()>now+310000||net==null||net.length()>80)throw new IllegalArgumentException("Invalid widget snapshot");
  return new WidgetSnapshot(show,show?net:"••••",date.getTime());
 }
}
