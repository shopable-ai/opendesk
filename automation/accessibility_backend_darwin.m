#include "accessibility_backend_darwin.h"

#import <ApplicationServices/ApplicationServices.h>
#import <Foundation/Foundation.h>

#include <stdlib.h>
#include <string.h>
#include <time.h>

static AXUIElementRef opendesk_ax_element(uintptr_t token) {
    return (AXUIElementRef)(void *)token;
}

// Each public bridge call installs one absolute monotonic deadline. Helpers
// refresh the element's messaging timeout before every provider message, so a
// compound inspection/mutation cannot receive a fresh full timeout for each
// attribute it reads.
static _Thread_local double opendesk_ax_deadline_seconds = 0.0;

static double opendesk_ax_monotonic_seconds(void) {
    struct timespec value = {0, 0};
    if (clock_gettime(CLOCK_MONOTONIC, &value) != 0) return 0.0;
    return (double)value.tv_sec + ((double)value.tv_nsec / 1000000000.0);
}

static int32_t opendesk_ax_refresh_timeout(AXUIElementRef element) {
    if (element == NULL || opendesk_ax_deadline_seconds <= 0.0) return kAXErrorIllegalArgument;
    double remaining = opendesk_ax_deadline_seconds - opendesk_ax_monotonic_seconds();
    if (remaining <= 0.0) return kAXErrorCannotComplete;
    return (int32_t)AXUIElementSetMessagingTimeout(element, (float)remaining);
}

static int32_t opendesk_ax_set_timeout(AXUIElementRef element, double timeout_seconds) {
    if (element == NULL || timeout_seconds <= 0.0) return kAXErrorIllegalArgument;
    double now = opendesk_ax_monotonic_seconds();
    if (now <= 0.0) return kAXErrorFailure;
    opendesk_ax_deadline_seconds = now + timeout_seconds;
    return opendesk_ax_refresh_timeout(element);
}

static CFStringRef opendesk_ax_element_attribute(int32_t attribute) {
    switch (attribute) {
        case OPENDESK_AX_ELEMENT_ATTRIBUTE_MENU_BAR: return kAXMenuBarAttribute;
        case OPENDESK_AX_ELEMENT_ATTRIBUTE_CHILDREN: return kAXChildrenAttribute;
        case OPENDESK_AX_ELEMENT_ATTRIBUTE_WINDOWS: return kAXWindowsAttribute;
        default: return NULL;
    }
}

static CFStringRef opendesk_ax_bool_attribute(int32_t attribute) {
    switch (attribute) {
        case OPENDESK_AX_BOOL_ATTRIBUTE_EXPANDED: return kAXExpandedAttribute;
        case OPENDESK_AX_BOOL_ATTRIBUTE_SELECTED: return kAXSelectedAttribute;
        default: return NULL;
    }
}

static CFStringRef opendesk_ax_action(int32_t action) {
    switch (action) {
        case OPENDESK_AX_ACTION_PRESS: return kAXPressAction;
        case OPENDESK_AX_ACTION_SHOW_MENU: return kAXShowMenuAction;
        default: return NULL;
    }
}

// Optional attributes use NULL for the ordinary "not exposed by this element"
// cases. Provider, permission, stale-element, and timeout failures remain errors.
static int32_t opendesk_ax_copy_optional(
    AXUIElementRef element,
    CFStringRef attribute,
    CFTypeRef *value,
    int32_t *present) {
    *value = NULL;
    *present = 0;
    int32_t deadline_status = opendesk_ax_refresh_timeout(element);
    if (deadline_status != kAXErrorSuccess) return deadline_status;
    AXError status = AXUIElementCopyAttributeValue(element, attribute, value);
    if (status == kAXErrorSuccess) {
        if (*value != NULL) *present = 1;
        return kAXErrorSuccess;
    }
    if (*value != NULL) {
        CFRelease(*value);
        *value = NULL;
    }
    if (status == kAXErrorNoValue || status == kAXErrorAttributeUnsupported) {
        return kAXErrorSuccess;
    }
    return (int32_t)status;
}

static int32_t opendesk_ax_copy_optional_string(
    AXUIElementRef element,
    CFStringRef attribute,
    CFStringRef *value,
    int32_t *present) {
    CFTypeRef raw = NULL;
    int32_t status = opendesk_ax_copy_optional(element, attribute, &raw, present);
    if (status != kAXErrorSuccess || !*present) {
        *value = NULL;
        return status;
    }
    if (CFGetTypeID(raw) != CFStringGetTypeID()) {
        CFRelease(raw);
        *value = NULL;
        *present = 0;
        return OPENDESK_AX_STATUS_TYPE_MISMATCH;
    }
    *value = (CFStringRef)raw;
    return kAXErrorSuccess;
}

static int32_t opendesk_ax_copy_optional_bool(
    AXUIElementRef element,
    CFStringRef attribute,
    int32_t *value,
    int32_t *present) {
    CFTypeRef raw = NULL;
    int32_t status = opendesk_ax_copy_optional(element, attribute, &raw, present);
    if (status != kAXErrorSuccess || !*present) return status;
    if (CFGetTypeID(raw) == CFBooleanGetTypeID()) {
        *value = CFBooleanGetValue((CFBooleanRef)raw) ? 1 : 0;
        CFRelease(raw);
        return kAXErrorSuccess;
    }
    if (CFGetTypeID(raw) == CFNumberGetTypeID()) {
        int32_t number = 0;
        Boolean converted = CFNumberGetValue((CFNumberRef)raw, kCFNumberSInt32Type, &number);
        CFRelease(raw);
        if (!converted) {
            *present = 0;
            return OPENDESK_AX_STATUS_TYPE_MISMATCH;
        }
        *value = number != 0 ? 1 : 0;
        return kAXErrorSuccess;
    }
    CFRelease(raw);
    *present = 0;
    return OPENDESK_AX_STATUS_TYPE_MISMATCH;
}

