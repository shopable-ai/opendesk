#import <Foundation/Foundation.h>
#import <LocalAuthentication/LocalAuthentication.h>
#import <Security/Security.h>
#include <pthread.h>

static pthread_mutex_t odKeychainInteractionLock = PTHREAD_MUTEX_INITIALIZER;

// SecItemCopyMatching normally permits an authentication prompt. CLI and
// unattended Runtime loading must instead fail closed and return promptly.
OSStatus odSecItemCopyMatchingNoUI(CFDictionaryRef queryRef, CFTypeRef *result) {
    NSMutableDictionary *query = [(NSDictionary *)queryRef mutableCopy];
    LAContext *context = [[LAContext alloc] init];
    [context setInteractionNotAllowed:YES];
    [query setObject:context forKey:(id)kSecUseAuthenticationContext];

    // The LocalAuthentication context blocks biometric/password UI requested
    // by access-control policies. Legacy keychain ACL prompts use a separate
    // process-wide switch, so serialize the short query and disable that path
    // as well. This compatibility API is intentionally isolated here.
    pthread_mutex_lock(&odKeychainInteractionLock);
    Boolean previousInteraction = true;
#pragma clang diagnostic push
#pragma clang diagnostic ignored "-Wdeprecated-declarations"
    OSStatus interactionStatus = SecKeychainGetUserInteractionAllowed(&previousInteraction);
    if (interactionStatus == errSecSuccess) {
        interactionStatus = SecKeychainSetUserInteractionAllowed(false);
    }
#pragma clang diagnostic pop
    if (interactionStatus != errSecSuccess) {
        pthread_mutex_unlock(&odKeychainInteractionLock);
        [context release];
        [query release];
        return interactionStatus;
    }
    OSStatus status = SecItemCopyMatching((CFDictionaryRef)query, result);
#pragma clang diagnostic push
#pragma clang diagnostic ignored "-Wdeprecated-declarations"
    (void)SecKeychainSetUserInteractionAllowed(previousInteraction);
#pragma clang diagnostic pop
    pthread_mutex_unlock(&odKeychainInteractionLock);
    [context release];
    [query release];
    return status;
}
