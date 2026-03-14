//go:build windows

package collector

import (
	"os/exec"
	"strconv"
	"strings"
)

func CollectMemory() MemoryInfo {
	out, err := exec.Command("powershell", "-NoProfile", "-Command",
		"$os = Get-CimInstance Win32_OperatingSystem; Write-Output \"$($os.TotalVisibleMemorySize) $($os.FreePhysicalMemory)\"").Output()
	if err != nil {
		return MemoryInfo{}
	}

	fields := strings.Fields(strings.TrimSpace(string(out)))
	if len(fields) < 2 {
		return MemoryInfo{}
	}

	totalKB, _ := strconv.ParseFloat(fields[0], 64)
	freeKB, _ := strconv.ParseFloat(fields[1], 64)
	usedKB := totalKB - freeKB

	totalMB := totalKB / 1024.0
	usedMB := usedKB / 1024.0
	usagePercent := 0.0
	if totalKB > 0 {
		usagePercent = (usedKB / totalKB) * 100.0
	}

	return MemoryInfo{
		TotalMB:      totalMB,
		UsedMB:       usedMB,
		UsagePercent: usagePercent,
	}
}
