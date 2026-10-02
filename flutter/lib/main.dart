import 'package:flutter/material.dart';

// A Flutter app for driving Flutter with Mobium. Flutter paints its own
// widgets; what an automation tool sees is the semantics tree Flutter builds
// for accessibility. Each control here is one question about that tree:
// labeled or not, with a Semantics identifier or not, reporting its state or
// not. mobiumdev/mobium docs/APP-TYPES.md says what was measured.
void main() => runApp(const MobiumFlutterApp());

class MobiumFlutterApp extends StatelessWidget {
  const MobiumFlutterApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Mobium Flutter',
      theme: ThemeData(colorSchemeSeed: Colors.indigo),
      home: const HomeScreen(),
    );
  }
}

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  final _username = TextEditingController();
  final _password = TextEditingController();
  String _result = 'Not signed in';
  int _taps = 0;
  bool _remember = false;
  bool _notifications = true;
  int _iconTaps = 0;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Mobium Flutter'),
        actions: [
          // A tooltip is the label an icon button gives the semantics tree.
          IconButton(
            tooltip: 'Settings',
            icon: const Icon(Icons.settings),
            onPressed: () => setState(() => _iconTaps++),
          ),
          // No tooltip, no label: what does a tool see for it?
          IconButton(
            icon: const Icon(Icons.favorite),
            onPressed: () => setState(() => _iconTaps++),
          ),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          // A field with a label and no identifier.
          TextField(
            controller: _username,
            decoration: const InputDecoration(labelText: 'Username'),
          ),
          // A password field with a Semantics identifier, which Flutter
          // passes on as the resource-id on Android and the
          // accessibilityIdentifier on iOS.
          Semantics(
            identifier: 'password',
            child: TextField(
              controller: _password,
              obscureText: true,
              decoration: const InputDecoration(labelText: 'Password'),
            ),
          ),
          const SizedBox(height: 8),
          Semantics(
            identifier: 'signIn',
            child: ElevatedButton(
              onPressed: () => setState(() => _result =
                  'Signed in as ${_username.text} with ${_password.text.length} characters'),
              child: const Text('Sign In'),
            ),
          ),
          Text(_result),
          const Divider(),
          ElevatedButton(
            onPressed: () => setState(() => _taps++),
            child: const Text('Tap me'),
          ),
          Text('Taps: $_taps'),
          Text('Icon taps: $_iconTaps'),
          CheckboxListTile(
            title: const Text('Remember me'),
            value: _remember,
            onChanged: (v) => setState(() => _remember = v ?? false),
          ),
          SwitchListTile(
            title: const Text('Notifications'),
            value: _notifications,
            onChanged: (v) => setState(() => _notifications = v),
          ),
          ListTile(
            title: const Text('Details'),
            trailing: const Icon(Icons.chevron_right),
            onTap: () => Navigator.of(context).push(
              MaterialPageRoute(builder: (_) => const DetailsScreen()),
            ),
          ),
          const Divider(),
          // Far enough down that reaching the last row needs a scroll.
          for (var i = 1; i <= 40; i++) ListTile(title: Text('Row $i')),
        ],
      ),
    );
  }
}

class DetailsScreen extends StatelessWidget {
  const DetailsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Details')),
      body: const Center(child: Text('The details screen')),
    );
  }
}
