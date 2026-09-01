package automation

import (
	"context"
	"crypto/sha256"
	"errors"
	"fmt"
	"math"
	"sort"
	"strings"
	"time"

	"github.com/dop251/goja"
	"opendesk/pkg/nativeextension"
)

// nativeExtensionsRuntime owns one frozen registry for one JavaScript Runtime.
// Discovery is inert: only a generated method closure can reach Host.Call.
type nativeExtensionsRuntime struct {
	runtime    *goja.Runtime
	context    context.Context
	sink       EventSink
	host       *nativeextension.Host
	registry   *nativeextension.Registry
	namespaces map[string]*goja.Object
}

func registerNativeExtensions(runtime *goja.Runtime, ctx context.Context, sink EventSink, roots []nativeextension.DiscoveryRoot) error {
	if runtime == nil {
		return fmt.Errorf("runtime is required")
	}
	if ctx == nil {
		ctx = context.Background()
	}
	registry, err := nativeextension.Discover(nativeextension.DiscoveryOptions{Roots: roots})
	if err != nil {
		return fmt.Errorf("discover Native Extensions: %w", err)
	}
	bridge := &nativeExtensionsRuntime{
		runtime: runtime, context: ctx, sink: sink, host: nativeextension.NewHost(),
		registry: registry, namespaces: make(map[string]*goja.Object),
	}
	bridge.emitDiscoveryEvidence()

	root := newNullPrototypeObject(runtime)
	if err := defineImmutableFunction(runtime, root, "list", bridge.list); err != nil {
		return err
	}
	if err := defineImmutableFunction(runtime, root, "get", bridge.get); err != nil {
		return err
	}
	if err := defineImmutableFunction(runtime, root, "diagnostics", bridge.diagnostics); err != nil {
		return err
	}

	for _, plugin := range registry.Plugins() {
		plugin := plugin
		namespace := newNullPrototypeObject(runtime)
		methodNames := make([]string, 0, len(plugin.Methods))
		for name := range plugin.Methods {
			methodNames = append(methodNames, name)
		}
		sort.Strings(methodNames)
		for _, name := range methodNames {
			method := plugin.Methods[name]
			closure := bridge.methodClosure(plugin, method)
			if err := defineImmutableFunction(runtime, namespace, name, closure); err != nil {
				return fmt.Errorf("define NativeExtensions.%s.%s: %w", plugin.Namespace, name, err)
			}
		}
		if err := freezeObject(runtime, namespace); err != nil {
			return fmt.Errorf("freeze NativeExtensions.%s: %w", plugin.Namespace, err)
		}
		if err := root.DefineDataProperty(plugin.Namespace, namespace, goja.FLAG_FALSE, goja.FLAG_FALSE, goja.FLAG_TRUE); err != nil {
			return fmt.Errorf("define NativeExtensions.%s: %w", plugin.Namespace, err)
		}
		bridge.namespaces[plugin.ID] = namespace
	}
	if err := freezeObject(runtime, root); err != nil {
		return fmt.Errorf("freeze NativeExtensions: %w", err)
	}
	if err := runtime.GlobalObject().DefineDataProperty("NativeExtensions", root, goja.FLAG_FALSE, goja.FLAG_FALSE, goja.FLAG_TRUE); err != nil {
		return fmt.Errorf("define NativeExtensions global: %w", err)
	}
	return nil
}

func newNullPrototypeObject(runtime *goja.Runtime) *goja.Object {
	object := runtime.NewObject()
	must(object.SetPrototype(nil))
	return object
}

func defineImmutableFunction(runtime *goja.Runtime, object *goja.Object, name string, function func(goja.FunctionCall) goja.Value) error {
	value := runtime.ToValue(function)
	if err := freezeObject(runtime, value.ToObject(runtime)); err != nil {
		return fmt.Errorf("freeze %s function: %w", name, err)
	}
	return object.DefineDataProperty(name, value, goja.FLAG_FALSE, goja.FLAG_FALSE, goja.FLAG_TRUE)
}

func freezeObject(runtime *goja.Runtime, object *goja.Object) error {
	objectConstructor := runtime.Get("Object").ToObject(runtime)
	freeze, ok := goja.AssertFunction(objectConstructor.Get("freeze"))
	if !ok {
		return fmt.Errorf("Object.freeze is unavailable")
	}
	_, err := freeze(goja.Undefined(), object)
	return err
}

func (n *nativeExtensionsRuntime) list(goja.FunctionCall) goja.Value {
	plugins := n.registry.Plugins()
	result := make([]map[string]any, 0, len(plugins))
	for _, plugin := range plugins {
		methods := make([]string, 0, len(plugin.Methods))
		for name := range plugin.Methods {
			methods = append(methods, name)
		}
		sort.Strings(methods)
		result = append(result, map[string]any{
			"id": plugin.ID, "version": plugin.Version, "namespace": plugin.Namespace,
			"rootKind": string(plugin.RootKind), "methods": methods,
			"executableSha256": plugin.ExecutableSHA256,
		})
	}
	return n.runtime.ToValue(result)
}

