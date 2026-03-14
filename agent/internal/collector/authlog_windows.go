//go:build windows

package collector

import (
	"os/exec"
	"strings"
)

func CollectAuthLogs() []AuthLogEntry {
	out, err := exec.Command("powershell", "-NoProfile", "-Command",
		`Get-WinEvent -LogName Security -FilterXPath "*[System[(EventID=4624 or EventID=4625)]]" -MaxEvents 100 -ErrorAction SilentlyContinue | ForEach-Object { $xml = [xml]$_.ToXml(); $data = $xml.Event.EventData.Data; $user = ($data | Where-Object { $_.Name -eq 'TargetUserName' }).'#text'; $ip = ($data | Where-Object { $_.Name -eq 'IpAddress' }).'#text'; $type = if($_.Id -eq 4624){'login_success'}else{'login_failed'}; $success = if($_.Id -eq 4624){'true'}else{'false'}; Write-Output "$($_.TimeCreated)|$type|$user|$ip|$success" }`).Output()
	if err != nil {
		return nil
	}

	var entries []AuthLogEntry
	for _, line := range strings.Split(strings.TrimSpace(string(out)), "\n") {
		parts := strings.SplitN(strings.TrimSpace(line), "|", 5)
		if len(parts) < 5 {
			continue
		}

		entries = append(entries, AuthLogEntry{
			Timestamp: strings.TrimSpace(parts[0]),
			Type:      strings.TrimSpace(parts[1]),
			User:      strings.TrimSpace(parts[2]),
			Source:    strings.TrimSpace(parts[3]),
			Success:   strings.TrimSpace(parts[4]) == "true",
		})
	}

	return entries
}