static int32_t opendesk_ax_is_settable(
    AXUIElementRef element,
    CFStringRef attribute,
    int32_t *settable) {
    Boolean native_settable = false;
    int32_t deadline_status = opendesk_ax_refresh_timeout(element);
    if (deadline_status != kAXErrorSuccess) return deadline_status;
    AXError status = AXUIElementIsAttributeSettable(element, attribute, &native_settable);
    if (status == kAXErrorSuccess) {
        *settable = native_settable ? 1 : 0;
        return kAXErrorSuccess;
    }
    if (status == kAXErrorNoValue || status == kAXErrorAttributeUnsupported) {
        *settable = 0;
        return kAXErrorSuccess;
    }
    return (int32_t)status;
}

static int32_t opendesk_ax_copy_actions(
    AXUIElementRef element,
    CFArrayRef *actions) {
    *actions = NULL;
    int32_t deadline_status = opendesk_ax_refresh_timeout(element);
    if (deadline_status != kAXErrorSuccess) return deadline_status;
    AXError status = AXUIElementCopyActionNames(element, actions);
    if (status == kAXErrorSuccess) return kAXErrorSuccess;
    if (*actions != NULL) {
        CFRelease(*actions);
        *actions = NULL;
    }
    if (status == kAXErrorNoValue || status == kAXErrorActionUnsupported ||
        status == kAXErrorAttributeUnsupported) {
        return kAXErrorSuccess;
    }
    return (int32_t)status;
}

static int32_t opendesk_ax_check_enabled(AXUIElementRef element) {
    int32_t enabled = 0;
    int32_t present = 0;
    int32_t status = opendesk_ax_copy_optional_bool(element, kAXEnabledAttribute, &enabled, &present);
    if (status != kAXErrorSuccess) return status;
    if (!present) return OPENDESK_AX_STATUS_STATE_UNKNOWN;
    return enabled ? kAXErrorSuccess : OPENDESK_AX_STATUS_ELEMENT_DISABLED;
}

static int32_t opendesk_ax_is_secure(AXUIElementRef element, int32_t *secure) {
    CFStringRef subrole = NULL;
    int32_t present = 0;
    int32_t status = opendesk_ax_copy_optional_string(element, kAXSubroleAttribute, &subrole, &present);
    if (status != kAXErrorSuccess) return status;
    *secure = present && CFEqual(subrole, kAXSecureTextFieldSubrole) ? 1 : 0;
    if (subrole != NULL) CFRelease(subrole);
    return kAXErrorSuccess;
}

static id opendesk_ax_json_scalar(CFTypeRef value) {
    if (value == NULL) return [NSNull null];
    CFTypeID type = CFGetTypeID(value);
    if (type == CFStringGetTypeID() || type == CFBooleanGetTypeID() || type == CFNumberGetTypeID()) {
        return (__bridge id)value;
    }
    return nil;
}

static int32_t opendesk_ax_add_optional_string(
    NSMutableDictionary *result,
    NSString *key,
    AXUIElementRef element,
    CFStringRef attribute,
    CFStringRef *copied_value) {
    CFStringRef value = NULL;
    int32_t present = 0;
    int32_t status = opendesk_ax_copy_optional_string(element, attribute, &value, &present);
    if (status != kAXErrorSuccess) return status;
    result[key] = present ? (__bridge id)value : [NSNull null];
    if (copied_value != NULL && value != NULL) {
        *copied_value = (CFStringRef)CFRetain(value);
    }
    if (value != NULL) CFRelease(value);
    return kAXErrorSuccess;
}

static int32_t opendesk_ax_add_optional_bool(
    NSMutableDictionary *result,
    NSString *key,
    AXUIElementRef element,
    CFStringRef attribute) {
    int32_t value = 0;
    int32_t present = 0;
    int32_t status = opendesk_ax_copy_optional_bool(element, attribute, &value, &present);
    if (status != kAXErrorSuccess) return status;
    result[key] = present ? [NSNumber numberWithBool:(value != 0)] : [NSNull null];
    return kAXErrorSuccess;
}

int32_t opendesk_ax_is_process_trusted(void) {
    return AXIsProcessTrusted() ? 1 : 0;
}

uintptr_t opendesk_ax_create_application(int32_t pid) {
    if (pid <= 0) return (uintptr_t)0;
    AXUIElementRef element = AXUIElementCreateApplication((pid_t)pid);
    return (uintptr_t)(void *)element;
}

uintptr_t opendesk_ax_retain_element(uintptr_t token) {
    AXUIElementRef element = opendesk_ax_element(token);
    if (element == NULL) return (uintptr_t)0;
    return (uintptr_t)(void *)CFRetain(element);
}

void opendesk_ax_release_element(uintptr_t token) {
    AXUIElementRef element = opendesk_ax_element(token);
    if (element != NULL) CFRelease(element);
}

