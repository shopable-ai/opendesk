/// <reference path="../../../types/NativeExtension.d.ts" />

NativeExtensions.list();
// @ts-expect-error core declarations do not pretend optional plugins are installed
NativeExtensions.goBasic.hello({ name: "OpenDesk" });
