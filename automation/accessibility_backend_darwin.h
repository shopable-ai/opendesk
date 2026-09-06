#ifndef OPENDESK_ACCESSIBILITY_BACKEND_DARWIN_H
#define OPENDESK_ACCESSIBILITY_BACKEND_DARWIN_H

#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

enum {
    OPENDESK_AX_STATUS_TARGET_NOT_FOUND = 71001,
    OPENDESK_AX_STATUS_TYPE_MISMATCH = 71002,
    OPENDESK_AX_STATUS_SERIALIZATION_FAILED = 71003,
    OPENDESK_AX_STATUS_PROTECTED_VALUE = 71004,
    OPENDESK_AX_STATUS_VALUE_UNSUPPORTED = 71005,
    OPENDESK_AX_STATUS_ACTION_UNSUPPORTED = 71006,
    OPENDESK_AX_STATUS_ELEMENT_DISABLED = 71007,
    OPENDESK_AX_STATUS_STATE_UNKNOWN = 71008
};

enum {
    OPENDESK_AX_ELEMENT_ATTRIBUTE_MENU_BAR = 1,
    OPENDESK_AX_ELEMENT_ATTRIBUTE_CHILDREN = 2,
    OPENDESK_AX_ELEMENT_ATTRIBUTE_WINDOWS = 3
};

enum {
    OPENDESK_AX_BOOL_ATTRIBUTE_EXPANDED = 1,
    OPENDESK_AX_BOOL_ATTRIBUTE_SELECTED = 2
};

enum {
    OPENDESK_AX_ACTION_PRESS = 1,
    OPENDESK_AX_ACTION_SHOW_MENU = 2
};

int32_t opendesk_ax_is_process_trusted(void);

uintptr_t opendesk_ax_create_application(int32_t pid);
uintptr_t opendesk_ax_retain_element(uintptr_t element);
void opendesk_ax_release_element(uintptr_t element);

int32_t opendesk_ax_element_pid(
    uintptr_t element,
    double timeout_seconds,
    int32_t *pid);

int32_t opendesk_ax_copy_element_attribute(
    uintptr_t element,
    int32_t attribute,
    double timeout_seconds,
    uintptr_t *result);

int32_t opendesk_ax_copy_element_array_attribute(
    uintptr_t element,
    int32_t attribute,
    double timeout_seconds,
    uintptr_t **results,
    int64_t *count,
    int32_t *materialized);

void opendesk_ax_free_element_array(uintptr_t *elements);

int32_t opendesk_ax_inspect_json(
    uintptr_t element,
    double timeout_seconds,
    int32_t include_value,
    char **json_result);

int32_t opendesk_ax_set_string_value(
    uintptr_t element,
    double timeout_seconds,
    const char *value,
    int64_t value_length,
    int32_t *attempted,
    int32_t *already_satisfied);

int32_t opendesk_ax_set_bool_attribute(
    uintptr_t element,
    int32_t attribute,
    int32_t desired,
    double timeout_seconds,
    int32_t *attempted,
    int32_t *already_satisfied);

int32_t opendesk_ax_set_checked(
    uintptr_t element,
    int32_t desired,
    double timeout_seconds,
    int32_t *attempted,
    int32_t *already_satisfied);

int32_t opendesk_ax_perform_action(
    uintptr_t element,
    int32_t action,
    double timeout_seconds,
    int32_t *attempted);

int32_t opendesk_ax_press_collapsed_menu(
    uintptr_t element,
    double timeout_seconds,
    int32_t *attempted,
    int32_t *already_satisfied);

void opendesk_ax_free(void *value);

#ifdef __cplusplus
}
#endif

#endif
