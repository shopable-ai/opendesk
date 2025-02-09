package automation

import (
	"encoding/json"
	"fmt"
	"path/filepath"
	"runtime"
	"time"

	"github.com/fatih/color"
)

type Console struct{}

func NewConsole() *Console {
	return &Console{}
}

// formatArgs formats arguments, converting objects to JSON
func formatArgs(args ...interface{}) []interface{} {
	formattedArgs := make([]interface{}, len(args))
	for i, arg := range args {
		switch v := arg.(type) {
		case string, int, int64, float64, bool:
			formattedArgs[i] = v
		default:
			// Try to marshal non-primitive types to JSON
			jsonData, err := json.MarshalIndent(v, "", "  ")
			if err != nil {
				formattedArgs[i] = fmt.Sprintf("%+v", v)
			} else {
				formattedArgs[i] = string(jsonData)
			}
		}
	}
	return formattedArgs
}

// Log 普通日志打印
func (c *Console) Log(args ...interface{}) {
	prefix := color.BlueString("[LOG]")
	timeStr := time.Now().Format("15:04:05.000")
	location := getFileAndLine()
	fmt.Printf("%s %s %s: ", prefix, timeStr, location)
	fmt.Println(formatArgs(args...)...)
}

// Info 信息日志
func (c *Console) Info(args ...interface{}) {
	prefix := color.GreenString("[INFO]")
	timeStr := time.Now().Format("15:04:05.000")
	location := getFileAndLine()
	fmt.Printf("%s %s %s: ", prefix, timeStr, location)
	fmt.Println(formatArgs(args...)...)
}

// Warn 警告日志
func (c *Console) Warn(args ...interface{}) {
	prefix := color.YellowString("[WARN]")
	timeStr := time.Now().Format("15:04:05.000")
	location := getFileAndLine()
	fmt.Printf("%s %s %s: ", prefix, timeStr, location)
	fmt.Println(formatArgs(args...)...)
}

// Error 错误日志
func (c *Console) Error(args ...interface{}) {
	prefix := color.RedString("[ERROR]")
	timeStr := time.Now().Format("15:04:05.000")
	location := getFileAndLine()
	fmt.Printf("%s %s %s: ", prefix, timeStr, location)
	fmt.Println(formatArgs(args...)...)
}

// Debug 调试日志
func (c *Console) Debug(args ...interface{}) {
	prefix := color.CyanString("[DEBUG]")
	timeStr := time.Now().Format("15:04:05.000")
	location := getFileAndLine()
	fmt.Printf("%s %s %s: ", prefix, timeStr, location)
	fmt.Println(formatArgs(args...)...)
}

// Table 打印表格形式的数据
func (c *Console) Table(data interface{}) {
	prefix := color.BlueString("[TABLE]")
	timeStr := time.Now().Format("15:04:05.000")
	location := getFileAndLine()
	fmt.Printf("%s %s %s:\n", prefix, timeStr, location)

	jsonData, err := json.MarshalIndent(data, "", "  ")
	if err != nil {
		c.Error("Failed to format table data:", err)
		return
	}
	fmt.Println(string(jsonData))
}

// Group 分组打印开始
func (c *Console) Group(label string) {
	prefix := color.MagentaString("[GROUP]")
	timeStr := time.Now().Format("15:04:05.000")
	location := getFileAndLine()
	fmt.Printf("%s %s %s: %s ▼\n", prefix, timeStr, location, label)
}

// GroupEnd 分组打印结束
func (c *Console) GroupEnd(label string) {
	prefix := color.MagentaString("[GROUP]")
	timeStr := time.Now().Format("15:04:05.000")
	location := getFileAndLine()
	fmt.Printf("%s %s %s: %s ▲\n", prefix, timeStr, location, label)
}

// Time 计时开始
func (c *Console) Time(label string) {
	prefix := color.CyanString("[TIME]")
	timeStr := time.Now().Format("15:04:05.000")
	location := getFileAndLine()
	fmt.Printf("%s %s %s: Start timing '%s'\n", prefix, timeStr, location, label)
}

// TimeEnd 计时结束
func (c *Console) TimeEnd(label string) {
	prefix := color.CyanString("[TIME]")
	timeStr := time.Now().Format("15:04:05.000")
	location := getFileAndLine()
	fmt.Printf("%s %s %s: End timing '%s'\n", prefix, timeStr, location, label)
}

// Clear 清除控制台
func (c *Console) Clear() {
	if runtime.GOOS == "windows" {
		fmt.Print("\033[H\033[2J")
	} else {
		fmt.Print("\033[H\033[2J\033[3J")
	}
}

// 获取调用位置的文件名和行号
func getFileAndLine() string {
	_, file, line, ok := runtime.Caller(2)
	if !ok {
		return "unknown:0"
	}
	fileName := filepath.Base(file)
	return fmt.Sprintf("%s:%d", fileName, line)
}
