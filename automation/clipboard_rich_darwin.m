#import <AppKit/AppKit.h>
#import <Foundation/Foundation.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>

#define OPENDESK_CLIPBOARD_UNSUPPORTED_FORMAT -72000
#define OPENDESK_CLIPBOARD_SERIALIZATION_FAILED -72001
#define OPENDESK_CLIPBOARD_WRITE_FAILED -72002

static int32_t OpenDeskClipboardJSONData(id object, char **json) {
    if (json == NULL) return OPENDESK_CLIPBOARD_SERIALIZATION_FAILED;
    *json = NULL;
    NSError *error = nil;
    NSData *data = [NSJSONSerialization dataWithJSONObject:object options:0 error:&error];
    if (data == nil || error != nil) return OPENDESK_CLIPBOARD_SERIALIZATION_FAILED;
    char *result = malloc(data.length + 1);
    if (result == NULL) return OPENDESK_CLIPBOARD_SERIALIZATION_FAILED;
    memcpy(result, data.bytes, data.length);
    result[data.length] = '\0';
    *json = result;
    return 0;
}

int32_t opendesk_clipboard_native_formats_json(char **json) {
    @autoreleasepool {
        NSPasteboard *pasteboard = [NSPasteboard generalPasteboard];
        if (pasteboard == nil) return OPENDESK_CLIPBOARD_WRITE_FAILED;
        NSMutableOrderedSet *types = [NSMutableOrderedSet orderedSet];
        for (NSPasteboardItem *item in pasteboard.pasteboardItems ?: @[]) {
            [types addObjectsFromArray:item.types ?: @[]];
        }
        if (types.count == 0) [types addObjectsFromArray:pasteboard.types ?: @[]];
        return OpenDeskClipboardJSONData(types.array, json);
    }
}

int64_t opendesk_clipboard_change_count(void) {
    @autoreleasepool {
        NSPasteboard *pasteboard = [NSPasteboard generalPasteboard];
        return pasteboard == nil ? -1 : (int64_t)pasteboard.changeCount;
    }
}

static NSPasteboardType OpenDeskClipboardType(int format) {
    switch (format) {
        case 1: return NSPasteboardTypeString;
        case 2: return NSPasteboardTypeHTML;
        case 3: return NSPasteboardTypeRTF;
        case 4: return NSPasteboardTypePNG;
        default: return nil;
    }
}

int32_t opendesk_clipboard_read_data(int format, void **data, int64_t *size) {
    if (data == NULL || size == NULL) return OPENDESK_CLIPBOARD_UNSUPPORTED_FORMAT;
    *data = NULL;
    *size = 0;
    @autoreleasepool {
        NSPasteboardType type = OpenDeskClipboardType(format);
        if (type == nil) return OPENDESK_CLIPBOARD_UNSUPPORTED_FORMAT;
        NSPasteboard *pasteboard = [NSPasteboard generalPasteboard];
        if (pasteboard == nil) return OPENDESK_CLIPBOARD_WRITE_FAILED;
        NSData *representation = nil;
        if (format == 1 || format == 2) {
            NSString *string = [pasteboard stringForType:type];
            if (string == nil) return OPENDESK_CLIPBOARD_UNSUPPORTED_FORMAT;
            representation = [string dataUsingEncoding:NSUTF8StringEncoding];
        } else {
            representation = [pasteboard dataForType:type];
        }
        if (representation == nil) return OPENDESK_CLIPBOARD_UNSUPPORTED_FORMAT;
        if (representation.length == 0) return 0;
        void *result = malloc(representation.length);
        if (result == NULL) return OPENDESK_CLIPBOARD_WRITE_FAILED;
        memcpy(result, representation.bytes, representation.length);
        *data = result;
        *size = (int64_t)representation.length;
        return 0;
    }
}

