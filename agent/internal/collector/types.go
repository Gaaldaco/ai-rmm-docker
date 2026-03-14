package collector

type SystemInfo struct {
	Hostname string `json:"hostname"`
	OS       string `json:"os"`
	Arch     string `json:"arch"`
	Platform string `json:"platform"`
}

type CPUInfo struct {
	UsagePercent float64   `json:"usagePercent"`
	Cores        int       `json:"cores"`
	LoadAvg      []float64 `json:"loadAvg,omitempty"`
}

type MemoryInfo struct {
	TotalMB      float64 `json:"totalMB"`
	UsedMB       float64 `json:"usedMB"`
	UsagePercent float64 `json:"usagePercent"`
}

type DiskInfo struct {
	Mountpoint   string  `json:"mountpoint"`
	TotalGB      float64 `json:"totalGB"`
	UsedGB       float64 `json:"usedGB"`
	UsagePercent float64 `json:"usagePercent"`
}

type NetworkInfo struct {
	Interface string `json:"interface"`
	BytesSent uint64 `json:"bytesSent"`
	BytesRecv uint64 `json:"bytesRecv"`
}

type OpenPort struct {
	Port     int    `json:"port"`
	Protocol string `json:"protocol"`
	Process  string `json:"process,omitempty"`
	Address  string `json:"address"`
}

type ServiceInfo struct {
	Name    string  `json:"name"`
	Status  string  `json:"status"`
	Enabled bool    `json:"enabled"`
	CPU     float64 `json:"cpu,omitempty"`
	Mem     float64 `json:"mem,omitempty"`
}

type UserInfo struct {
	Username  string `json:"username"`
	Terminal  string `json:"terminal,omitempty"`
	LoginTime string `json:"loginTime,omitempty"`
}

type UpdateInfo struct {
	Package        string `json:"package"`
	CurrentVersion string `json:"currentVersion,omitempty"`
	NewVersion     string `json:"newVersion,omitempty"`
}

type AuthLogEntry struct {
	Timestamp string `json:"timestamp"`
	Type      string `json:"type"`
	User      string `json:"user,omitempty"`
	Source    string `json:"source,omitempty"`
	Success   bool   `json:"success"`
}

type ProcessInfo struct {
	PID     int     `json:"pid"`
	Name    string  `json:"name"`
	CPU     float64 `json:"cpu"`
	Memory  float64 `json:"memory"`
	User    string  `json:"user"`
}