int32_t opendesk_ax_element_pid(
    uintptr_t token,
    double timeout_seconds,
    int32_t *pid) {
    AXUIElementRef element = opendesk_ax_element(token);
    if (element == NULL || pid == NULL) return kAXErrorIllegalArgument;
    int32_t status = opendesk_ax_set_timeout(element, timeout_seconds);
    if (status != kAXErrorSuccess) return status;
    pid_t native_pid = 0;
    status = (int32_t)AXUIElementGetPid(element, &native_pid);
    if (status == kAXErrorSuccess) *pid = (int32_t)native_pid;
    return status;
}

int32_t opendesk_ax_copy_element_attribute(
    uintptr_t token,
    int32_t attribute,
    double timeout_seconds,
    uintptr_t *result) {
    AXUIElementRef element = opendesk_ax_element(token);
    CFStringRef native_attribute = opendesk_ax_element_attribute(attribute);
    if (element == NULL || native_attribute == NULL || result == NULL) return kAXErrorIllegalArgument;
    *result = (uintptr_t)0;
    int32_t status = opendesk_ax_set_timeout(element, timeout_seconds);
    if (status != kAXErrorSuccess) return status;
    CFTypeRef value = NULL;
    AXError copy_status = AXUIElementCopyAttributeValue(element, native_attribute, &value);
    if (copy_status == kAXErrorNoValue || copy_status == kAXErrorAttributeUnsupported) {
        if (value != NULL) CFRelease(value);
        return OPENDESK_AX_STATUS_TARGET_NOT_FOUND;
    }
    if (copy_status != kAXErrorSuccess) {
        if (value != NULL) CFRelease(value);
        return (int32_t)copy_status;
    }
    if (value == NULL || CFGetTypeID(value) != AXUIElementGetTypeID()) {
        if (value != NULL) CFRelease(value);
        return OPENDESK_AX_STATUS_TYPE_MISMATCH;
    }
    *result = (uintptr_t)(void *)value;
    return kAXErrorSuccess;
}

int32_t opendesk_ax_copy_element_array_attribute(
    uintptr_t token,
    int32_t attribute,
    double timeout_seconds,
    uintptr_t **results,
    int64_t *count,
    int32_t *materialized) {
    AXUIElementRef element = opendesk_ax_element(token);
    CFStringRef native_attribute = opendesk_ax_element_attribute(attribute);
    if (element == NULL || native_attribute == NULL || results == NULL || count == NULL || materialized == NULL) {
        return kAXErrorIllegalArgument;
    }
    *results = NULL;
    *count = 0;
    *materialized = 0;
    int32_t status = opendesk_ax_set_timeout(element, timeout_seconds);
    if (status != kAXErrorSuccess) return status;
    CFTypeRef value = NULL;
    AXError copy_status = AXUIElementCopyAttributeValue(element, native_attribute, &value);
    if (copy_status == kAXErrorNoValue || copy_status == kAXErrorAttributeUnsupported) {
        if (value != NULL) CFRelease(value);
        return kAXErrorSuccess;
    }
    if (copy_status != kAXErrorSuccess) {
        if (value != NULL) CFRelease(value);
        return (int32_t)copy_status;
    }
    if (value == NULL || CFGetTypeID(value) != CFArrayGetTypeID()) {
        if (value != NULL) CFRelease(value);
        return OPENDESK_AX_STATUS_TYPE_MISMATCH;
    }
    CFArrayRef array = (CFArrayRef)value;
    CFIndex native_count = CFArrayGetCount(array);
    uintptr_t *native_results = NULL;
    if (native_count > 0) {
        native_results = calloc((size_t)native_count, sizeof(uintptr_t));
        if (native_results == NULL) {
            CFRelease(array);
            return kAXErrorFailure;
        }
        for (CFIndex index = 0; index < native_count; index++) {
            CFTypeRef item = CFArrayGetValueAtIndex(array, index);
            if (item == NULL || CFGetTypeID(item) != AXUIElementGetTypeID()) {
                for (CFIndex retained = 0; retained < index; retained++) {
                    CFRelease(opendesk_ax_element(native_results[retained]));
                }
                free(native_results);
                CFRelease(array);
                return OPENDESK_AX_STATUS_TYPE_MISMATCH;
            }
            native_results[index] = (uintptr_t)(void *)CFRetain(item);
        }
    }
    *results = native_results;
    *count = (int64_t)native_count;
    *materialized = 1;
    CFRelease(array);
    return kAXErrorSuccess;
}

void opendesk_ax_free_element_array(uintptr_t *elements) {
    if (elements != NULL) free(elements);
}

