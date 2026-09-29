package dev.mobium.downloads

import android.content.ContentValues
import android.os.Build
import android.net.Uri
import android.os.Environment
import android.provider.OpenableColumns
import android.provider.MediaStore
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

// Saves a file where Android keeps downloads: the shared Download folder,
// through MediaStore, the way an app's own downloads land. Expo has no API for
// it — its folders are the app's private ones, which neither the Files app nor
// adb can reach on a release build — and a folder picker cannot stand in:
// since Android 11 it refuses the Download folder itself.
class DownloadsModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("Downloads")

    AsyncFunction("saveAsync") { name: String, text: String ->
      if (Build.VERSION.SDK_INT < 29) {
        throw CodedException("ERR_UNSUPPORTED", "saving to Downloads needs Android 10 or later", null)
      }
      val context = appContext.reactContext ?: throw CodedException("ERR_NO_CONTEXT", "no context", null)
      val resolver = context.contentResolver
      val collection = MediaStore.Downloads.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY)
      // A second save of the same name would be numbered "name (1)"; this
      // app's earlier copy goes first. Another app's file of that name is
      // not this app's to delete, and is left.
      try {
        resolver.delete(collection, "${MediaStore.MediaColumns.DISPLAY_NAME}=?", arrayOf(name))
      } catch (_: SecurityException) {
      }
      val values = ContentValues().apply {
        put(MediaStore.MediaColumns.DISPLAY_NAME, name)
        put(MediaStore.MediaColumns.MIME_TYPE, "text/plain")
        put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS)
        put(MediaStore.MediaColumns.IS_PENDING, 1)
      }
      val uri = resolver.insert(collection, values)
        ?: throw CodedException("ERR_INSERT", "MediaStore did not take $name", null)
      resolver.openOutputStream(uri).use { out ->
        (out ?: throw CodedException("ERR_OPEN", "cannot write $name", null)).write(text.toByteArray())
      }
      values.clear()
      values.put(MediaStore.MediaColumns.IS_PENDING, 0)
      resolver.update(uri, values, null, null)
      "Download/$name"
    }

    // The name a picked file has where the person saw it. Expo's File knows
    // only the last part of its URI, which for a picked download is an id —
    // "document:1000000029" for hello-upload.txt, measured.
    AsyncFunction("nameAsync") { uri: String ->
      val context = appContext.reactContext ?: throw CodedException("ERR_NO_CONTEXT", "no context", null)
      context.contentResolver.query(Uri.parse(uri), arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { c ->
        if (c.moveToFirst()) c.getString(0) else null
      } ?: Uri.parse(uri).lastPathSegment ?: uri
    }
  }
}
