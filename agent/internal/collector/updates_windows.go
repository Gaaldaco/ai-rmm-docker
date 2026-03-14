//go:build windows

package collector

import (
	"os/exec"
	"strings"
)

func CollectPendingUpdates() []UpdateInfo {
	out, err := exec.Command("powershell", "-NoProfile", "-Command",
		`$sess = New-Object -ComObject Microsoft.Update.Session; $search = $sess.CreateUpdateSearcher(); try { $result = $search.Search("IsInstalled=0"); $result.Updates | ForEach-Object { Write-Output "$($_.Title)" } } catch { }`).Output()
	if err != nil {
		return nil
	}

	output := strings.TrimSpace(string(out))
	if output == "" {
		return nil
	}

	var updates []UpdateInfo
	for _, line := range strings.Split(output, "\n") {
		title := strings.TrimSpace(line)
		if title == "" {
			continue
		}
		updates = append(updates, UpdateInfo{
			Package:    title,
			NewVersion: "",
		})
	}

	return updates
}