int32_t opendesk_ax_inspect_json(
    uintptr_t token,
    double timeout_seconds,
    int32_t include_value,
    char **json_result) {
    AXUIElementRef element = opendesk_ax_element(token);
    if (element == NULL || json_result == NULL) return kAXErrorIllegalArgument;
    *json_result = NULL;
    int32_t status = opendesk_ax_set_timeout(element, timeout_seconds);
    if (status != kAXErrorSuccess) return status;

    @autoreleasepool {
        // Declare every retainable object before the first failure jump. cgo's
        // package-wide Objective-C flags enable ARC, which forbids jumping over
        // initialization of strong locals.
        NSMutableDictionary *result = [NSMutableDictionary dictionary];
        NSMutableArray *actions = [NSMutableArray array];
        id checked = [NSNull null];
        id scalar = nil;
        NSError *serialization_error = nil;
        NSData *json = nil;
        CFStringRef native_role = NULL;
        CFStringRef subrole = NULL;
        CFStringRef title = NULL;
        CFStringRef description = NULL;
        CFStringRef mark = NULL;
        CFArrayRef native_actions = NULL;
        CFTypeRef raw_checked = NULL;
        CFTypeRef position_value = NULL;
        CFTypeRef size_value = NULL;
        CFTypeRef raw_value = NULL;
        char *output = NULL;
        int32_t present = 0;
        int32_t checked_present = 0;
        int32_t mark_present = 0;
        int32_t value_settable = 0;
        int32_t expanded_settable = 0;
        int32_t selected_settable = 0;
        int32_t position_present = 0;
        int32_t size_present = 0;
        int32_t value_present = 0;
        int32_t number = 0;
        BOOL secure = NO;
        CGPoint position = CGPointZero;
        CGSize size = CGSizeZero;

        status = opendesk_ax_copy_optional_string(element, kAXRoleAttribute, &native_role, &present);
        if (status != kAXErrorSuccess) goto cleanup;
        result[@"nativeRole"] = present ? (__bridge id)native_role : [NSNull null];

        present = 0;
        status = opendesk_ax_copy_optional_string(element, kAXSubroleAttribute, &subrole, &present);
        if (status != kAXErrorSuccess) goto cleanup;
        result[@"subrole"] = present ? (__bridge id)subrole : [NSNull null];
        secure = present && CFEqual(subrole, kAXSecureTextFieldSubrole);
        result[@"secure"] = [NSNumber numberWithBool:secure];

        present = 0;
        status = opendesk_ax_copy_optional_string(element, kAXTitleAttribute, &title, &present);
        if (status != kAXErrorSuccess) goto cleanup;
        if (!present) {
            status = opendesk_ax_copy_optional_string(element, kAXDescriptionAttribute, &description, &present);
            if (status != kAXErrorSuccess) goto cleanup;
        }
        result[@"name"] = present ? (__bridge id)(title != NULL ? title : description) : [NSNull null];

        status = opendesk_ax_add_optional_string(result, @"identifier", element, kAXIdentifierAttribute, NULL);
        if (status != kAXErrorSuccess) goto cleanup;
        status = opendesk_ax_add_optional_bool(result, @"enabled", element, kAXEnabledAttribute);
        if (status != kAXErrorSuccess) goto cleanup;
        status = opendesk_ax_add_optional_bool(result, @"focused", element, kAXFocusedAttribute);
        if (status != kAXErrorSuccess) goto cleanup;
        status = opendesk_ax_add_optional_bool(result, @"selected", element, kAXSelectedAttribute);
        if (status != kAXErrorSuccess) goto cleanup;
        status = opendesk_ax_add_optional_bool(result, @"expanded", element, kAXExpandedAttribute);
        if (status != kAXErrorSuccess) goto cleanup;

        if (native_role != NULL &&
            (CFEqual(native_role, kAXCheckBoxRole) || CFEqual(native_role, kAXRadioButtonRole))) {
            status = opendesk_ax_copy_optional(element, kAXValueAttribute, &raw_checked, &checked_present);
            if (status != kAXErrorSuccess) goto cleanup;
            if (checked_present && CFGetTypeID(raw_checked) == CFNumberGetTypeID()) {
                if (!CFNumberGetValue((CFNumberRef)raw_checked, kCFNumberSInt32Type, &number)) {
                    status = OPENDESK_AX_STATUS_TYPE_MISMATCH;
                    goto cleanup;
                }
                if (number == 0 || number == 1) {
                    if (CFEqual(native_role, kAXRadioButtonRole)) {
                        result[@"selected"] = [NSNumber numberWithBool:(number == 1)];
                    } else {
                        checked = [NSNumber numberWithBool:(number == 1)];
                    }
                }
            } else if (checked_present && CFGetTypeID(raw_checked) == CFBooleanGetTypeID()) {
                if (CFEqual(native_role, kAXRadioButtonRole)) {
                    result[@"selected"] = [NSNumber numberWithBool:CFBooleanGetValue((CFBooleanRef)raw_checked)];
                } else {
                    checked = [NSNumber numberWithBool:CFBooleanGetValue((CFBooleanRef)raw_checked)];
                }
            }
            if (raw_checked != NULL) {
                CFRelease(raw_checked);
                raw_checked = NULL;
            }
        } else if (native_role != NULL && CFEqual(native_role, kAXMenuItemRole)) {
            status = opendesk_ax_copy_optional_string(element, kAXMenuItemMarkCharAttribute, &mark, &mark_present);
            if (status != kAXErrorSuccess) goto cleanup;
            if (mark_present) checked = [NSNumber numberWithBool:(CFStringGetLength(mark) > 0)];
            if (mark != NULL) {
                CFRelease(mark);
                mark = NULL;
            }
        }
        result[@"checked"] = checked;

        status = opendesk_ax_copy_actions(element, &native_actions);
        if (status != kAXErrorSuccess) goto cleanup;
        if (native_actions != NULL) {
            CFIndex action_count = CFArrayGetCount(native_actions);
            for (CFIndex index = 0; index < action_count; index++) {
                CFTypeRef action = CFArrayGetValueAtIndex(native_actions, index);
                if (action == NULL || CFGetTypeID(action) != CFStringGetTypeID()) {
                    status = OPENDESK_AX_STATUS_TYPE_MISMATCH;
                    goto cleanup;
                }
                [actions addObject:(__bridge id)action];
            }
            if (native_actions != NULL) {
                CFRelease(native_actions);
                native_actions = NULL;
            }
        }
        result[@"nativeActions"] = actions;

        status = opendesk_ax_is_settable(element, kAXValueAttribute, &value_settable);
        if (status != kAXErrorSuccess) goto cleanup;
        status = opendesk_ax_is_settable(element, kAXExpandedAttribute, &expanded_settable);
        if (status != kAXErrorSuccess) goto cleanup;
        status = opendesk_ax_is_settable(element, kAXSelectedAttribute, &selected_settable);
        if (status != kAXErrorSuccess) goto cleanup;
        result[@"valueSettable"] = [NSNumber numberWithBool:(value_settable != 0)];
        result[@"expandedSettable"] = [NSNumber numberWithBool:(expanded_settable != 0)];
        result[@"selectedSettable"] = [NSNumber numberWithBool:(selected_settable != 0)];

        status = opendesk_ax_copy_optional(element, kAXPositionAttribute, &position_value, &position_present);
        if (status != kAXErrorSuccess) goto cleanup;
        status = opendesk_ax_copy_optional(element, kAXSizeAttribute, &size_value, &size_present);
        if (status != kAXErrorSuccess) goto cleanup;
        if (position_present && size_present &&
            CFGetTypeID(position_value) == AXValueGetTypeID() &&
            CFGetTypeID(size_value) == AXValueGetTypeID() &&
            AXValueGetType((AXValueRef)position_value) == kAXValueCGPointType &&
            AXValueGetType((AXValueRef)size_value) == kAXValueCGSizeType) {
            if (AXValueGetValue((AXValueRef)position_value, kAXValueCGPointType, &position) &&
                AXValueGetValue((AXValueRef)size_value, kAXValueCGSizeType, &size)) {
                result[@"nativeBounds"] = @{
                    @"x": @(position.x), @"y": @(position.y),
                    @"width": @(size.width), @"height": @(size.height)
                };
            } else {
                result[@"nativeBounds"] = [NSNull null];
            }
        } else {
            result[@"nativeBounds"] = [NSNull null];
        }
        if (position_value != NULL) {
            CFRelease(position_value);
            position_value = NULL;
        }
        if (size_value != NULL) {
            CFRelease(size_value);
            size_value = NULL;
        }

        result[@"valueIncluded"] = [NSNumber numberWithBool:(include_value != 0)];
        if (include_value != 0) {
            if (secure) {
                status = OPENDESK_AX_STATUS_PROTECTED_VALUE;
                goto cleanup;
            }
            status = opendesk_ax_copy_optional(element, kAXValueAttribute, &raw_value, &value_present);
            if (status != kAXErrorSuccess) goto cleanup;
            if (!value_present) {
                result[@"value"] = [NSNull null];
            } else {
                scalar = opendesk_ax_json_scalar(raw_value);
                if (scalar == nil) {
                    status = OPENDESK_AX_STATUS_VALUE_UNSUPPORTED;
                    goto cleanup;
                }
                result[@"value"] = scalar;
            }
            if (raw_value != NULL) {
                CFRelease(raw_value);
                raw_value = NULL;
            }
        }

        json = [NSJSONSerialization dataWithJSONObject:result options:0 error:&serialization_error];
        if (json == nil || serialization_error != nil) {
            status = OPENDESK_AX_STATUS_SERIALIZATION_FAILED;
            goto cleanup;
        }
        output = malloc(json.length + 1);
        if (output == NULL) {
            status = kAXErrorFailure;
            goto cleanup;
        }
        memcpy(output, json.bytes, json.length);
        output[json.length] = '\0';
        *json_result = output;
        status = kAXErrorSuccess;

cleanup:
        if (raw_checked != NULL) CFRelease(raw_checked);
        if (mark != NULL) CFRelease(mark);
        if (native_actions != NULL) CFRelease(native_actions);
        if (position_value != NULL) CFRelease(position_value);
        if (size_value != NULL) CFRelease(size_value);
        if (raw_value != NULL) CFRelease(raw_value);
        if (native_role != NULL) CFRelease(native_role);
        if (subrole != NULL) CFRelease(subrole);
        if (title != NULL) CFRelease(title);
        if (description != NULL) CFRelease(description);
        return status;
    }
}

