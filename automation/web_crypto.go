package automation

import (
	"crypto/rand"
	"fmt"
	"reflect"

	"github.com/dop251/goja"
)

const webCryptoMaxRandomBytes = 65536

var webCryptoIntegerTypedArrays = map[reflect.Type]struct{}{
	reflect.TypeOf([]int8(nil)):   {},
	reflect.TypeOf([]uint8(nil)):  {},
	reflect.TypeOf([]int16(nil)):  {},
	reflect.TypeOf([]uint16(nil)): {},
	reflect.TypeOf([]int32(nil)):  {},
	reflect.TypeOf([]uint32(nil)): {},
	reflect.TypeOf([]int64(nil)):  {},
	reflect.TypeOf([]uint64(nil)): {},
}

type webCryptoViewAccessors struct {
	buffer, byteOffset, byteLength goja.Callable
}

func registerWebCrypto(runtimeValue *goja.Runtime) error {
	// Capture the intrinsic getters before user code can replace prototypes or
	// shadow properties. They read TypedArray internal slots, not lookalikes.
	prototype := runtimeValue.Get("Uint8Array").ToObject(runtimeValue).Get("prototype").ToObject(runtimeValue).Prototype()
	describe, _ := goja.AssertFunction(runtimeValue.Get("Object").ToObject(runtimeValue).Get("getOwnPropertyDescriptor"))
	get := func(key goja.Value) (goja.Callable, error) {
		descriptor, err := describe(goja.Undefined(), prototype, key)
		if err != nil {
			return nil, err
		}
		getter, ok := goja.AssertFunction(descriptor.ToObject(runtimeValue).Get("get"))
		if !ok {
			return nil, fmt.Errorf("TypedArray intrinsic getter is unavailable")
		}
		return getter, nil
	}
	var accessors webCryptoViewAccessors
	for _, entry := range []struct {
		key         goja.Value
		destination *goja.Callable
	}{
		{runtimeValue.ToValue("buffer"), &accessors.buffer},
		{runtimeValue.ToValue("byteOffset"), &accessors.byteOffset},
		{runtimeValue.ToValue("byteLength"), &accessors.byteLength},
	} {
		getter, err := get(entry.key)
		if err != nil {
			return fmt.Errorf("failed to register crypto.getRandomValues: %w", err)
		}
		*entry.destination = getter
	}
	cryptoObject := runtimeValue.NewObject()
	if err := cryptoObject.Set("getRandomValues", func(call goja.FunctionCall) goja.Value {
		return webCryptoGetRandomValues(runtimeValue, call, accessors)
	}); err != nil {
		return fmt.Errorf("failed to register crypto.getRandomValues: %w", err)
	}
	if err := cryptoObject.Set("randomUUID", func(goja.FunctionCall) goja.Value {
		return runtimeValue.ToValue(webCryptoRandomUUID(runtimeValue))
	}); err != nil {
		return fmt.Errorf("failed to register crypto.randomUUID: %w", err)
	}
	if err := runtimeValue.Set("crypto", cryptoObject); err != nil {
		return fmt.Errorf("failed to register crypto: %w", err)
	}
	return nil
}

func webCryptoGetRandomValues(runtimeValue *goja.Runtime, call goja.FunctionCall, accessors webCryptoViewAccessors) goja.Value {
	value := call.Argument(0)
	if goja.IsUndefined(value) || goja.IsNull(value) {
		panic(runtimeValue.NewTypeError("crypto.getRandomValues requires an integer TypedArray"))
	}

	// Goja's intrinsic tag still reads the mutable constructor.name. ExportType
	// instead identifies its actual native element type; the intrinsic buffer
	// getter below additionally proves this is a real TypedArray view.
	if _, ok := webCryptoIntegerTypedArrays[value.ExportType()]; !ok {
		panic(runtimeValue.NewTypeError("crypto.getRandomValues requires an integer TypedArray"))
	}

	bufferValue, err := accessors.buffer(value)
	if err != nil {
		panic(runtimeValue.NewTypeError("crypto.getRandomValues requires an integer TypedArray"))
	}
	buffer, ok := bufferValue.Export().(goja.ArrayBuffer)
	if !ok {
		panic(runtimeValue.NewTypeError("crypto.getRandomValues requires an integer TypedArray"))
	}
	offset, offsetErr := accessors.byteOffset(value)
	length, lengthErr := accessors.byteLength(value)
	if offsetErr != nil || lengthErr != nil {
		panic(runtimeValue.NewTypeError("crypto.getRandomValues received an invalid TypedArray"))
	}
	byteOffset := offset.ToInteger()
	byteLength := length.ToInteger()
	if byteOffset < 0 || byteLength < 0 || byteLength > webCryptoMaxRandomBytes {
		message := fmt.Sprintf("crypto.getRandomValues accepts at most %d bytes", webCryptoMaxRandomBytes)
		rangeError, err := runtimeValue.New(runtimeValue.Get("RangeError").ToObject(runtimeValue), runtimeValue.ToValue(message))
		if err != nil {
			panic(runtimeValue.NewTypeError(message))
		}
		panic(rangeError)
	}
	bytes := buffer.Bytes()
	if byteOffset > int64(len(bytes)) || byteLength > int64(len(bytes))-byteOffset {
		panic(runtimeValue.NewTypeError("crypto.getRandomValues received a detached or invalid TypedArray"))
	}
	if _, err := rand.Read(bytes[byteOffset : byteOffset+byteLength]); err != nil {
		panic(runtimeValue.NewGoError(fmt.Errorf("crypto.getRandomValues failed: %w", err)))
	}
	return value
}

func webCryptoRandomUUID(runtimeValue *goja.Runtime) string {
	var bytes [16]byte
	if _, err := rand.Read(bytes[:]); err != nil {
		panic(runtimeValue.NewGoError(fmt.Errorf("crypto.randomUUID failed: %w", err)))
	}
	bytes[6] = (bytes[6] & 0x0f) | 0x40
	bytes[8] = (bytes[8] & 0x3f) | 0x80
	return fmt.Sprintf(
		"%08x-%04x-%04x-%04x-%012x",
		bytes[0:4], bytes[4:6], bytes[6:8], bytes[8:10], bytes[10:16],
	)
}
