#import <AudioToolbox/AudioHardwareService.h>
#import <CoreAudio/CoreAudio.h>
#import <Foundation/Foundation.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>

#define OPENDESK_AUDIO_NO_DEFAULT -71000
#define OPENDESK_AUDIO_UNSUPPORTED -71001
#define OPENDESK_AUDIO_NOT_SETTABLE -71002
#define OPENDESK_AUDIO_SERIALIZATION_FAILED -71003

static AudioObjectPropertyAddress OpenDeskAudioAddress(AudioObjectPropertySelector selector,
                                                       AudioObjectPropertyScope scope) {
    AudioObjectPropertyAddress address = {selector, scope, kAudioObjectPropertyElementMain};
    return address;
}

static int32_t OpenDeskAudioDefaultDevice(BOOL input, AudioDeviceID *deviceID) {
    if (deviceID == NULL) return kAudioHardwareIllegalOperationError;
    AudioObjectPropertyAddress address = OpenDeskAudioAddress(
        input ? kAudioHardwarePropertyDefaultInputDevice : kAudioHardwarePropertyDefaultOutputDevice,
        kAudioObjectPropertyScopeGlobal);
    UInt32 size = sizeof(*deviceID);
    OSStatus status = AudioObjectGetPropertyData(kAudioObjectSystemObject, &address, 0, NULL, &size, deviceID);
    if (status != noErr) return status;
    if (*deviceID == kAudioObjectUnknown) return OPENDESK_AUDIO_NO_DEFAULT;
    return noErr;
}

static BOOL OpenDeskAudioPropertyReadable(AudioDeviceID deviceID,
                                          AudioObjectPropertySelector selector,
                                          AudioObjectPropertyScope scope) {
    AudioObjectPropertyAddress address = OpenDeskAudioAddress(selector, scope);
    return AudioObjectHasProperty(deviceID, &address);
}

static BOOL OpenDeskAudioPropertyWritable(AudioDeviceID deviceID,
                                          AudioObjectPropertySelector selector,
                                          AudioObjectPropertyScope scope) {
    AudioObjectPropertyAddress address = OpenDeskAudioAddress(selector, scope);
    if (!AudioObjectHasProperty(deviceID, &address)) return NO;
    Boolean settable = false;
    return AudioObjectIsPropertySettable(deviceID, &address, &settable) == noErr && settable;
}

static int32_t OpenDeskAudioGetFloat(AudioDeviceID deviceID,
                                     AudioObjectPropertySelector selector,
                                     AudioObjectPropertyScope scope,
                                     Float32 *value) {
    AudioObjectPropertyAddress address = OpenDeskAudioAddress(selector, scope);
    if (!AudioObjectHasProperty(deviceID, &address)) return OPENDESK_AUDIO_UNSUPPORTED;
    UInt32 size = sizeof(*value);
    return AudioObjectGetPropertyData(deviceID, &address, 0, NULL, &size, value);
}

static int32_t OpenDeskAudioSetFloat(AudioDeviceID deviceID,
                                     AudioObjectPropertySelector selector,
                                     AudioObjectPropertyScope scope,
                                     Float32 value) {
    AudioObjectPropertyAddress address = OpenDeskAudioAddress(selector, scope);
    if (!AudioObjectHasProperty(deviceID, &address)) return OPENDESK_AUDIO_UNSUPPORTED;
    Boolean settable = false;
    OSStatus status = AudioObjectIsPropertySettable(deviceID, &address, &settable);
    if (status != noErr) return status;
    if (!settable) return OPENDESK_AUDIO_NOT_SETTABLE;
    UInt32 size = sizeof(value);
    return AudioObjectSetPropertyData(deviceID, &address, 0, NULL, size, &value);
}

static int32_t OpenDeskAudioGetUInt32(AudioDeviceID deviceID,
                                      AudioObjectPropertySelector selector,
                                      AudioObjectPropertyScope scope,
                                      UInt32 *value) {
    AudioObjectPropertyAddress address = OpenDeskAudioAddress(selector, scope);
    if (!AudioObjectHasProperty(deviceID, &address)) return OPENDESK_AUDIO_UNSUPPORTED;
    UInt32 size = sizeof(*value);
    return AudioObjectGetPropertyData(deviceID, &address, 0, NULL, &size, value);
}

