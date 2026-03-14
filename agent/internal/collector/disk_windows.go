//go:build windows

package collector

import (
	"os/exec"
	"strconv"
	"strings"
)

func CollectDisk() []DiskInfo {
	out, err := exec.Command("powershell", "-NoProfile", "-Command",
		"Get-CimInstance Win32_LogicalDisk -Filter \"DriveType=3\" | ForEach-Object { Write-Output \"$($_.DeviceID) $($_.Size) $($_.FreeSpace)\" }").Output()
	if err != nil {
		return nil
	}

	var disks []DiskInfo
	for _, line := range strings.Split(strings.TrimSpace(string(out)), "\n") {
		fields := strings.Fields(strings.TrimSpace(line))
		if len(fields) < 3 {
			continue
		}

		totalBytes, _ := strconv.ParseFloat(fields[1], 64)
		freeBytes, _ := strconv.ParseFloat(fields[2], 64)
		usedBytes := totalBytes - freeBytes
		totalGB := totalBytes / (1024 * 1024 * 1024)
		usedGB := usedBytes / (1024 * 1024 * 1024)
		usagePct := 0.0
		if totalBytes > 0 {
			usagePct = (usedBytes / totalBytes) * 100.0
		}

		disks = append(disks, DiskInfo{
			Mountpoint:   fields[0],
			TotalGB:      totalGB,
			UsedGB:       usedGB,
			UsagePercent: usagePct,
		})
	}

	return disks
}
