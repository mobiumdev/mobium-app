package dev.mobium.tv;

import android.app.Activity;
import android.content.Context;
import android.graphics.Typeface;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.MotionEvent;
import android.view.View;
import android.widget.LinearLayout;
import android.widget.TextView;

import java.util.function.Consumer;

/** The pieces every screen is built from: a title, focusable tiles, status lines. */
final class Ui {
    private Ui() {}

    static int dp(Context c, int v) {
        return Math.round(v * c.getResources().getDisplayMetrics().density);
    }

    /** A screen: a title, a line saying what it is a control for, then its content. */
    static LinearLayout screen(Activity a, String title, String about) {
        LinearLayout root = new LinearLayout(a);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(dp(a, 48), dp(a, 32), dp(a, 48), dp(a, 32));
        TextView t = new TextView(a);
        t.setText(title);
        t.setTextSize(34);
        t.setTypeface(Typeface.DEFAULT_BOLD);
        root.addView(t);
        TextView s = new TextView(a);
        s.setText(about);
        s.setTextSize(20);
        s.setTextColor(a.getColor(R.color.muted));
        s.setPadding(0, dp(a, 4), 0, dp(a, 24));
        root.addView(s);
        a.setContentView(root);
        return root;
    }

    /** A focusable tile, outlined while it has focus. */
    static TextView tile(Context c, String label, int id) {
        TextView v = new TextView(c);
        if (id != 0) v.setId(id);
        v.setText(label);
        v.setTextSize(24);
        v.setGravity(Gravity.CENTER);
        v.setFocusable(true);
        v.setClickable(true);
        v.setBackgroundResource(R.drawable.tile);
        int p = dp(c, 20);
        v.setPadding(p, p, p, p);
        return v;
    }

    /** A line of state a check reads back, by its resource id. */
    static TextView status(Context c, int id, String text) {
        TextView v = new TextView(c);
        v.setId(id);
        v.setText(text);
        v.setTextSize(24);
        v.setPadding(0, dp(c, 12), 0, 0);
        return v;
    }

    /**
     * Calls back when a view is activated, saying how: "select" for the
     * remote's center or Enter key, "touch" for a finger, and "accessibility"
     * for a click that arrived as neither, such as an accessibility action. A
     * TV app sees these differently, so a tool's "tapped" can be read back as
     * what the app actually received.
     */
    static void onActivate(View v, Consumer<String> handler) {
        final String[] last = {"accessibility"};
        v.setOnTouchListener((view, e) -> {
            if (e.getActionMasked() == MotionEvent.ACTION_DOWN) last[0] = "touch";
            return false;
        });
        v.setOnKeyListener((view, code, e) -> {
            if (e.getAction() == KeyEvent.ACTION_DOWN && isSelect(code)) last[0] = "select";
            return false;
        });
        v.setOnClickListener(view -> {
            handler.accept(last[0]);
            last[0] = "accessibility";
        });
    }

    static boolean isSelect(int code) {
        return code == KeyEvent.KEYCODE_DPAD_CENTER || code == KeyEvent.KEYCODE_ENTER
                || code == KeyEvent.KEYCODE_NUMPAD_ENTER || code == KeyEvent.KEYCODE_BUTTON_A;
    }
}