int32_t opendesk_ax_set_string_value(
    uintptr_t token,
    double timeout_seconds,
    const char *value,
    int64_t value_length,
    int32_t *attempted,
    int32_t *already_satisfied) {
    AXUIElementRef element = opendesk_ax_element(token);
    if (element == NULL || value == NULL || value_length < 0 || attempted == NULL || already_satisfied == NULL) {
        return kAXErrorIllegalArgument;
    }
    *attempted = 0;
    *already_satisfied = 0;
    int32_t status = opendesk_ax_set_timeout(element, timeout_seconds);
    if (status != kAXErrorSuccess) return status;
    status = opendesk_ax_check_enabled(element);
    if (status != kAXErrorSuccess) return status;
    int32_t secure = 0;
    status = opendesk_ax_is_secure(element, &secure);
    if (status != kAXErrorSuccess) return status;
    if (secure) return OPENDESK_AX_STATUS_PROTECTED_VALUE;

    int32_t settable = 0;
    status = opendesk_ax_is_settable(element, kAXValueAttribute, &settable);
    if (status != kAXErrorSuccess) return status;
    if (!settable) return OPENDESK_AX_STATUS_ACTION_UNSUPPORTED;

    CFStringRef desired = CFStringCreateWithBytes(
        kCFAllocatorDefault,
        (const UInt8 *)value,
        (CFIndex)value_length,
        kCFStringEncodingUTF8,
        false);
    if (desired == NULL) return kAXErrorFailure;
    CFStringRef current = NULL;
    int32_t present = 0;
    status = opendesk_ax_copy_optional_string(element, kAXValueAttribute, &current, &present);
    if (status != kAXErrorSuccess) {
        CFRelease(desired);
        return status;
    }
    if (present && CFEqual(current, desired)) {
        *already_satisfied = 1;
        CFRelease(current);
        CFRelease(desired);
        return kAXErrorSuccess;
    }
    if (current != NULL) CFRelease(current);
    status = opendesk_ax_refresh_timeout(element);
    if (status != kAXErrorSuccess) {
        CFRelease(desired);
        return status;
    }
    *attempted = 1;
    status = (int32_t)AXUIElementSetAttributeValue(element, kAXValueAttribute, desired);
    CFRelease(desired);
    return status;
}

