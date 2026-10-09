package dev.mobium.tv;

import android.app.Activity;
import android.content.Intent;
import android.os.Bundle;
import android.widget.LinearLayout;
import android.widget.TextView;

/** The menu: one tile per screen, each a control for something a TV does differently. */
public class MainActivity extends Activity {
    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        LinearLayout root = Ui.screen(this, "MobiumTV",
                "An app under test for Mobium on TVs: every screen is driven with a remote.");
        LinearLayout menu = new LinearLayout(this);
        menu.setId(R.id.menu);
        menu.setOrientation(LinearLayout.VERTICAL);
        root.addView(menu);
        add(menu, R.id.openGrid, "Focus Grid", FocusGridActivity.class);
        add(menu, R.id.openFocusSelect, "Focus or Select", FocusSelectActivity.class);
        add(menu, R.id.openRow, "Row", RowActivity.class);
        add(menu, R.id.openDialog, "Dialog", DialogActivity.class);
        add(menu, R.id.openKeys, "Player Keys", KeysActivity.class);
        menu.getChildAt(0).requestFocus();
    }

    private void add(LinearLayout menu, int id, String label, Class<?> screen) {
        TextView t = Ui.tile(this, label, id);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(Ui.dp(this, 420),
                LinearLayout.LayoutParams.WRAP_CONTENT);
        lp.bottomMargin = Ui.dp(this, 12);
        t.setOnClickListener(v -> startActivity(new Intent(this, screen)));
        menu.addView(t, lp);
    }
}
