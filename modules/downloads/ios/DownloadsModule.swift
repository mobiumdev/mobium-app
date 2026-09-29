import ExpoModulesCore

// Saves a file where an iOS app keeps what it downloads: its own Documents
// folder, which the Files app shows under On My iPhone once the app declares
// UIFileSharingEnabled and LSSupportsOpeningDocumentsInPlace. iOS has no
// shared Downloads folder an app writes into.
public class DownloadsModule: Module {
  public func definition() -> ModuleDefinition {
    Name("Downloads")

    AsyncFunction("saveAsync") { (name: String, text: String) -> String in
      let docs = try FileManager.default.url(for: .documentDirectory, in: .userDomainMask, appropriateFor: nil, create: true)
      try text.write(to: docs.appendingPathComponent(name), atomically: true, encoding: .utf8)
      return "Documents/" + name
    }

    // A picked file on iOS is a copy that keeps its name.
    AsyncFunction("nameAsync") { (uri: String) -> String in
      return URL(string: uri)?.lastPathComponent ?? uri
    }
  }
}
