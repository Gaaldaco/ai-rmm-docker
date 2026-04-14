package executor

import (
	"regexp"
	"strings"
)

// dangerousPatterns holds compiled regexes for commands that must never execute.
// Each pattern is paired with a human-readable reason returned in the error result.
var dangerousPatterns = []struct {
	re     *regexp.Regexp
	reason string
}{
	// Recursive delete of root or root's immediate children
	{regexp.MustCompile(`\brm\s+(-[a-zA-Z]*f[a-zA-Z]*\s+|--force\s+)(-[a-zA-Z]*r[a-zA-Z]*\s+|--recursive\s+)?/?(\*|/\*?)\b`), "destructive rm of root filesystem"},
	{regexp.MustCompile(`\brm\s+(-[a-zA-Z]*r[a-zA-Z]*\s+|--recursive\s+)(-[a-zA-Z]*f[a-zA-Z]*\s+|--force\s+)?/?(\*|/\*?)\b`), "destructive rm of root filesystem"},

	// Filesystem creation (wipes a device)
	{regexp.MustCompile(`\bmkfs\b`), "filesystem creation (mkfs)"},

	// dd writing to block devices (/dev/sd*, /dev/hd*, /dev/nvme*, /dev/vd*, /dev/xvd*, /dev/mmcblk*)
	{regexp.MustCompile(`\bdd\b.*\bof=/?dev/(sd|hd|nvme|vd|xvd|mmcblk)`), "dd write to block device"},

	// Redirect output directly to block devices
	{regexp.MustCompile(`>\s*/?dev/(sd|hd|nvme|vd|xvd|mmcblk|sda|sdb|sdc)`), "redirect to block device"},

	// chmod 777 on critical system directories
	{regexp.MustCompile(`\bchmod\b.*\b777\b.*(/(etc|bin|sbin|usr|lib|lib64|boot|sys|proc|dev)(/|$)|\s*/\s)`), "chmod 777 on system directory"},

	// Fork bomb
	{regexp.MustCompile(`:\(\)\s*\{.*:\|:.*\}`), "fork bomb"},

	// Pipe remote content directly into a shell interpreter
	{regexp.MustCompile(`\|\s*(bash|sh|zsh|ksh|csh|tcsh|dash|ash)\b`), "pipe to shell (remote code execution risk)"},

	// base64 decode piped to shell
	{regexp.MustCompile(`\bbase64\b.*-d.*\|`), "base64 decode pipe (obfuscated execution)"},

	// python/python3 -c with os.system or subprocess (obfuscated execution)
	{regexp.MustCompile(`\bpython3?\s+-c\b.*\bos\.system\b`), "python -c os.system (obfuscated execution)"},
	{regexp.MustCompile(`\bpython3?\s+-c\b.*\bsubprocess\b`), "python -c subprocess (obfuscated execution)"},

	// Power management commands — must never be run remotely
	{regexp.MustCompile(`\b(shutdown|reboot|halt|poweroff|init\s+0|init\s+6)\b`), "system power/shutdown command"},

	// Password changes — protect against account takeover
	{regexp.MustCompile(`\bpasswd\b`), "password modification command"},
}

// IsSafeCommand returns true if the command is safe to execute.
// If it returns false, the second return value contains the rejection reason.
func IsSafeCommand(cmd string) (bool, string) {
	// Normalise: collapse runs of whitespace for consistent matching
	normalised := strings.Join(strings.Fields(cmd), " ")

	for _, p := range dangerousPatterns {
		if p.re.MatchString(normalised) {
			return false, p.reason
		}
	}
	return true, ""
}
