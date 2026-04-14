package main

import (
	"flag"
	"log"
	"os"
	"os/signal"
	"runtime"
	"syscall"
	"time"

	"github.com/Gaaldaco/ai-remote-agent/internal/collector"
	"github.com/Gaaldaco/ai-remote-agent/internal/config"
	"github.com/Gaaldaco/ai-remote-agent/internal/executor"
	"github.com/Gaaldaco/ai-remote-agent/internal/ws"
)

type Snapshot struct {
	Hostname       string                   `json:"hostname"`
	OS             string                   `json:"os"`
	Arch           string                   `json:"arch"`
	Platform       string                   `json:"platform"`
	CPU            collector.CPUInfo        `json:"cpu"`
	Memory         collector.MemoryInfo     `json:"memory"`
	Disk           []collector.DiskInfo     `json:"disk"`
	Network        []collector.NetworkInfo  `json:"network"`
	Processes      []collector.ProcessInfo  `json:"processes"`
	OpenPorts      []collector.OpenPort     `json:"openPorts"`
	Users          []collector.UserInfo     `json:"users"`
	AuthLogs       []collector.AuthLogEntry `json:"authLogs"`
	PendingUpdates []collector.UpdateInfo   `json:"pendingUpdates"`
	Services       []collector.ServiceInfo  `json:"services"`
}

func main() {
	configPath := flag.String("config", config.DefaultConfigPath(), "Path to config file")
	flag.Parse()

	log.SetFlags(log.LstdFlags | log.Lshortfile)

	// Detect platform at runtime
	isWindows := runtime.GOOS == "windows"
	log.Printf("[agent] AI Remote Agent starting... (platform: %s)", runtime.GOOS)

	cfg, err := config.Load(*configPath)
	if err != nil {
		log.Fatalf("[agent] Failed to load config: %v", err)
	}

	if cfg.APIUrl == "" || cfg.APIKey == "" {
		log.Fatal("[agent] api_url and api_key must be set in config")
	}

	// Create WebSocket client with command handler
	client = ws.NewClient(cfg.APIUrl, cfg.APIKey, func(cmd ws.Command) {
		log.Printf("[agent] Received command: %s", cmd.Command)
		result := executor.Execute(cmd.Command, executor.DefaultTimeout)

		err := client.SendCommandResult(ws.CommandResult{
			ID:       cmd.ID,
			Output:   result.Output,
			ExitCode: result.ExitCode,
			Success:  result.Success,
		})
		if err != nil {
			log.Printf("[agent] Failed to send command result for %s: %v", cmd.ID, err)
		}
	})

	// Connect with automatic retry
	log.Printf("[agent] Connecting to %s via WebSocket...", cfg.APIUrl)
	go client.ConnectWithRetry()

	// Wait for initial connection
	for i := 0; i < 30; i++ {
		if client.IsConnected() {
			break
		}
		time.Sleep(time.Second)
	}

	if client.IsConnected() {
		log.Println("[agent] WebSocket connected")
	} else {
		log.Println("[agent] Warning: not connected yet, will keep retrying in background")
	}

	// Start tickers
	snapshotTicker := time.NewTicker(time.Duration(cfg.SnapshotInterval) * time.Second)
	heartbeatTicker := time.NewTicker(time.Duration(cfg.HeartbeatInterval) * time.Second)

	// Send initial snapshot
	go sendSnapshot(client, isWindows)

	// Signal handling for graceful shutdown
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)

	log.Printf("[agent] Running (snapshot: %ds, heartbeat: %ds). Press Ctrl+C to stop.",
		cfg.SnapshotInterval, cfg.HeartbeatInterval)

	for {
		select {
		case <-snapshotTicker.C:
			go sendSnapshot(client, isWindows)

		case <-heartbeatTicker.C:
			go func() {
				if err := client.SendHeartbeat(); err != nil {
					log.Printf("[agent] Heartbeat failed: %v", err)
				}
			}()

		case sig := <-sigChan:
			log.Printf("[agent] Received signal %v, shutting down...", sig)
			snapshotTicker.Stop()
			heartbeatTicker.Stop()
			client.Close()
			os.Exit(0)
		}
	}
}

// client is declared at package level so the command handler closure can reference it
var client *ws.Client

func sendSnapshot(c *ws.Client, isWindows bool) {
	if !c.IsConnected() {
		log.Println("[agent] Skipping snapshot — not connected")
		return
	}

	log.Println("[agent] Collecting system data...")

	sysInfo := collector.CollectSystemInfo()
	cpu := collector.CollectCPU()
	memory := collector.CollectMemory()
	disk := collector.CollectDisk()
	network := collector.CollectNetwork()
	processes := collector.CollectProcesses()
	ports := collector.CollectOpenPorts()
	users := collector.CollectUsers()
	authLogs := collector.CollectAuthLogs()
	updates := collector.CollectPendingUpdates()
	services := collector.CollectServices()

	snapshot := Snapshot{
		Hostname:       sysInfo.Hostname,
		OS:             sysInfo.OS,
		Arch:           sysInfo.Arch,
		Platform:       sysInfo.Platform,
		CPU:            cpu,
		Memory:         memory,
		Disk:           disk,
		Network:        network,
		Processes:      processes,
		OpenPorts:      ports,
		Users:          users,
		AuthLogs:       authLogs,
		PendingUpdates: updates,
		Services:       services,
	}

	if err := c.SendSnapshot(snapshot); err != nil {
		log.Printf("[agent] Snapshot send failed: %v", err)
	} else {
		log.Printf("[agent] Snapshot sent (CPU: %.1f%%, Mem: %.1f%%, Services: %d)",
			cpu.UsagePercent, memory.UsagePercent, len(services))
	}

	// Log Windows-specific status
	if isWindows {
		log.Printf("[agent] Windows update check: %d pending updates", len(updates))
	}
}
