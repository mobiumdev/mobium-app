import 'package:flutter_test/flutter_test.dart';
import 'package:mobium_flutter/main.dart';

void main() {
  testWidgets('Tap me counts its taps', (tester) async {
    await tester.pumpWidget(const MobiumFlutterApp());
    expect(find.text('Taps: 0'), findsOneWidget);
    await tester.tap(find.text('Tap me'));
    await tester.pump();
    expect(find.text('Taps: 1'), findsOneWidget);
  });
}