int32_t opendesk_clipboard_read_files_json(char **json) {
    @autoreleasepool {
        NSPasteboard *pasteboard = [NSPasteboard generalPasteboard];
        if (pasteboard == nil) return OPENDESK_CLIPBOARD_WRITE_FAILED;
        NSDictionary *options = @{NSPasteboardURLReadingFileURLsOnlyKey: @YES};
        NSArray *urls = [pasteboard readObjectsForClasses:@[[NSURL class]] options:options] ?: @[];
        NSMutableArray *paths = [NSMutableArray array];
        for (NSURL *url in urls) {
            if (url.isFileURL && url.path != nil) [paths addObject:url.path];
        }
        return OpenDeskClipboardJSONData(paths, json);
    }
}

static NSString *OpenDeskClipboardString(const void *bytes, int64_t size) {
    if (size == 0) return @"";
    if (bytes == NULL || size < 0) return nil;
    return [[NSString alloc] initWithBytes:bytes length:(NSUInteger)size encoding:NSUTF8StringEncoding];
}

int32_t opendesk_clipboard_write_payload(
    const void *text, int64_t text_size, int has_text,
    const void *html, int64_t html_size, int has_html,
    const void *rtf, int64_t rtf_size, int has_rtf,
    const void *png, int64_t png_size, int has_png,
    const char *files_json, int has_files,
    int64_t *change_count) {
    if (change_count == NULL) return OPENDESK_CLIPBOARD_WRITE_FAILED;
    @autoreleasepool {
        NSPasteboard *pasteboard = [NSPasteboard generalPasteboard];
        if (pasteboard == nil) return OPENDESK_CLIPBOARD_WRITE_FAILED;
        NSMutableArray *objects = [NSMutableArray array];
        if (has_text || has_html || has_rtf || has_png) {
            NSPasteboardItem *item = [[NSPasteboardItem alloc] init];
            if (has_text) {
                NSString *value = OpenDeskClipboardString(text, text_size);
                if (value == nil || ![item setString:value forType:NSPasteboardTypeString]) return OPENDESK_CLIPBOARD_WRITE_FAILED;
            }
            if (has_html) {
                NSString *value = OpenDeskClipboardString(html, html_size);
                if (value == nil || ![item setString:value forType:NSPasteboardTypeHTML]) return OPENDESK_CLIPBOARD_WRITE_FAILED;
            }
            if (has_rtf) {
                NSData *value = [NSData dataWithBytes:rtf length:(NSUInteger)rtf_size];
                if (![item setData:value forType:NSPasteboardTypeRTF]) return OPENDESK_CLIPBOARD_WRITE_FAILED;
            }
            if (has_png) {
                NSData *value = [NSData dataWithBytes:png length:(NSUInteger)png_size];
                if (![item setData:value forType:NSPasteboardTypePNG]) return OPENDESK_CLIPBOARD_WRITE_FAILED;
            }
            [objects addObject:item];
        }
        if (has_files) {
            if (files_json == NULL) return OPENDESK_CLIPBOARD_SERIALIZATION_FAILED;
            NSData *jsonData = [NSData dataWithBytes:files_json length:strlen(files_json)];
            NSError *error = nil;
            NSArray *paths = [NSJSONSerialization JSONObjectWithData:jsonData options:0 error:&error];
            if (![paths isKindOfClass:[NSArray class]] || error != nil) return OPENDESK_CLIPBOARD_SERIALIZATION_FAILED;
            for (id path in paths) {
                if (![path isKindOfClass:[NSString class]]) return OPENDESK_CLIPBOARD_SERIALIZATION_FAILED;
                [objects addObject:[NSURL fileURLWithPath:path]];
            }
        }
        if (objects.count == 0) return OPENDESK_CLIPBOARD_WRITE_FAILED;
        NSInteger count = [pasteboard clearContents];
        if (![pasteboard writeObjects:objects]) return OPENDESK_CLIPBOARD_WRITE_FAILED;
        *change_count = (int64_t)MAX(count, pasteboard.changeCount);
        return 0;
    }
}

int32_t opendesk_clipboard_clear(int64_t *change_count) {
    if (change_count == NULL) return OPENDESK_CLIPBOARD_WRITE_FAILED;
    @autoreleasepool {
        NSPasteboard *pasteboard = [NSPasteboard generalPasteboard];
        if (pasteboard == nil) return OPENDESK_CLIPBOARD_WRITE_FAILED;
        *change_count = (int64_t)[pasteboard clearContents];
        return 0;
    }
}
