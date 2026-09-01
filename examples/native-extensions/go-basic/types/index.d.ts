declare global {
  interface GoBasicNativeExtension {
    readonly hello: OpenDeskNativeExtensionMethod<{ name: string }, { message: string }>;
    readonly add: OpenDeskNativeExtensionMethod<{ a: number; b: number }, { value: number }>;
  }

  interface OpenDeskNativeExtensionNamespaceMap {
    readonly goBasic: GoBasicNativeExtension;
  }

  interface OpenDeskNativeExtensionPluginById {
    readonly "com.example.go-basic": GoBasicNativeExtension;
  }
}

export {};
