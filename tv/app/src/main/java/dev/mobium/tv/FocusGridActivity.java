package dev.mobium.tv;

import android.app.Activity;
import android.os.Bundle;
import android.widget.GridLayout;
import android.widget.LinearLayout;
import android.widget.TextView;

/**
 * Twelve tiles in a grid. The remote moves focus between them and the screen
 * says which one has it, so a tool can be shown reading focus — and a D-pad
 * press judged by where focus went — and selecting what has it.
 */
public class FocusGridActivity extends Activity {
    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        LinearLayout root = Ui.screen(this, "Focus Grid",
                "Twelve tiles; the lines below say which has focus and which was selected, and how.");
        GridLayout grid = new GridLayout(this);
        grid.setId(R.id.grid);
        grid.setColumnCount(4);
        root.addView(grid);
        TextView focus = Ui.status(this, R.id.focusState, "Focused: none");
        TextView selected = Ui.status(this, R.id.selectState, "Selected: none");
        for (int i = 1; i <= 12; i++) {
            String name = "Tile " + i;
            TextView t = Ui.tile(this, name, 0);
            GridLayout.LayoutParams lp = new GridLayout.LayoutParams();
            lp.width = Ui.dp(this, 200);
            lp.setMargins(0, 0, Ui.dp(this, 12), Ui.dp(this, 12));
            t.setOnFocusChangeListener((v, has) -> { if (has) focus.setText("Focused: " + name); });
            Ui.onActivate(t, how -> selected.setText("Selected: " + name + ", by " + how));
            grid.addView(t, lp);
        }
        root.addView(focus);
        root.addView(selected);
        grid.getChildAt(0).requestFocus();
    }
}
