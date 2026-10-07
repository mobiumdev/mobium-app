#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

// Runs block and catches an Objective-C exception, which Swift cannot:
// AVAudioPlayerNode's play raises one when the engine's output never runs.
// Returns nil if the block finished, else the exception's reason.
NSString *_Nullable ToneCatch(NS_NOESCAPE void (^block)(void));

NS_ASSUME_NONNULL_END
