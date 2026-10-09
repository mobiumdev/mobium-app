package dev.mobium.tv;

import android.app.Activity;
import android.os.Bundle;
import android.view.KeyEvent;
import android.widget.LinearLayout;
import android.widget.TextView;

/**
 * A stand-in player that reports every key it receives. A media key sent to
 * a TV moves nothing a tool can see unless an app answers it, so this screen
 * is what makes "pressed play" checkable.
 */
public class KeysActivity extends Activity {
    private TextView player;
    private TextView lastKey;
    private TextView count;
    private int keys;
    private boolean playing;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        LinearLayout root = Ui.screen(this, "Player Keys",
                "Press the remote's media keys; the lines say what the player did and which key arrived.");
        player = Ui.status(this, R.id.playerState, "Player: paused");
        lastKey = Ui.status(this, R.id.lastKey, "Last key: none");
        count = Ui.status(this, R.id.keyCount, "Keys: 0");
        root.addView(player);
        root.addView(lastKey);
        root.addView(count);
    }

    @Override
    public boolean dispatchKeyEvent(KeyEvent e) {
        if (e.getAction() != KeyEvent.ACTION_DOWN || e.getRepeatCount() > 0) {
            return super.dispatchKeyEvent(e);
        }
        keys++;
        lastKey.setText("Last key: " + KeyEvent.keyCodeToString(e.getKeyCode()));
        count.setText("Keys: " + keys);
        switch (e.getKeyCode()) {
            case KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE:
                playing = !playing;
                player.setText(playing ? "Player: playing" : "Player: paused");
                return true;
            case KeyEvent.KEYCODE_MEDIA_PLAY:
                playing = true;
                player.setText("Player: playing");
                return true;
            case KeyEvent.KEYCODE_MEDIA_PAUSE:
                playing = false;
                player.setText("Player: paused");
                return true;
            case KeyEvent.KEYCODE_MEDIA_STOP:
                playing = false;
                player.setText("Player: stopped");
                return true;
            case KeyEvent.KEYCODE_MEDIA_FAST_FORWARD:
                player.setText("Player: skipped forward");
                return true;
            case KeyEvent.KEYCODE_MEDIA_REWIND:
                player.setText("Player: skipped back");
                return true;
            default:
                return super.dispatchKeyEvent(e);
        }
    }
}
