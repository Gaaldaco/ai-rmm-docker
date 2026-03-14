package executor

import "time"

const (
	DefaultTimeout = 120 * time.Second
	MaxOutputBytes = 10 * 1024 // 10KB
)

type Result struct {
	Output   string `json:"output"`
	ExitCode int    `json:"exitCode"`
	Success  bool   `json:"success"`
}
