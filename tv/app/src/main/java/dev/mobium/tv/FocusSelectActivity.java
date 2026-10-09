package dev.mobium.tv;

import android.app.Activity;
import android.os.Bundle;
import android.widget.LinearLayout;
import android.widget.TextView;

/**
 * Two tiles that open the same panel differently. The first opens on focus
 * alone, as a TV launcher's tabs do; the second only when selected. A touch
 * tap on the first moves focus and opens it with no select at all, and on
 * the second opens it by touch — so "tapped" has to be read back on a TV.
 */
public class FocusSelectActivity extends Activity {
    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        LinearLayout root = Ui.screen(this, "Focus or Select",
                "One tile opens on focus, one on select; the panel says which opened and how.");
        LinearLayout tiles = new LinearLayout(this);
        tiles.setOrientation(LinearLayout.HORIZONTAL);
        root.addView(tiles);
        TextView panel = Ui.status(this, R.id.panel, "Panel: closed");

        TextView start = Ui.tile(this, "Start here", 0);
        TextView onFocus = Ui.tile(this, "Opens on focus", R.id.onFocusTile);
        TextView onSelect = Ui.tile(this, "Opens on select", R.id.onSelectTile);
        // Focusable in touch mode, as a launcher's tabs are: a touch gives it
        // focus instead of a click, so a tap opens it by focus.
        onFocus.setFocusableInTouchMode(true);
        onFocus.setOnFocusChangeListener((v, has) -> {
            if (has) panel.setText("Panel: opened by focus on Opens on focus");
        });
        Ui.onActivate(onSelect, how -> panel.setText("Panel: opened by " + how + " on Opens on select"));
        for (TextView t : new TextView[] {start, onFocus, onSelect}) {
            LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(Ui.dp(this, 260),
                    LinearLayout.LayoutParams.WRAP_CONTENT);
            lp.rightMargin = Ui.dp(this, 16);
            tiles.addView(t, lp);
        }
        root.addView(panel);
        start.requestFocus();
    }
}