func (n *nativeExtensionsRuntime) get(call goja.FunctionCall) goja.Value {
	idValue := call.Argument(0)
	if goja.IsUndefined(idValue) || goja.IsNull(idValue) {
		n.throwRegistryError("invalid_params", "", "", "plugin id is required", nil)
	}
	id, ok := idValue.Export().(string)
	if !ok || strings.TrimSpace(id) != id || id == "" {
		n.throwRegistryError("invalid_params", "", "", "plugin id must be a canonical string", nil)
	}
	namespace, exists := n.namespaces[id]
	if !exists {
		n.throwRegistryError("unknown_plugin", id, "", "native extension plugin is not registered", nil)
	}
	return namespace
}

func (n *nativeExtensionsRuntime) diagnostics(goja.FunctionCall) goja.Value {
	diagnostics := n.registry.Diagnostics()
	result := make([]map[string]any, 0, len(diagnostics))
	for _, diagnostic := range diagnostics {
		result = append(result, map[string]any{
			"rootKind": string(diagnostic.RootKind), "pluginId": diagnostic.PluginID,
			"namespace": diagnostic.Namespace, "schemaVersion": diagnostic.SchemaVersion,
			"executable": diagnostic.Executable, "executableSha256": diagnostic.ExecutableSHA256,
			"status": diagnostic.Status, "errorCode": diagnostic.ErrorCode,
			"durationMs": diagnostic.DurationMS,
		})
	}
	return n.runtime.ToValue(result)
}

func (n *nativeExtensionsRuntime) methodClosure(plugin nativeextension.Plugin, method nativeextension.MethodBinding) func(goja.FunctionCall) goja.Value {
	// plugin and method are value copies. The closure never reads loop variables
	// or caller-supplied routing fields.
	return func(call goja.FunctionCall) goja.Value {
		params, timeout, optionErr := n.boundCallOptions(call, time.Duration(method.TimeoutMS)*time.Millisecond)
		if optionErr != nil {
			evidence := n.baseCallEvidence(plugin, method.Name)
			evidence["status"] = nativeextension.StatusFailed
			evidence["errorCode"] = optionErr.code
			n.emitCallEvidence(evidence)
			n.throwCallError(optionErr.code, plugin, method.Name, "", method.Name+": "+optionErr.message, evidence)
		}

		validatedPlugin, err := n.registry.ValidateArtifact(plugin.ID)
		if err != nil {
			code := "artifact_changed"
			var registryErr *nativeextension.RegistryError
			if errors.As(err, &registryErr) {
				code = registryErr.Code
			}
			evidence := n.baseCallEvidence(plugin, method.Name)
			evidence["status"] = nativeextension.StatusFailed
			evidence["errorCode"] = code
			n.emitCallEvidence(evidence)
			n.throwCallError(code, plugin, method.Name, "", method.Name+": native extension artifact validation failed", evidence)
		}

		result, err := n.host.Call(n.context, nativeextension.CallOptions{
			Executable: validatedPlugin.ExecutablePath,
			Method:     method.WireMethod,
			Params:     params,
			Timeout:    timeout,
		})
		evidence := n.callEvidence(plugin, method.Name, result.Evidence)
		if err == nil {
			n.emitCallEvidence(evidence)
			return n.runtime.ToValue(result.Result)
		}

		code := nativeextension.CodeProcessFailed
		extensionCode := ""
		message := "native extension call failed"
		var callErr *nativeextension.CallError
		if errors.As(err, &callErr) {
			code = callErr.Code
			if callErr.ExtensionError != nil {
				extensionCode = callErr.ExtensionError.Code
				rawMessage := []byte(callErr.ExtensionError.Message)
				digest := sha256.Sum256(rawMessage)
				evidence["extensionMessageBytes"] = len(rawMessage)
				evidence["extensionMessageSha256"] = fmt.Sprintf("%x", digest)
				message = "native extension returned an error"
			} else {
				message = callErr.Message
			}
		}
		n.emitCallEvidence(evidence)
		n.throwCallError(string(code), plugin, method.Name, extensionCode, message, evidence)
		return goja.Undefined()
	}
}

type boundCallOptionError struct {
	code    string
	message string
}

