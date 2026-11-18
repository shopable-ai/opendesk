//go:build darwin || linux

package browserbridge

import (
	"bufio"
	"encoding/json"
	"fmt"
	"sort"
	"sync"
	"time"
)

const managedTimeout = 15 * time.Second
const managedMaxSequence uint64 = 9007199254740991

type managedProvider struct {
	descriptor managedDescriptor
	epoch      string
	client     *localClient
	sequence   uint64
	dispatchMu sync.Mutex
}
type pendingManaged struct {
	provider   *managedProvider
	browserID  string
	brokerID   string
	dispatched bool
	timer      *time.Timer
}

// Only the original authenticated private socket can register a provider.
// No business payload, endpoint or permission is inferred by this broker.
func (h *Host) serveManagedProvider(c *localClient, raw []byte, reader *bufio.Reader) {
	descriptor, err := decodeManagedRegistration(raw)
	if err != nil {
		return
	}
	epoch, err := NewID()
	if err != nil {
		return
	}
	p := &managedProvider{descriptor: descriptor, epoch: epoch, client: c}
	h.mu.Lock()
	if !h.ready || !h.managedServices || h.closed || len(h.managedProviders) >= 8 || h.managedProviders[descriptor.ServiceID] != nil {
		h.mu.Unlock()
		return
	}
	h.managedProviders[descriptor.ServiceID] = p
	h.mu.Unlock()
	defer h.releaseManagedProvider(p)
	if err = h.sendLocal(c, MustEncode(map[string]any{"v": 1, "kind": "services.registered", "protocol": ManagedServicesProtocol,
		"serviceId": descriptor.ServiceID, "serviceInstanceId": descriptor.ServiceInstanceID, "providerEpoch": epoch})); err != nil {
		return
	}
	h.managedState()
	_ = c.socket.SetReadDeadline(time.Time{})
	for {
		raw, err := ReadLine(reader)
		if err != nil {
			return
		}
		result, err := decodeManagedResult(raw)
		if err != nil || result.ServiceID != descriptor.ServiceID || result.ProviderEpoch != epoch {
			return
		}
		h.mu.Lock()
		entry := h.managedPending[managedKey(epoch, result.RequestID)]
		if entry != nil && entry.provider == p {
			delete(h.managedPending, managedKey(epoch, result.RequestID))
			entry.timer.Stop()
		}
		live := h.managedProviders[descriptor.ServiceID] == p && !h.closed
		h.mu.Unlock()
		// Late/duplicate results never re-create a retired mapping or permission.
		if entry == nil || entry.provider != p || !live {
			continue
		}
		result.Kind = "services.response"
		result.RequestID = entry.browserID
		if result.Error != nil {
			result.Error.Message = result.Error.Code
		}
		response, encodeErr := Encode(result)
		if encodeErr != nil {
			h.managedFailure(entry, "E_SERVICE_LIMIT", "OUTCOME_UNKNOWN")
			continue
		}
		_ = h.sendChrome(response)
	}
}
func managedKey(epoch, id string) string { return epoch + ":" + id }
func (h *Host) managedFailure(entry *pendingManaged, code, outcome string) {
	_ = h.sendChrome(MustEncode(map[string]any{"v": 1, "kind": "services.response", "protocol": ManagedServicesProtocol,
		"requestId": entry.browserID, "serviceId": entry.provider.descriptor.ServiceID, "providerEpoch": entry.provider.epoch,
		"error": managedError{Code: code, Message: code, Outcome: outcome}}))
}
func (h *Host) managedState() {
	// Snapshot and publication share an order, so concurrent exits/registers
	// cannot publish an old descriptor after its retirement.
	h.managedStateMu.Lock()
	defer h.managedStateMu.Unlock()
	h.mu.Lock()
	if !h.ready || !h.managedServices || h.closed {
		h.mu.Unlock()
		return
	}
	ids := make([]string, 0, len(h.managedProviders))
	for id := range h.managedProviders {
		ids = append(ids, id)
	}
	sort.Strings(ids)
	rows := make([]map[string]any, 0, len(ids))
	for _, id := range ids {
		p := h.managedProviders[id]
		d := p.descriptor
		rows = append(rows, map[string]any{"serviceId": d.ServiceID, "serviceInstanceId": d.ServiceInstanceID,
			"productName": d.ProductName, "origin": d.Origin, "capabilities": d.Capabilities, "providerEpoch": p.epoch})
	}
	h.mu.Unlock()
	_ = h.sendChrome(MustEncode(map[string]any{"v": 1, "kind": "services.state", "protocol": ManagedServicesProtocol, "services": rows}))
}
func (h *Host) releaseManagedProvider(p *managedProvider) {
	p.dispatchMu.Lock()
	h.mu.Lock()
	if h.managedProviders[p.descriptor.ServiceID] != p {
		h.mu.Unlock()
		p.dispatchMu.Unlock()
		return
	}
	delete(h.managedProviders, p.descriptor.ServiceID)
	entries := make([]*pendingManaged, 0)
	for key, entry := range h.managedPending {
		if entry.provider == p {
			entry.timer.Stop()
			delete(h.managedPending, key)
			entries = append(entries, entry)
		}
	}
	h.mu.Unlock()
	_ = p.client.socket.Close()
	p.dispatchMu.Unlock()
	for _, entry := range entries {
		outcome := "NOT_DISPATCHED"
		if entry.dispatched {
			outcome = "OUTCOME_UNKNOWN"
		}
		h.managedFailure(entry, "E_SERVICE_DISCONNECTED", outcome)
	}
	h.managedState()
}
func (h *Host) handleManagedRequest(raw []byte) error {
	req, err := decodeManagedRequest(raw)
	if err != nil {
		return err
	}
	h.mu.Lock()
	p := h.managedProviders[req.ServiceID]
	// A request is accepted exclusively from handleChrome, after its original
	// extension-origin handshake. The fixed SW owns tool installation authority.
	if !h.managedServices || !h.ready || h.closed || p == nil || p.epoch != req.ProviderEpoch || req.Owner.ExtensionID != h.cfg.ExtensionID {
		h.mu.Unlock()
		ghost := &pendingManaged{browserID: req.RequestID, provider: &managedProvider{descriptor: managedDescriptor{ServiceID: req.ServiceID}, epoch: req.ProviderEpoch}}
		h.managedFailure(ghost, "E_SERVICE_SESSION", "NOT_DISPATCHED")
		return nil
	}
	entry := &pendingManaged{provider: p, browserID: req.RequestID}
	if p.sequence >= managedMaxSequence {
		h.mu.Unlock()
		h.managedFailure(entry, "E_SERVICE_SESSION", "NOT_DISPATCHED")
		h.releaseManagedProvider(p)
		return nil
	}
	// Consumed on all admissions, including rejected requests. Never reuse an
	// ID after completion, a timeout, a limit or a lost result in this epoch.
	p.sequence++
	entry.brokerID = fmt.Sprintf("req_%d", p.sequence)
	for _, pending := range h.managedPending {
		if pending.browserID == req.RequestID {
			h.mu.Unlock()
			h.managedFailure(entry, "E_SERVICE_DUPLICATE", "OUTCOME_UNKNOWN")
			return nil
		}
	}
	if len(h.managedPending) >= 4 {
		h.mu.Unlock()
		h.managedFailure(entry, "E_SERVICE_LIMIT", "NOT_DISPATCHED")
		return nil
	}
	invoke, err := Encode(map[string]any{"v": 1, "kind": "services.invoke", "protocol": ManagedServicesProtocol,
		"requestId": entry.brokerID, "serviceId": req.ServiceID, "serviceInstanceId": p.descriptor.ServiceInstanceID,
		"providerEpoch": p.epoch, "owner": req.Owner, "action": req.Action, "payload": json.RawMessage(req.Payload)})
	if err != nil {
		h.mu.Unlock()
		h.managedFailure(entry, "E_SERVICE_LIMIT", "NOT_DISPATCHED")
		return nil
	}
	key := managedKey(p.epoch, entry.brokerID)
	entry.timer = time.AfterFunc(managedTimeout, func() { h.expireManaged(entry) })
	h.managedPending[key] = entry
	h.mu.Unlock()
	p.dispatchMu.Lock()
	h.mu.Lock()
	live := !h.closed && h.managedProviders[req.ServiceID] == p && h.managedPending[key] == entry
	if live {
		entry.dispatched = true
	}
	h.mu.Unlock()
	if live {
		err = h.sendLocal(p.client, invoke)
	}
	p.dispatchMu.Unlock()
	if err != nil {
		h.releaseManagedProvider(p)
	}
	return nil
}
func (h *Host) expireManaged(entry *pendingManaged) {
	key := managedKey(entry.provider.epoch, entry.brokerID)
	h.mu.Lock()
	live := h.managedPending[key] == entry
	if live {
		delete(h.managedPending, key)
	}
	dispatched := entry.dispatched
	h.mu.Unlock()
	if live {
		outcome := "NOT_DISPATCHED"
		if dispatched {
			outcome = "OUTCOME_UNKNOWN"
		}
		h.managedFailure(entry, "E_SERVICE_TIMEOUT", outcome)
	}
}
