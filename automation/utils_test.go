package automation

import (
	"reflect"
	"testing"

	"github.com/dop251/goja"
)

type bytesReturner struct{}

func (b *bytesReturner) GetBytes() []byte {
	return []byte{1, 2, 3}
}

func TestCreateJSMethodWrapperReturnsArrayBufferForBytes(t *testing.T) {
	runtime := goja.New()
	wrapper := createJSMethodWrapper(runtime, reflectValueOf(&bytesReturner{}), reflectTypeMethodOf(&bytesReturner{}, "GetBytes"))
	value := wrapper(goja.FunctionCall{})

	obj := value.ToObject(runtime)
	if obj == nil {
		t.Fatalf("expected object result")
	}
	exported := obj.Export()
	buffer, ok := exported.(goja.ArrayBuffer)
	if !ok {
		t.Fatalf("expected ArrayBuffer export, got %T", exported)
	}
	bytes := buffer.Bytes()
	if len(bytes) != 3 || bytes[0] != 1 || bytes[1] != 2 || bytes[2] != 3 {
		t.Fatalf("unexpected bytes: %v", bytes)
	}
}

func reflectValueOf(v interface{}) reflect.Value {
	return reflect.ValueOf(v)
}

func reflectTypeMethodOf(v interface{}, name string) reflect.Method {
	method, ok := reflect.TypeOf(v).MethodByName(name)
	if !ok {
		panic("method not found: " + name)
	}
	return method
}