int32_t opendesk_ax_set_bool_attribute(
    uintptr_t token,
    int32_t attribute,
    int32_t desired,
    double timeout_seconds,
    int32_t *attempted,
    int32_t *already_satisfied) {
    AXUIElementRef element = opendesk_ax_element(token);
    CFStringRef native_attribute = opendesk_ax_bool_attribute(attribute);
    if (element == NULL || native_attribute == NULL || attempted == NULL || already_satisfied == NULL) {
        return kAXErrorIllegalArgument;
    }
    *attempted = 0;
    *already_satisfied = 0;
    int32_t status = opendesk_ax_set_timeout(element, timeout_seconds);
    if (status != kAXErrorSuccess) return status;
    status = opendesk_ax_check_enabled(element);
    if (status != kAXErrorSuccess) return status;

    int32_t current = 0;
    int32_t present = 0;
    status = opendesk_ax_copy_optional_bool(element, native_attribute, &current, &present);
    if (status != kAXErrorSuccess) return status;
    if (!present) return OPENDESK_AX_STATUS_STATE_UNKNOWN;
    if ((current != 0) == (desired != 0)) {
        *already_satisfied = 1;
        return kAXErrorSuccess;
    }
    int32_t settable = 0;
    status = opendesk_ax_is_settable(element, native_attribute, &settable);
    if (status != kAXErrorSuccess) return status;
    if (!settable) return OPENDESK_AX_STATUS_ACTION_UNSUPPORTED;
    status = opendesk_ax_refresh_timeout(element);
    if (status != kAXErrorSuccess) return status;
    *attempted = 1;
    return (int32_t)AXUIElementSetAttributeValue(
        element,
        native_attribute,
        desired != 0 ? kCFBooleanTrue : kCFBooleanFalse);
}

int32_t opendesk_ax_set_checked(
    uintptr_t token,
    int32_t desired,
    double timeout_seconds,
    int32_t *attempted,
    int32_t *already_satisfied) {
    AXUIElementRef element = opendesk_ax_element(token);
    if (element == NULL || attempted == NULL || already_satisfied == NULL) return kAXErrorIllegalArgument;
    *attempted = 0;
    *already_satisfied = 0;
    int32_t status = opendesk_ax_set_timeout(element, timeout_seconds);
    if (status != kAXErrorSuccess) return status;
    status = opendesk_ax_check_enabled(element);
    if (status != kAXErrorSuccess) return status;

    CFStringRef role = NULL;
    int32_t role_present = 0;
    status = opendesk_ax_copy_optional_string(element, kAXRoleAttribute, &role, &role_present);
    if (status != kAXErrorSuccess) return status;
    if (!role_present || !CFEqual(role, kAXCheckBoxRole)) {
        if (role != NULL) CFRelease(role);
        return OPENDESK_AX_STATUS_ACTION_UNSUPPORTED;
    }
    CFRelease(role);

    CFTypeRef raw_value = NULL;
    int32_t value_present = 0;
    status = opendesk_ax_copy_optional(element, kAXValueAttribute, &raw_value, &value_present);
    if (status != kAXErrorSuccess) return status;
    if (!value_present) {
        if (raw_value != NULL) CFRelease(raw_value);
        return OPENDESK_AX_STATUS_STATE_UNKNOWN;
    }
    int32_t current = -1;
    Boolean value_is_boolean = CFGetTypeID(raw_value) == CFBooleanGetTypeID();
    Boolean converted = false;
    if (value_is_boolean) {
        current = CFBooleanGetValue((CFBooleanRef)raw_value) ? 1 : 0;
        converted = true;
    } else if (CFGetTypeID(raw_value) == CFNumberGetTypeID()) {
        converted = CFNumberGetValue((CFNumberRef)raw_value, kCFNumberSInt32Type, &current);
    }
    CFRelease(raw_value);
    if (!converted || (current != 0 && current != 1)) return OPENDESK_AX_STATUS_STATE_UNKNOWN;
    if ((current == 1) == (desired != 0)) {
        *already_satisfied = 1;
        return kAXErrorSuccess;
    }
    int32_t settable = 0;
    status = opendesk_ax_is_settable(element, kAXValueAttribute, &settable);
    if (status != kAXErrorSuccess) return status;
    if (!settable) {
        // A native checkbox may expose an immutable AXValue together with a
        // single AXPress action. Because the two-state value was read above,
        // one press is a bounded, state-directed setChecked operation rather
        // than an unbounded toggle loop.
        CFArrayRef actions = NULL;
        status = opendesk_ax_copy_actions(element, &actions);
        if (status != kAXErrorSuccess) return status;
        Boolean supports_press = actions != NULL && CFArrayContainsValue(
            actions,
            CFRangeMake(0, CFArrayGetCount(actions)),
            kAXPressAction);
        if (actions != NULL) CFRelease(actions);
        if (!supports_press) return OPENDESK_AX_STATUS_ACTION_UNSUPPORTED;
        status = opendesk_ax_refresh_timeout(element);
        if (status != kAXErrorSuccess) return status;
        *attempted = 1;
        return (int32_t)AXUIElementPerformAction(element, kAXPressAction);
    }
    int32_t native_desired = desired != 0 ? 1 : 0;
    CFTypeRef native_value = desired != 0 ? kCFBooleanTrue : kCFBooleanFalse;
    CFNumberRef number = NULL;
    if (!value_is_boolean) {
        number = CFNumberCreate(kCFAllocatorDefault, kCFNumberSInt32Type, &native_desired);
        if (number == NULL) return kAXErrorFailure;
        native_value = number;
    }
    status = opendesk_ax_refresh_timeout(element);
    if (status != kAXErrorSuccess) {
        if (number != NULL) CFRelease(number);
        return status;
    }
    *attempted = 1;
    status = (int32_t)AXUIElementSetAttributeValue(element, kAXValueAttribute, native_value);
    if (number != NULL) CFRelease(number);
    return status;
}

