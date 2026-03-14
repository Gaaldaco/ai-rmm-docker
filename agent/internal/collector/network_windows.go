//go:build windows

package collector

import (
	"os/exec"
	"strconv"
	"strings"
)

func CollectNetwork() []NetworkInfo {
	out, err := exec.Command("powershell", "-NoProfile", "-Command",
		"Get-NetAdapterStatistics | ForEach-Object { Write-Output \"$($_.Name) $($_.SentBytes) $($_.ReceivedBytes)\" }").Output()
	if err != nil {
		return nil
	}

	var interfaces []NetworkInfo
	for _, line := range strings.Split(strings.TrimSpace(string(out)), "\n") {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}

		// Name may contain spaces, so parse from the end
		fields := strings.Fields(line)
		if len(fields) < 3 {
			continue
		}

		bytesRecv, _ := strconv.ParseUint(fields[len(fields)-1], 10, 64)
		bytesSent, _ := strconv.ParseUint(fields[len(fields)-2], 10, 64)
		name := strings.Join(fields[:len(fields)-2], " ")

		if strings.EqualFold(name, "Loopback") {
			continue
		}

		interfaces = append(interfaces, NetworkInfo{
			Interface: name,
			BytesSent: bytesSent,
			BytesRecv: bytesRecv,
		})
	}

	return interfaces
}
