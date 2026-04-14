package ws

import (
	"crypto/tls"
	"encoding/json"
	"fmt"
	"log"
	"math"
	"math/rand"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

// Message is the envelope for all WebSocket messages
type Message struct {
	Type string          `json:"type"`
	Data json.RawMessage `json:"data,omitempty"`
}

// Command is a server-pushed command to execute
type Command struct {
	ID      string `json:"id"`
	Command string `json:"command"`
}

// CommandResult is the result of executing a command
type CommandResult struct {
	ID       string `json:"id"`
	Output   string `json:"output"`
	ExitCode int    `json:"exitCode"`
	Success  bool   `json:"success"`
}

// Client manages a persistent WebSocket connection with auto-reconnect
type Client struct {
	url            string
	apiKey         string
	conn           *websocket.Conn
	mu             sync.Mutex
	connected      bool
	done           chan struct{}
	connDone       chan struct{} // closed when current connection ends
	sendCh         chan []byte
	onCommand      func(Command)
	reconnectCount int
}

// NewClient creates a new WebSocket client
func NewClient(apiURL, apiKey string, onCommand func(Command)) *Client {
	// Convert http(s) URL to ws(s) URL
	wsURL := apiURL
	wsURL = strings.Replace(wsURL, "https://", "wss://", 1)
	wsURL = strings.Replace(wsURL, "http://", "ws://", 1)
	// Remove trailing slash
	wsURL = strings.TrimRight(wsURL, "/")
	wsURL += "/ws/agent"

	return &Client{
		url:       wsURL,
		apiKey:    apiKey,
		done:      make(chan struct{}),
		sendCh:    make(chan []byte, 64),
		onCommand: onCommand,
	}
}

// Connect establishes the WebSocket connection and starts read/write loops
func (c *Client) Connect() error {
	if err := c.dial(); err != nil {
		return err
	}

	go c.readLoop()
	go c.writeLoop()
	go c.pingLoop()

	return nil
}

// ConnectWithRetry keeps trying to connect with exponential backoff
func (c *Client) ConnectWithRetry() {
	for {
		select {
		case <-c.done:
			return
		default:
		}

		err := c.dial()
		if err != nil {
			c.reconnectCount++
			delay := c.backoffDelay()
			log.Printf("[ws] Connection failed: %v — retrying in %s", err, delay)
			time.Sleep(delay)
			continue
		}

		// Connected successfully
		c.reconnectCount = 0
		c.connDone = make(chan struct{})
		log.Println("[ws] Connected to server")

		go c.writeLoop()
		go c.pingLoop()
		c.readLoop() // blocks until disconnect

		// Signal writeLoop and pingLoop to stop
		close(c.connDone)

		c.mu.Lock()
		c.connected = false
		c.mu.Unlock()

		log.Println("[ws] Disconnected — reconnecting...")
		time.Sleep(2 * time.Second)
	}
}

func (c *Client) dial() error {
	dialer := websocket.Dialer{
		HandshakeTimeout:  10 * time.Second,
		EnableCompression: false,
		TLSClientConfig:   &tls.Config{MinVersion: tls.VersionTLS12},
	}

	header := http.Header{}
	header.Set("Authorization", "Bearer "+c.apiKey)

	conn, _, err := dialer.Dial(c.url, header)
	if err != nil {
		return fmt.Errorf("dial %s: %w", c.url, err)
	}

	c.mu.Lock()
	c.conn = conn
	c.connected = true
	c.mu.Unlock()

	return nil
}

func (c *Client) readLoop() {
	defer func() {
		c.mu.Lock()
		c.connected = false
		if c.conn != nil {
			c.conn.Close()
		}
		c.mu.Unlock()
	}()

	for {
		_, raw, err := c.conn.ReadMessage()
		if err != nil {
			log.Printf("[ws] Read error: %v", err)
			return
		}

		var msg Message
		if err := json.Unmarshal(raw, &msg); err != nil {
			log.Printf("[ws] Invalid message: %v", err)
			continue
		}

		switch msg.Type {
		case "command":
			var cmd Command
			if err := json.Unmarshal(msg.Data, &cmd); err != nil {
				log.Printf("[ws] Invalid command data: %v", err)
				continue
			}
			if c.onCommand != nil {
				go c.onCommand(cmd)
			}

		case "snapshot_ack", "heartbeat_ack":
			// Acknowledged, nothing to do

		case "error":
			log.Printf("[ws] Server error: %s", string(msg.Data))

		default:
			log.Printf("[ws] Unknown message type: %s", msg.Type)
		}
	}
}

func (c *Client) writeLoop() {
	for {
		select {
		case <-c.done:
			return
		case <-c.connDone:
			return
		case data := <-c.sendCh:
			c.mu.Lock()
			if !c.connected || c.conn == nil {
				c.mu.Unlock()
				continue
			}
			err := c.conn.WriteMessage(websocket.TextMessage, data)
			c.mu.Unlock()
			if err != nil {
				log.Printf("[ws] Write error: %v", err)
				return
			}
		}
	}
}

func (c *Client) pingLoop() {
	ticker := time.NewTicker(25 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-c.done:
			return
		case <-c.connDone:
			return
		case <-ticker.C:
			c.mu.Lock()
			if c.connected && c.conn != nil {
				c.conn.WriteControl(websocket.PingMessage, nil, time.Now().Add(5*time.Second))
			}
			c.mu.Unlock()
		}
	}
}

func (c *Client) send(msgType string, data interface{}) error {
	var rawData json.RawMessage
	if data != nil {
		b, err := json.Marshal(data)
		if err != nil {
			return err
		}
		rawData = b
	}

	msg := Message{Type: msgType, Data: rawData}
	b, err := json.Marshal(msg)
	if err != nil {
		return err
	}

	select {
	case c.sendCh <- b:
		return nil
	default:
		return fmt.Errorf("send channel full")
	}
}

// SendSnapshot sends a system snapshot to the server
func (c *Client) SendSnapshot(snapshot interface{}) error {
	return c.send("snapshot", snapshot)
}

// SendHeartbeat sends a heartbeat to the server
func (c *Client) SendHeartbeat() error {
	return c.send("heartbeat", nil)
}

// SendCommandResult reports the result of a command execution
func (c *Client) SendCommandResult(result CommandResult) error {
	return c.send("command_result", result)
}

// IsConnected returns whether the client is currently connected
func (c *Client) IsConnected() bool {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.connected
}

// Close gracefully closes the connection
func (c *Client) Close() {
	close(c.done)
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.conn != nil {
		c.conn.WriteMessage(websocket.CloseMessage,
			websocket.FormatCloseMessage(websocket.CloseNormalClosure, ""))
		c.conn.Close()
	}
}

func (c *Client) backoffDelay() time.Duration {
	base := math.Pow(2, float64(c.reconnectCount))
	if base > 300 { // cap at 5 minutes
		base = 300
	}
	// Add jitter: +/- 25%
	jitter := base * 0.25 * (rand.Float64()*2 - 1)
	delay := time.Duration((base + jitter) * float64(time.Second))
	if delay < time.Second {
		delay = time.Second
	}
	return delay
}
