package automation

import (
	"fmt"
	"os"

	"github.com/dop251/goja"
	"opendesk/pkg/runtimeenv"
)

// registerSystemEnvironment exposes narrow, execution-scoped accessors over
// the same immutable snapshot registered as Execution.env. It never performs
// a fresh os.Environ read for a non-nil execution environment, including the
// intentionally empty maps supplied by remote entrypoints.
func registerSystemEnvironment(runtimeValue *goja.Runtime, environment map[string]string, methods map[string]interface{}) error {
	if runtimeValue == nil {
		return fmt.Errorf("System environment runtime is required")
	}
	if methods == nil {
		return fmt.Errorf("System methods are required")
	}

	var snapshot map[string]string
	var err error
	if environment == nil {
		snapshot = runtimeenv.FromEnviron(os.Environ())
	} else {
		snapshot, err = runtimeenv.Clone(environment)
		if err != nil {
			return fmt.Errorf("normalize System environment: %w", err)
		}
	}

	methods["getEnv"] = func(call goja.FunctionCall) goja.Value {
		if len(call.Arguments) < 1 || len(call.Arguments) > 2 {
			panic(runtimeValue.NewTypeError("System.getEnv requires a name and accepts one optional string fallback"))
		}
		name := systemEnvironmentName(runtimeValue, call.Argument(0), "System.getEnv")
		if value, found := runtimeenv.Lookup(snapshot, name); found {
			return runtimeValue.ToValue(value)
		}
		if len(call.Arguments) == 2 {
			fallback, ok := call.Argument(1).Export().(string)
			if !ok {
				panic(runtimeValue.NewTypeError("System.getEnv fallback must be a string"))
			}
			return runtimeValue.ToValue(fallback)
		}
		return goja.Undefined()
	}

	methods["hasEnv"] = func(call goja.FunctionCall) goja.Value {
		if len(call.Arguments) != 1 {
			panic(runtimeValue.NewTypeError("System.hasEnv requires exactly one name"))
		}
		name := systemEnvironmentName(runtimeValue, call.Argument(0), "System.hasEnv")
		_, found := runtimeenv.Lookup(snapshot, name)
		return runtimeValue.ToValue(found)
	}
	return nil
}

func systemEnvironmentName(runtimeValue *goja.Runtime, value goja.Value, operation string) string {
	name, ok := value.Export().(string)
	if !ok || !runtimeenv.ValidName(name) {
		panic(runtimeValue.NewTypeError(operation + " name must match [A-Za-z_][A-Za-z0-9_]*"))
	}
	return name
}
