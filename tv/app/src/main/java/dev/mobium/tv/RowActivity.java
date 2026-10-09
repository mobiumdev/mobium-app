package dev.mobium.tv;

import android.app.Activity;
import android.os.Bundle;
import android.widget.HorizontalScrollView;
import android.widget.LinearLayout;
import android.widget.TextView;

/**
 * A row of thirty cards wider than the screen, as a TV's content rows are.
 * It scrolls only as focus moves along it, so reaching a card off the screen
 * means pressing right until it has focus, not swiping.
 */
public class RowActivity extends Activity {
    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        LinearLayout root = Ui.screen(this, "Row",
                "Thirty cards in a row that scrolls with focus; the lines say which has focus and which was selected.");
        HorizontalScrollView scroll = new HorizontalScrollView(this);
        scroll.setId(R.id.rowScroll);
        scroll.setHorizontalScrollBarEnabled(false);
        LinearLayout row = new LinearLayout(this);
        row.setId(R.id.row);
        row.setOrientation(LinearLayout.HORIZONTAL);
        scroll.addView(row);
        root.addView(scroll);
        TextView focus = Ui.status(this, R.id.focusState, "Focused: none");
        TextView selected = Ui.status(this, R.id.selectState, "Selected: none");
        for (int i = 1; i <= 30; i++) {
            String name = "Card " + i;
            TextView t = Ui.tile(this, name, 0);
            LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(Ui.dp(this, 220),
                    Ui.dp(this, 130));
            lp.rightMargin = Ui.dp(this, 16);
            t.setOnFocusChangeListener((v, has) -> { if (has) focus.setText("Focused: " + name); });
            Ui.onActivate(t, how -> selected.setText("Selected: " + name + ", by " + how));
            row.addView(t, lp);
        }
        root.addView(focus);
        root.addView(selected);
        row.getChildAt(0).requestFocus();
    }
}
