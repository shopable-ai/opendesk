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
    OPENDESK_AX_ELEMENT_ATTRIBUTE_WINDOWS = 3,
    OPENDESK_AX_ELEMENT_ATTRIBUTE_PARENT = 4,
    OPENDESK_AX_ELEMENT_ATTRIBUTE_FOCUSED_UI_ELEMENT = 5,
    OPENDESK_AX_ELEMENT_ATTRIBUTE_FOCUSED_WINDOW = 6,
    OPENDESK_AX_ELEMENT_ATTRIBUTE_WINDOW = 7
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

int32_t opendesk_ax_copy_element_at_position(
    double x,
    double y,
    double timeout_seconds,
    uintptr_t *result);

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

/* Snapshot-only projection bits. Role is always read for traversal. */
enum {
    OPENDESK_AX_SNAPSHOT_SUBROLE = 1u << 0,
    OPENDESK_AX_SNAPSHOT_NAME = 1u << 1,
    OPENDESK_AX_SNAPSHOT_IDENTIFIER = 1u << 2,
    OPENDESK_AX_SNAPSHOT_ENABLED = 1u << 3,
    OPENDESK_AX_SNAPSHOT_FOCUSED = 1u << 4,
    OPENDESK_AX_SNAPSHOT_SELECTED = 1u << 5,
    OPENDESK_AX_SNAPSHOT_CHECKED = 1u << 6,
    OPENDESK_AX_SNAPSHOT_EXPANDED = 1u << 7,
    OPENDESK_AX_SNAPSHOT_ACTIONS = 1u << 8,
    OPENDESK_AX_SNAPSHOT_BOUNDS = 1u << 9,
    OPENDESK_AX_SNAPSHOT_ALL = (1u << 10) - 1
};

int32_t opendesk_ax_inspect_snapshot_json(
    uintptr_t element,
    double timeout_seconds,
    int32_t include_value,
    uint32_t properties,
    char **json_result);

int32_t opendesk_ax_inspect_json(
    uintptr_t element,
    double timeout_seconds,
    int32_t include_value,
    char **json_result);

/* composition: 0 unknown, 1 inactive, 2 active. No text content crosses here. */
typedef struct {
    int32_t available;
    int32_t selection_present;
    int64_t location;
    int64_t length;
    int32_t composition;
    int32_t marked_present;
    int64_t marked_location;
    int64_t marked_length;
    int32_t composition_reason;
} opendesk_ax_text_input_state;

int32_t opendesk_ax_read_text_input_state(
    uintptr_t element, double timeout_seconds, opendesk_ax_text_input_state *result);

int32_t opendesk_ax_prepare_text_append(
    uintptr_t element, double timeout_seconds, const char *expected,
    int64_t expected_length, int32_t *attempted, int32_t *already_satisfied);

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