static int32_t OpenDeskAudioSetUInt32(AudioDeviceID deviceID,
                                      AudioObjectPropertySelector selector,
                                      AudioObjectPropertyScope scope,
                                      UInt32 value) {
    AudioObjectPropertyAddress address = OpenDeskAudioAddress(selector, scope);
    if (!AudioObjectHasProperty(deviceID, &address)) return OPENDESK_AUDIO_UNSUPPORTED;
    Boolean settable = false;
    OSStatus status = AudioObjectIsPropertySettable(deviceID, &address, &settable);
    if (status != noErr) return status;
    if (!settable) return OPENDESK_AUDIO_NOT_SETTABLE;
    UInt32 size = sizeof(value);
    return AudioObjectSetPropertyData(deviceID, &address, 0, NULL, size, &value);
}

int32_t opendesk_audio_default_device(int input, uint32_t *device_id) {
    return OpenDeskAudioDefaultDevice(input != 0, device_id);
}

int32_t opendesk_audio_get_volume(double *value) {
    if (value == NULL) return kAudioHardwareIllegalOperationError;
    AudioDeviceID deviceID = kAudioObjectUnknown;
    int32_t status = OpenDeskAudioDefaultDevice(NO, &deviceID);
    if (status != noErr) return status;
    Float32 volume = 0;
    status = OpenDeskAudioGetFloat(deviceID, kAudioHardwareServiceDeviceProperty_VirtualMainVolume,
                                   kAudioObjectPropertyScopeOutput, &volume);
    if (status == noErr) *value = volume;
    return status;
}

int32_t opendesk_audio_set_volume(double value, double *readback) {
    if (readback == NULL) return kAudioHardwareIllegalOperationError;
    AudioDeviceID deviceID = kAudioObjectUnknown;
    int32_t status = OpenDeskAudioDefaultDevice(NO, &deviceID);
    if (status != noErr) return status;
    status = OpenDeskAudioSetFloat(deviceID, kAudioHardwareServiceDeviceProperty_VirtualMainVolume,
                                   kAudioObjectPropertyScopeOutput, (Float32)value);
    if (status != noErr) return status;
    return opendesk_audio_get_volume(readback);
}

int32_t opendesk_audio_get_mute(int *muted) {
    if (muted == NULL) return kAudioHardwareIllegalOperationError;
    AudioDeviceID deviceID = kAudioObjectUnknown;
    int32_t status = OpenDeskAudioDefaultDevice(NO, &deviceID);
    if (status != noErr) return status;
    UInt32 value = 0;
    status = OpenDeskAudioGetUInt32(deviceID, kAudioDevicePropertyMute,
                                    kAudioObjectPropertyScopeOutput, &value);
    if (status == noErr) *muted = value != 0;
    return status;
}

int32_t opendesk_audio_set_mute(int muted, int *readback) {
    if (readback == NULL) return kAudioHardwareIllegalOperationError;
    AudioDeviceID deviceID = kAudioObjectUnknown;
    int32_t status = OpenDeskAudioDefaultDevice(NO, &deviceID);
    if (status != noErr) return status;
    status = OpenDeskAudioSetUInt32(deviceID, kAudioDevicePropertyMute,
                                    kAudioObjectPropertyScopeOutput, muted != 0 ? 1 : 0);
    if (status != noErr) return status;
    return opendesk_audio_get_mute(readback);
}

static NSString *OpenDeskAudioStringProperty(AudioDeviceID deviceID,
                                             AudioObjectPropertySelector selector) {
    AudioObjectPropertyAddress address = OpenDeskAudioAddress(selector, kAudioObjectPropertyScopeGlobal);
    if (!AudioObjectHasProperty(deviceID, &address)) return @"";
    CFStringRef value = NULL;
    UInt32 size = sizeof(value);
    if (AudioObjectGetPropertyData(deviceID, &address, 0, NULL, &size, &value) != noErr || value == NULL) {
        return @"";
    }
    NSString *result = [NSString stringWithString:(__bridge NSString *)value];
    CFRelease(value);
    return result;
}

