//go:build !darwin

package main

func startMacOSAppStatusItem(string, string) {}

func reportMacOSAppStartupFailure(error) {}
