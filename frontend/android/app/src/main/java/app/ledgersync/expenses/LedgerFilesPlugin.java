package app.ledgersync.expenses;

import android.app.Activity;
import android.content.Intent;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import org.json.JSONObject;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

/** Save encrypted backups through Android's user-controlled document picker. */
@CapacitorPlugin(name = "LedgerFiles")
public final class LedgerFilesPlugin extends Plugin {
    private boolean saving;
    @PluginMethod public void saveBackup(PluginCall call) {
        if (saving) { call.reject("Another file operation is open"); return; }
        try {
            String contents = call.getString("contents", "");
            if (contents.length() > 180 * 1024 * 1024) throw new IllegalArgumentException();
            JSONObject value = new JSONObject(contents);
            if (!"ledgersync-vault".equals(value.optString("format")) || value.optInt("version") != 1 || !(value.opt("ciphertext") instanceof String)) throw new IllegalArgumentException();
            Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("application/octet-stream").putExtra(Intent.EXTRA_TITLE, "LedgerSync.ledgerbackup");
            saving = true;
            startActivityForResult(call, intent, "backupSelected");
        } catch (Exception error) { saving = false; call.reject("Unable to prepare encrypted backup"); }
    }
    @ActivityCallback private void backupSelected(PluginCall call, ActivityResult result) {
        saving = false;
        if (call == null) return;
        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null || result.getData().getData() == null) { call.reject("Backup save cancelled"); return; }
        try (OutputStream out = getContext().getContentResolver().openOutputStream(result.getData().getData(), "wt")) {
            if (out == null) throw new IllegalStateException();
            out.write(call.getString("contents", "").getBytes(StandardCharsets.UTF_8));
            call.resolve();
        } catch (Exception error) { call.reject("Unable to save encrypted backup; retry with a new destination"); }
    }
}
