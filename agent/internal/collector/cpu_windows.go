//go:build windows

package collector

import (
	"os/exec"
	"runtime"
	"strconv"
	"strings"
)

func CollectCPU() CPUInfo {
	cores := runtime.NumCPU()
	usage := getWindowsCPUUsage()

	return CPUInfo{
		UsagePercent: usage,
		Cores:        cores,
		LoadAvg:      nil, // Windows doesn't have load average
	}
}

func getWindowsCPUUsage() float64 {
	out, err := exec.Command("powershell", "-NoProfile", "-Command",
		"(Get-CimInstance Win32_Processor | Measure-Object -Property LoadPercentage -Average).Average").Output()
	if err != nil {
		return 0
	}
	usage, _ := strconv.ParseFloat(strings.TrimSpace(string(out)), 64)
	return usage
}
