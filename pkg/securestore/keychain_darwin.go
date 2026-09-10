//go:build darwin && cgo

package securestore

/*
#cgo LDFLAGS: -framework Security -framework CoreFoundation -framework Foundation -framework LocalAuthentication
#include <CoreFoundation/CoreFoundation.h>
#include <Security/Security.h>
#include <stdlib.h>
#include <string.h>

OSStatus odSecItemCopyMatchingNoUI(CFDictionaryRef query, CFTypeRef *result);

static CFStringRef odString(const char *value, size_t length) {
	return CFStringCreateWithBytes(kCFAllocatorDefault, (const UInt8 *)value,
		(CFIndex)length, kCFStringEncodingUTF8, false);
}

static void odFreeSecret(unsigned char *value, size_t length) {
	if (value == NULL) return;
	volatile unsigned char *cursor = value;
	while (length-- > 0) *cursor++ = 0;
	free(value);
}

static OSStatus odKeychainLoad(
	const char *serviceValue, size_t serviceLength,
	const char *accountValue, size_t accountLength,
	unsigned char **output, size_t *outputLength
) {
	*output = NULL;
	*outputLength = 0;
	CFStringRef service = odString(serviceValue, serviceLength);
	CFStringRef account = odString(accountValue, accountLength);
	if (service == NULL || account == NULL) {
		if (service != NULL) CFRelease(service);
		if (account != NULL) CFRelease(account);
		return errSecAllocate;
	}
	const void *keys[] = {kSecClass, kSecAttrService, kSecAttrAccount,
		kSecReturnData, kSecMatchLimit};
	const void *values[] = {kSecClassGenericPassword, service, account,
		kCFBooleanTrue, kSecMatchLimitOne};
	CFDictionaryRef query = CFDictionaryCreate(kCFAllocatorDefault, keys, values, 5,
		&kCFTypeDictionaryKeyCallBacks, &kCFTypeDictionaryValueCallBacks);
	CFRelease(service);
	CFRelease(account);
	if (query == NULL) return errSecAllocate;
	CFTypeRef result = NULL;
	OSStatus status = odSecItemCopyMatchingNoUI(query, &result);
	CFRelease(query);
	if (status != errSecSuccess) return status;
	if (result == NULL || CFGetTypeID(result) != CFDataGetTypeID()) {
		if (result != NULL) CFRelease(result);
		return errSecDecode;
	}
	CFDataRef data = (CFDataRef)result;
	CFIndex length = CFDataGetLength(data);
	if (length <= 0 || length > 16384) {
		CFRelease(result);
		return errSecDecode;
	}
	unsigned char *copy = (unsigned char *)malloc((size_t)length);
	if (copy == NULL) {
		CFRelease(result);
		return errSecAllocate;
	}
	memcpy(copy, CFDataGetBytePtr(data), (size_t)length);
	CFRelease(result);
	*output = copy;
	*outputLength = (size_t)length;
	return errSecSuccess;
}

static OSStatus odKeychainCreate(
	const char *serviceValue, size_t serviceLength,
	const char *accountValue, size_t accountLength,
	const unsigned char *value, size_t valueLength
) {
	CFStringRef service = odString(serviceValue, serviceLength);
	CFStringRef account = odString(accountValue, accountLength);
	CFDataRef data = CFDataCreate(kCFAllocatorDefault, value, (CFIndex)valueLength);
	if (service == NULL || account == NULL || data == NULL) {
		if (service != NULL) CFRelease(service);
		if (account != NULL) CFRelease(account);
		if (data != NULL) CFRelease(data);
		return errSecAllocate;
	}
	const void *keys[] = {kSecClass, kSecAttrService, kSecAttrAccount, kSecValueData,
		kSecAttrAccessible, kSecAttrSynchronizable};
	const void *values[] = {kSecClassGenericPassword, service, account, data,
		kSecAttrAccessibleWhenUnlockedThisDeviceOnly, kCFBooleanFalse};
	CFDictionaryRef attributes = CFDictionaryCreate(kCFAllocatorDefault, keys, values, 6,
		&kCFTypeDictionaryKeyCallBacks, &kCFTypeDictionaryValueCallBacks);
	CFRelease(service);
	CFRelease(account);
	CFRelease(data);
	if (attributes == NULL) return errSecAllocate;
	OSStatus status = SecItemAdd(attributes, NULL);
	CFRelease(attributes);
	return status;
}
*/
import "C"

import (
	"context"
	"fmt"
	"unsafe"
)

type keychainStore struct {
	namespace string
}

func newPlatformStore(namespace string) (Store, error) {
	return &keychainStore{namespace: namespace}, nil
}

func (store *keychainStore) Load(ctx context.Context, name string) ([]byte, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	if err := validateName(name); err != nil {
		return nil, err
	}
	service := C.CString(store.namespace)
	account := C.CString(name)
	defer C.free(unsafe.Pointer(service))
	defer C.free(unsafe.Pointer(account))
	var data *C.uchar
	var length C.size_t
	status := C.odKeychainLoad(
		service, C.size_t(len(store.namespace)),
		account, C.size_t(len(name)), &data, &length,
	)
	if status == C.errSecItemNotFound {
		return nil, ErrNotFound
	}
	if status != C.errSecSuccess {
		return nil, fmt.Errorf("load macOS Keychain item: status %d", int32(status))
	}
	defer C.odFreeSecret(data, length)
	return C.GoBytes(unsafe.Pointer(data), C.int(length)), nil
}

func (store *keychainStore) Create(ctx context.Context, name string, value []byte) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	if err := validateName(name); err != nil {
		return err
	}
	if len(value) == 0 || len(value) > MaxValueSize {
		return fmt.Errorf("secure store value size is invalid")
	}
	service := C.CString(store.namespace)
	account := C.CString(name)
	defer C.free(unsafe.Pointer(service))
	defer C.free(unsafe.Pointer(account))
	status := C.odKeychainCreate(
		service, C.size_t(len(store.namespace)),
		account, C.size_t(len(name)),
		(*C.uchar)(unsafe.Pointer(&value[0])), C.size_t(len(value)),
	)
	if status == C.errSecDuplicateItem {
		return ErrAlreadyExists
	}
	if status != C.errSecSuccess {
		return fmt.Errorf("create macOS Keychain item: status %d", int32(status))
	}
	return nil
}
