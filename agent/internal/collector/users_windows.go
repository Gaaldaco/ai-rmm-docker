//go:build windows

package collector

import (
	"os/exec"
	"strings"
)

func CollectUsers() []UserInfo {
	out, err := exec.Command("powershell", "-NoProfile", "-Command",
		"query user 2>$null | Select-Object -Skip 1 | ForEach-Object { $_ -replace '\\s{2,}', '|' }").Output()
	if err != nil {
		return nil
	}

	var users []UserInfo
	for _, line := range strings.Split(strings.TrimSpace(string(out)), "\n") {
		parts := strings.SplitN(strings.TrimSpace(line), "|", 6)
		if len(parts) < 1 || parts[0] == "" {
			continue
		}

		username := strings.TrimPrefix(strings.TrimSpace(parts[0]), ">")
		terminal := ""
		loginTime := ""
		if len(parts) >= 2 {
			terminal = strings.TrimSpace(parts[1])
		}
		if len(parts) >= 5 {
			loginTime = strings.TrimSpace(parts[4])
		}

		users = append(users, UserInfo{
			Username:  username,
			Terminal:  terminal,
			LoginTime: loginTime,
		})
	}

	return users
}
