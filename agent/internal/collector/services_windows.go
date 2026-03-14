//go:build windows

package collector

import (
	"os/exec"
	"strings"
)

func CollectServices() []ServiceInfo {
	out, err := exec.Command("powershell", "-NoProfile", "-Command",
		"Get-Service | ForEach-Object { Write-Output \"$($_.Name)|$($_.Status)|$($_.StartType)\" }").Output()
	if err != nil {
		return nil
	}

	var services []ServiceInfo
	for _, line := range strings.Split(strings.TrimSpace(string(out)), "\n") {
		parts := strings.SplitN(strings.TrimSpace(line), "|", 3)
		if len(parts) < 3 {
			continue
		}

		status := "stopped"
		switch strings.TrimSpace(parts[1]) {
		case "Running":
			status = "running"
		case "Stopped":
			status = "stopped"
		default:
			status = strings.ToLower(strings.TrimSpace(parts[1]))
		}

		enabled := strings.TrimSpace(parts[2]) == "Automatic"

		services = append(services, ServiceInfo{
			Name:    strings.TrimSpace(parts[0]),
			Status:  status,
			Enabled: enabled,
		})
	}

	return services
}