int32_t opendesk_ax_perform_action(
    uintptr_t token,
    int32_t action,
    double timeout_seconds,
    int32_t *attempted) {
    AXUIElementRef element = opendesk_ax_element(token);
    CFStringRef native_action = opendesk_ax_action(action);
    if (element == NULL || native_action == NULL || attempted == NULL) return kAXErrorIllegalArgument;
    *attempted = 0;
    int32_t status = opendesk_ax_set_timeout(element, timeout_seconds);
    if (status != kAXErrorSuccess) return status;
    status = opendesk_ax_check_enabled(element);
    if (status != kAXErrorSuccess) return status;
    CFArrayRef actions = NULL;
    status = opendesk_ax_copy_actions(element, &actions);
    if (status != kAXErrorSuccess) return status;
    Boolean supported = actions != NULL && CFArrayContainsValue(
        actions,
        CFRangeMake(0, CFArrayGetCount(actions)),
        native_action);
    if (actions != NULL) CFRelease(actions);
    if (!supported) return OPENDESK_AX_STATUS_ACTION_UNSUPPORTED;
    status = opendesk_ax_refresh_timeout(element);
    if (status != kAXErrorSuccess) return status;
    *attempted = 1;
    return (int32_t)AXUIElementPerformAction(element, native_action);
}