func (n *nativeExtensionsRuntime) boundCallOptions(call goja.FunctionCall, defaultTimeout time.Duration) (map[string]any, time.Duration, *boundCallOptionError) {
	params := map[string]any{}
	if argument := call.Argument(0); !goja.IsUndefined(argument) {
		if goja.IsNull(argument) {
			return nil, 0, &boundCallOptionError{code: "invalid_params", message: "params must be an object"}
		}
		exported, ok := argument.Export().(map[string]any)
		if !ok {
			return nil, 0, &boundCallOptionError{code: "invalid_params", message: "params must be an object"}
		}
		params = exported
	}
	if len(call.Arguments) > 2 {
		return nil, 0, &boundCallOptionError{code: "invalid_params", message: "only params and call options are accepted"}
	}
	timeout := defaultTimeout
	if optionsValue := call.Argument(1); !goja.IsUndefined(optionsValue) {
		if goja.IsNull(optionsValue) {
			return nil, 0, &boundCallOptionError{code: "invalid_params", message: "call options must be an object"}
		}
		options, ok := optionsValue.Export().(map[string]any)
		if !ok {
			return nil, 0, &boundCallOptionError{code: "invalid_params", message: "call options must be an object"}
		}
		for key := range options {
			if key != "timeoutMs" {
				return nil, 0, &boundCallOptionError{code: "invalid_params", message: "unknown call option " + key}
			}
		}
		if value, exists := options["timeoutMs"]; exists {
			milliseconds, valid := nativeExtensionMilliseconds(value)
			if !valid || math.IsNaN(milliseconds) || math.IsInf(milliseconds, 0) || milliseconds <= 0 || math.Trunc(milliseconds) != milliseconds || milliseconds > nativeextension.ManifestMaxTimeoutMS {
				return nil, 0, &boundCallOptionError{code: "invalid_params", message: fmt.Sprintf("timeoutMs must be an integer between 1 and %d", nativeextension.ManifestMaxTimeoutMS)}
			}
			timeout = time.Duration(milliseconds) * time.Millisecond
		}
	}
	return params, timeout, nil
}

func (n *nativeExtensionsRuntime) emitDiscoveryEvidence() {
	if n == nil || n.sink == nil {
		return
	}
	for _, diagnostic := range n.registry.Diagnostics() {
		level := "info"
		if diagnostic.Status == "rejected" || diagnostic.Status == "quarantined" {
			level = "warn"
		}
		n.sink.Emit("meta", level, "runtime", "native_extension_discovery", "native extension discovery result", map[string]any{
			"rootKind": string(diagnostic.RootKind), "pluginId": diagnostic.PluginID,
			"namespace": diagnostic.Namespace, "schemaVersion": diagnostic.SchemaVersion,
			"executable": diagnostic.Executable, "executableSha256": diagnostic.ExecutableSHA256,
			"status": diagnostic.Status, "errorCode": diagnostic.ErrorCode, "durationMs": diagnostic.DurationMS,
		})
	}
}

func (n *nativeExtensionsRuntime) baseCallEvidence(plugin nativeextension.Plugin, method string) map[string]any {
	return map[string]any{
		"pluginId": plugin.ID, "namespace": plugin.Namespace, "rootKind": string(plugin.RootKind),
		"executable": plugin.ExecutableRelative, "executableSha256": plugin.ExecutableSHA256,
		"method": method, "protocolVersion": plugin.ProtocolVersion,
		"startupDurationMs": int64(0), "durationMs": int64(0),
	}
}

func (n *nativeExtensionsRuntime) callEvidence(plugin nativeextension.Plugin, method string, host nativeextension.Evidence) map[string]any {
	evidence := n.baseCallEvidence(plugin, method)
	evidence["requestId"] = host.RequestID
	evidence["startupDurationMs"] = host.StartupDurationMS
	evidence["durationMs"] = host.DurationMS
	evidence["status"] = host.Status
	evidence["errorCode"] = string(host.ErrorCode)
	evidence["extensionErrorCode"] = host.ExtensionErrorCode
	evidence["stderrCapturedBytes"] = host.StderrCapturedBytes
	evidence["stderrSha256"] = host.StderrSHA256
	evidence["stderrTruncated"] = host.StderrTruncated
	if host.ExitCode != nil {
		evidence["exitCode"] = *host.ExitCode
	} else {
		evidence["exitCode"] = nil
	}
	return evidence
}

func (n *nativeExtensionsRuntime) emitCallEvidence(evidence map[string]any) {
	if n == nil || n.sink == nil {
		return
	}
	level := "info"
	message := "native extension call succeeded"
	if evidence["status"] != nativeextension.StatusSucceeded {
		level = "error"
		message = "native extension call failed"
	}
	n.sink.Emit("meta", level, "runtime", "native_extension_call", message, evidence)
}

func (n *nativeExtensionsRuntime) throwRegistryError(code, pluginID, namespace, message string, evidence map[string]any) {
	plugin := nativeextension.Plugin{ID: pluginID, Namespace: namespace}
	n.throwCallError(code, plugin, "", "", message, evidence)
}

func (n *nativeExtensionsRuntime) throwCallError(code string, plugin nativeextension.Plugin, method, extensionCode, message string, evidence map[string]any) {
	if message == "" {
		message = code
	}
	value := n.runtime.NewGoError(errors.New(message))
	must(value.Set("name", "NativeExtensionsError"))
	must(value.Set("code", code))
	must(value.Set("pluginId", plugin.ID))
	must(value.Set("namespace", plugin.Namespace))
	must(value.Set("method", method))
	must(value.Set("extensionCode", extensionCode))
	if evidence == nil {
		evidence = map[string]any{}
	}
	must(value.Set("evidence", evidence))
	panic(value)
}
