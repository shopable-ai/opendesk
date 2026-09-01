//go:build !darwin

package main

func startMacOSAppStatusItem(string) {}

func reportMacOSAppStartupFailure(error) {}
