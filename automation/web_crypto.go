package automation

import (
	"crypto/rand"
	"fmt"

	"github.com/dop251/goja"
)

const webCryptoMaxRandomBytes = 65536

var webCryptoIntegerTypedArrays = map[string]struct{}{
	"Int8Array":         {},
	"Uint8Array":        {},
	"Uint8ClampedArray": {},
	"Int16Array":        {},
	"Uint16Array":       {},
	"Int32Array":        {},
	"Uint32Array":       {},
	"BigInt64Array":     {},
	"BigUint64Array":    {},
}

func registerWebCrypto(runtimeValue *goja.Runtime) error {
	cryptoObject := runtimeValue.NewObject()
	if err := cryptoObject.Set("getRandomValues", func(call goja.FunctionCall) goja.Value {
		return webCryptoGetRandomValues(runtimeValue, call)
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

func webCryptoGetRandomValues(runtimeValue *goja.Runtime, call goja.FunctionCall) goja.Value {
	value := call.Argument(0)
	if goja.IsUndefined(value) || goja.IsNull(value) {
		panic(runtimeValue.NewTypeError("crypto.getRandomValues requires an integer TypedArray"))
	}

	object := value.ToObject(runtimeValue)
	constructor := object.Get("constructor")
	if goja.IsUndefined(constructor) || goja.IsNull(constructor) {
		panic(runtimeValue.NewTypeError("crypto.getRandomValues requires an integer TypedArray"))
	}
	constructorName := constructor.ToObject(runtimeValue).Get("name").String()
	if _, ok := webCryptoIntegerTypedArrays[constructorName]; !ok {
		panic(runtimeValue.NewTypeError("crypto.getRandomValues requires an integer TypedArray"))
	}

	bufferValue := object.Get("buffer")
	buffer, ok := bufferValue.Export().(goja.ArrayBuffer)
	if !ok {
		panic(runtimeValue.NewTypeError("crypto.getRandomValues requires an integer TypedArray"))
	}
	byteOffset := object.Get("byteOffset").ToInteger()
	byteLength := object.Get("byteLength").ToInteger()
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
