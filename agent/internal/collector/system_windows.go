//go:build windows

package collector

import (
	"os"
	"os/exec"
	"runtime"
	"strings"
)

func CollectSystemInfo() SystemInfo {
	hostname, _ := os.Hostname()

	osInfo := "Windows"
	out, err := exec.Command("powershell", "-NoProfile", "-Command",
		"(Get-CimInstance Win32_OperatingSystem).Caption").Output()
	if err == nil {
		osInfo = strings.TrimSpace(string(out))
	}

	return SystemInfo{
		Hostname: hostname,
		OS:       osInfo,
		Arch:     runtime.GOARCH,
		Platform: "windows",
	}
}
