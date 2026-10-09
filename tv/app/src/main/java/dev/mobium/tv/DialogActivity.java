package dev.mobium.tv;

import android.app.Activity;
import android.app.AlertDialog;
import android.os.Bundle;
import android.widget.LinearLayout;
import android.widget.TextView;

/** An ordinary two-button dialog over a TV screen, answered with the remote. */
public class DialogActivity extends Activity {
    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        LinearLayout root = Ui.screen(this, "Dialog",
                "Open a two-button dialog; the line says how it was answered.");
        TextView open = Ui.tile(this, "Open dialog", R.id.dialogButton);
        TextView outcome = Ui.status(this, R.id.dialogOutcome, "Dialog: not opened");
        open.setOnClickListener(v -> new AlertDialog.Builder(this)
                .setTitle("Discard the draft?")
                .setMessage("The draft is lost if you discard it.")
                .setPositiveButton("Discard", (d, w) -> outcome.setText("Dialog: Discard"))
                .setNegativeButton("Keep", (d, w) -> outcome.setText("Dialog: Keep"))
                .setOnCancelListener(d -> outcome.setText("Dialog: canceled"))
                .show());
        root.addView(open, new LinearLayout.LayoutParams(Ui.dp(this, 320),
                LinearLayout.LayoutParams.WRAP_CONTENT));
        root.addView(outcome);
        open.requestFocus();
    }
}