static int32_t opendesk_ax_check_collapsed_menu(
    AXUIElementRef element,
    int32_t *already_satisfied) {
    if (element == NULL || already_satisfied == NULL) return kAXErrorIllegalArgument;
    *already_satisfied = 0;

    int32_t status = opendesk_ax_check_enabled(element);
    if (status != kAXErrorSuccess) return status;

    CFStringRef role = NULL;
    int32_t role_present = 0;
    status = opendesk_ax_copy_optional_string(element, kAXRoleAttribute, &role, &role_present);
    if (status != kAXErrorSuccess) return status;
    Boolean menu_role = role_present && role != NULL &&
        (CFEqual(role, kAXMenuBarItemRole) || CFEqual(role, kAXMenuItemRole));
    if (role != NULL) CFRelease(role);
    if (!menu_role) return OPENDESK_AX_STATUS_ACTION_UNSUPPORTED;

    CFTypeRef raw_children = NULL;
    int32_t children_present = 0;
    status = opendesk_ax_copy_optional(element, kAXChildrenAttribute, &raw_children, &children_present);
    if (status != kAXErrorSuccess) return status;
    Boolean has_menu_child = false;
    Boolean menu_visibility_known = false;
    Boolean menu_visible = false;
    if (children_present && raw_children != NULL) {
        CFTypeID children_type = CFGetTypeID(raw_children);
        CFIndex child_count = children_type == CFArrayGetTypeID()
            ? CFArrayGetCount((CFArrayRef)raw_children)
            : (children_type == AXUIElementGetTypeID() ? 1 : 0);
        for (CFIndex index = 0; index < child_count && !has_menu_child; index++) {
            CFTypeRef child = children_type == CFArrayGetTypeID()
                ? CFArrayGetValueAtIndex((CFArrayRef)raw_children, index)
                : raw_children;
            if (child == NULL || CFGetTypeID(child) != AXUIElementGetTypeID()) continue;
            CFStringRef child_role = NULL;
            int32_t child_role_present = 0;
            status = opendesk_ax_copy_optional_string(
                (AXUIElementRef)child, kAXRoleAttribute, &child_role, &child_role_present);
            if (status != kAXErrorSuccess) {
                if (child_role != NULL) CFRelease(child_role);
                CFRelease(raw_children);
                return status;
            }
            has_menu_child = child_role_present && child_role != NULL && CFEqual(child_role, kAXMenuRole);
            if (child_role != NULL) CFRelease(child_role);
            if (has_menu_child) {
                CFTypeRef position_value = NULL;
                CFTypeRef size_value = NULL;
                int32_t position_present = 0;
                int32_t size_present = 0;
                status = opendesk_ax_copy_optional(
                    (AXUIElementRef)child, kAXPositionAttribute, &position_value, &position_present);
                if (status == kAXErrorSuccess) {
                    status = opendesk_ax_copy_optional(
                        (AXUIElementRef)child, kAXSizeAttribute, &size_value, &size_present);
                }
                if (status != kAXErrorSuccess) {
                    if (position_value != NULL) CFRelease(position_value);
                    if (size_value != NULL) CFRelease(size_value);
                    CFRelease(raw_children);
                    return status;
                }
                if (position_present && size_present &&
                    CFGetTypeID(position_value) == AXValueGetTypeID() &&
                    CFGetTypeID(size_value) == AXValueGetTypeID() &&
                    AXValueGetType((AXValueRef)position_value) == kAXValueCGPointType &&
                    AXValueGetType((AXValueRef)size_value) == kAXValueCGSizeType) {
                    CGPoint position = CGPointZero;
                    CGSize size = CGSizeZero;
                    if (AXValueGetValue((AXValueRef)position_value, kAXValueCGPointType, &position) &&
                        AXValueGetValue((AXValueRef)size_value, kAXValueCGSizeType, &size)) {
                        menu_visibility_known = true;
                        if (size.width > 0.0 && size.height > 0.0) {
                            CGRect menu_bounds = CGRectMake(position.x, position.y, size.width, size.height);
                            CGDirectDisplayID displays[32];
                            uint32_t display_count = 0;
                            if (CGGetActiveDisplayList(32, displays, &display_count) == kCGErrorSuccess) {
                                for (uint32_t display_index = 0; display_index < display_count; display_index++) {
                                    if (CGRectIntersectsRect(menu_bounds, CGDisplayBounds(displays[display_index]))) {
                                        menu_visible = true;
                                        break;
                                    }
                                }
                            } else {
                                menu_visibility_known = false;
                            }
                        }
                    }
                }
                if (position_value != NULL) CFRelease(position_value);
                if (size_value != NULL) CFRelease(size_value);
            }
        }
        CFRelease(raw_children);
    }
    if (!has_menu_child) return OPENDESK_AX_STATUS_ACTION_UNSUPPORTED;

    if (menu_visibility_known && menu_visible) {
        *already_satisfied = 1;
        return kAXErrorSuccess;
    }
    if (!menu_visibility_known) {
        int32_t open = 0;
        int32_t open_present = 0;
        status = opendesk_ax_copy_optional_bool(element, kAXExpandedAttribute, &open, &open_present);
        if (status != kAXErrorSuccess) return status;
        if (!open_present) {
            status = opendesk_ax_copy_optional_bool(element, kAXSelectedAttribute, &open, &open_present);
            if (status != kAXErrorSuccess) return status;
        }
        if (!open_present) return OPENDESK_AX_STATUS_STATE_UNKNOWN;
        if (open) {
            *already_satisfied = 1;
            return kAXErrorSuccess;
        }
    }

    CFArrayRef actions = NULL;
    status = opendesk_ax_copy_actions(element, &actions);
    if (status != kAXErrorSuccess) return status;
    Boolean supports_press = actions != NULL && CFArrayContainsValue(
        actions,
        CFRangeMake(0, CFArrayGetCount(actions)),
        kAXPressAction);
    if (actions != NULL) CFRelease(actions);
    return supports_press ? kAXErrorSuccess : OPENDESK_AX_STATUS_ACTION_UNSUPPORTED;
}

int32_t opendesk_ax_press_collapsed_menu(
    uintptr_t token,
    double timeout_seconds,
    int32_t *attempted,
    int32_t *already_satisfied) {
    AXUIElementRef element = opendesk_ax_element(token);
    if (element == NULL || attempted == NULL || already_satisfied == NULL) {
        return kAXErrorIllegalArgument;
    }
    *attempted = 0;
    *already_satisfied = 0;
    int32_t status = opendesk_ax_set_timeout(element, timeout_seconds);
    if (status != kAXErrorSuccess) return status;

    // Keep the collapsed-state check and the one mutation inside a single
    // bridge call. Recheck immediately before AXPress so a menu opened by the
    // user or another client is reported as already satisfied, never toggled
    // closed by a stale Go-side observation.
    status = opendesk_ax_check_collapsed_menu(element, already_satisfied);
    if (status != kAXErrorSuccess || *already_satisfied != 0) return status;
    status = opendesk_ax_refresh_timeout(element);
    if (status != kAXErrorSuccess) return status;
    status = opendesk_ax_check_collapsed_menu(element, already_satisfied);
    if (status != kAXErrorSuccess || *already_satisfied != 0) return status;
    status = opendesk_ax_refresh_timeout(element);
    if (status != kAXErrorSuccess) return status;
    *attempted = 1;
    return (int32_t)AXUIElementPerformAction(element, kAXPressAction);
}

void opendesk_ax_free(void *value) {
    if (value != NULL) free(value);
}
