//go:build windows

package collector

import (
	"os/exec"
	"sort"
	"strconv"
	"strings"
)

func CollectProcesses() []ProcessInfo {
	out, err := exec.Command("powershell", "-NoProfile", "-Command",
		`Get-Process | Select-Object Id, ProcessName, CPU, @{N='MemMB';E={[math]::Round($_.WorkingSet64/1MB,1)}}, @{N='User';E={try{$_.GetOwner().User}catch{'SYSTEM'}}} | ForEach-Object { Write-Output "$($_.Id)|$($_.ProcessName)|$($_.CPU)|$($_.MemMB)|$($_.User)" }`).Output()
	if err != nil {
		return nil
	}

	// Get total physical memory for percentage calculation
	memOut, _ := exec.Command("powershell", "-NoProfile", "-Command",
		"[math]::Round((Get-CimInstance Win32_OperatingSystem).TotalVisibleMemorySize/1024,0)").Output()
	totalMemMB, _ := strconv.ParseFloat(strings.TrimSpace(string(memOut)), 64)
	if totalMemMB == 0 {
		totalMemMB = 1 // avoid division by zero
	}

	var processes []ProcessInfo
	for _, line := range strings.Split(strings.TrimSpace(string(out)), "\n") {
		parts := strings.SplitN(strings.TrimSpace(line), "|", 5)
		if len(parts) < 4 {
			continue
		}

		pid, _ := strconv.Atoi(parts[0])
		cpu, _ := strconv.ParseFloat(parts[2], 64)
		memMB, _ := strconv.ParseFloat(parts[3], 64)
		memPct := (memMB / totalMemMB) * 100.0

		user := ""
		if len(parts) >= 5 {
			user = parts[4]
		}

		processes = append(processes, ProcessInfo{
			PID:    pid,
			Name:   parts[1],
			CPU:    cpu,
			Memory: memPct,
			User:   user,
		})
	}

	// Sort by CPU descending, take top 50
	sort.Slice(processes, func(i, j int) bool {
		return processes[i].CPU > processes[j].CPU
	})

	if len(processes) > 50 {
		processes = processes[:50]
	}

	return processes
}