static UInt32 OpenDeskAudioUInt32Property(AudioDeviceID deviceID,
                                          AudioObjectPropertySelector selector,
                                          UInt32 fallback) {
    UInt32 value = fallback;
    AudioObjectPropertyAddress address = OpenDeskAudioAddress(selector, kAudioObjectPropertyScopeGlobal);
    UInt32 size = sizeof(value);
    if (!AudioObjectHasProperty(deviceID, &address) ||
        AudioObjectGetPropertyData(deviceID, &address, 0, NULL, &size, &value) != noErr) {
        return fallback;
    }
    return value;
}

static UInt32 OpenDeskAudioChannelCount(AudioDeviceID deviceID, AudioObjectPropertyScope scope) {
    AudioObjectPropertyAddress address = OpenDeskAudioAddress(kAudioDevicePropertyStreamConfiguration, scope);
    UInt32 size = 0;
    if (!AudioObjectHasProperty(deviceID, &address) ||
        AudioObjectGetPropertyDataSize(deviceID, &address, 0, NULL, &size) != noErr || size == 0) {
        return 0;
    }
    AudioBufferList *list = malloc(size);
    if (list == NULL) return 0;
    UInt32 channels = 0;
    if (AudioObjectGetPropertyData(deviceID, &address, 0, NULL, &size, list) == noErr) {
        for (UInt32 index = 0; index < list->mNumberBuffers; index++) {
            channels += list->mBuffers[index].mNumberChannels;
        }
    }
    free(list);
    return channels;
}

static NSString *OpenDeskAudioFourCC(UInt32 value) {
    char text[5] = {
        (char)((value >> 24) & 0xff), (char)((value >> 16) & 0xff),
        (char)((value >> 8) & 0xff), (char)(value & 0xff), '\0'
    };
    for (int index = 0; index < 4; index++) {
        if (text[index] < 32 || text[index] > 126) text[index] = '?';
    }
    return [NSString stringWithUTF8String:text] ?: @"????";
}

