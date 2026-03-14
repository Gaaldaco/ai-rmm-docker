//go:build windows

package collector

import (
	"os/exec"
	"strconv"
	"strings"
)

func CollectOpenPorts() []OpenPort {
	out, err := exec.Command("powershell", "-NoProfile", "-Command",
		"Get-NetTCPConnection -State Listen | ForEach-Object { $p = (Get-Process -Id $_.OwningProcess -ErrorAction SilentlyContinue).ProcessName; Write-Output \"$($_.LocalAddress) $($_.LocalPort) $p\" }").Output()
	if err != nil {
		return nil
	}

	var ports []OpenPort
	seen := make(map[int]bool)
	for _, line := range strings.Split(strings.TrimSpace(string(out)), "\n") {
		fields := strings.Fields(strings.TrimSpace(line))
		if len(fields) < 2 {
			continue
		}

		port, _ := strconv.Atoi(fields[1])
		if port == 0 || seen[port] {
			continue
		}
		seen[port] = true

		process := ""
		if len(fields) >= 3 {
			process = fields[2]
		}

		ports = append(ports, OpenPort{
			Port:     port,
			Protocol: "tcp",
			Process:  process,
			Address:  fields[0],
		})
	}

	return ports
}