int32_t opendesk_audio_devices_json(char **json) {
    if (json == NULL) return kAudioHardwareIllegalOperationError;
    *json = NULL;
    AudioObjectPropertyAddress address = OpenDeskAudioAddress(kAudioHardwarePropertyDevices,
                                                              kAudioObjectPropertyScopeGlobal);
    UInt32 size = 0;
    OSStatus status = AudioObjectGetPropertyDataSize(kAudioObjectSystemObject, &address, 0, NULL, &size);
    if (status != noErr) return status;
    AudioDeviceID *deviceIDs = malloc(size);
    if (deviceIDs == NULL && size > 0) return kAudioHardwareUnspecifiedError;
    status = AudioObjectGetPropertyData(kAudioObjectSystemObject, &address, 0, NULL, &size, deviceIDs);
    if (status != noErr) {
        free(deviceIDs);
        return status;
    }

    AudioDeviceID defaultInput = kAudioObjectUnknown;
    AudioDeviceID defaultOutput = kAudioObjectUnknown;
    OpenDeskAudioDefaultDevice(YES, &defaultInput);
    OpenDeskAudioDefaultDevice(NO, &defaultOutput);

    @autoreleasepool {
        NSMutableArray *items = [NSMutableArray array];
        UInt32 count = size / sizeof(AudioDeviceID);
        for (UInt32 index = 0; index < count; index++) {
            AudioDeviceID deviceID = deviceIDs[index];
            UInt32 inputChannels = OpenDeskAudioChannelCount(deviceID, kAudioObjectPropertyScopeInput);
            UInt32 outputChannels = OpenDeskAudioChannelCount(deviceID, kAudioObjectPropertyScopeOutput);
            BOOL volumeRead = outputChannels > 0 && OpenDeskAudioPropertyReadable(
                deviceID, kAudioHardwareServiceDeviceProperty_VirtualMainVolume, kAudioObjectPropertyScopeOutput);
            BOOL volumeWrite = outputChannels > 0 && OpenDeskAudioPropertyWritable(
                deviceID, kAudioHardwareServiceDeviceProperty_VirtualMainVolume, kAudioObjectPropertyScopeOutput);
            BOOL muteRead = outputChannels > 0 && OpenDeskAudioPropertyReadable(
                deviceID, kAudioDevicePropertyMute, kAudioObjectPropertyScopeOutput);
            BOOL muteWrite = outputChannels > 0 && OpenDeskAudioPropertyWritable(
                deviceID, kAudioDevicePropertyMute, kAudioObjectPropertyScopeOutput);
            UInt32 transport = OpenDeskAudioUInt32Property(deviceID, kAudioDevicePropertyTransportType, 0);
            UInt32 alive = OpenDeskAudioUInt32Property(deviceID, kAudioDevicePropertyDeviceIsAlive, 1);
            [items addObject:@{
                @"id": @(deviceID),
                @"uid": OpenDeskAudioStringProperty(deviceID, kAudioDevicePropertyDeviceUID),
                @"name": OpenDeskAudioStringProperty(deviceID, kAudioObjectPropertyName),
                @"manufacturer": OpenDeskAudioStringProperty(deviceID, kAudioObjectPropertyManufacturer),
                @"transport": OpenDeskAudioFourCC(transport),
                @"inputChannels": @(inputChannels),
                @"outputChannels": @(outputChannels),
                @"alive": [NSNumber numberWithBool:(alive != 0)],
                @"defaultInput": [NSNumber numberWithBool:(deviceID == defaultInput)],
                @"defaultOutput": [NSNumber numberWithBool:(deviceID == defaultOutput)],
                @"volumeRead": [NSNumber numberWithBool:volumeRead],
                @"volumeWrite": [NSNumber numberWithBool:volumeWrite],
                @"muteRead": [NSNumber numberWithBool:muteRead],
                @"muteWrite": [NSNumber numberWithBool:muteWrite]
            }];
        }
        free(deviceIDs);
        NSError *error = nil;
        NSData *data = [NSJSONSerialization dataWithJSONObject:items options:0 error:&error];
        if (data == nil || error != nil) return OPENDESK_AUDIO_SERIALIZATION_FAILED;
        char *result = malloc(data.length + 1);
        if (result == NULL) return kAudioHardwareUnspecifiedError;
        memcpy(result, data.bytes, data.length);
        result[data.length] = '\0';
        *json = result;
    }
    return noErr;
}

int32_t opendesk_audio_default_output_capabilities(int *volume_read, int *volume_write,
                                                   int *mute_read, int *mute_write) {
    if (volume_read == NULL || volume_write == NULL || mute_read == NULL || mute_write == NULL) {
        return kAudioHardwareIllegalOperationError;
    }
    *volume_read = *volume_write = *mute_read = *mute_write = 0;
    AudioDeviceID deviceID = kAudioObjectUnknown;
    int32_t status = OpenDeskAudioDefaultDevice(NO, &deviceID);
    if (status != noErr) return status;
    *volume_read = OpenDeskAudioPropertyReadable(
        deviceID, kAudioHardwareServiceDeviceProperty_VirtualMainVolume, kAudioObjectPropertyScopeOutput);
    *volume_write = OpenDeskAudioPropertyWritable(
        deviceID, kAudioHardwareServiceDeviceProperty_VirtualMainVolume, kAudioObjectPropertyScopeOutput);
    *mute_read = OpenDeskAudioPropertyReadable(
        deviceID, kAudioDevicePropertyMute, kAudioObjectPropertyScopeOutput);
    *mute_write = OpenDeskAudioPropertyWritable(
        deviceID, kAudioDevicePropertyMute, kAudioObjectPropertyScopeOutput);
    return noErr;
}
