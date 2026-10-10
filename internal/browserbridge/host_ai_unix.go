//go:build darwin || linux

package browserbridge

import (
	"context"
	"opendesk/internal/browserai"
)

// handleAI is exclusively reached from the already authenticated Chrome
// welcome connection. Local Unix clients still have exactly the original ten
// Browser RPCs; neither web pages nor local MCP clients gain this AI surface.
func (h *Host) handleAI(raw []byte) error {
	request, err := browserai.DecodeRequest(raw)
	if err != nil {
		return ErrSchema
	}
	h.mu.Lock()
	if !h.ready || h.closed {
		h.mu.Unlock()
		return ErrClosed
	}
	control := request.Method == "ai.plan.cancel" || request.Method == "ai.session.close"
	if (!control && h.aiPending >= 4) || (control && h.aiControlPending >= 4) {
		h.mu.Unlock()
		return h.sendChrome(MustEncode(browserai.Response{V: 1, Kind: "ai.response", Protocol: browserai.Protocol,
			RequestID: request.RequestID, Scope: request.Scope, SessionID: request.SessionID,
			Error: &browserai.Error{Code: "E_LIMIT", Message: "Too many pending workflow AI requests."}}))
	}
	if control {
		h.aiControlPending++
	} else {
		h.aiPending++
	}
	manager := h.ai
	h.mu.Unlock()
	go func() {
		response := manager.Handle(context.Background(), request)
		h.mu.Lock()
		if control {
			h.aiControlPending--
		} else {
			h.aiPending--
		}
		live := !h.closed && h.ready
		h.mu.Unlock()
		if !live {
			return
		}
		data, err := Encode(response)
		if err != nil {
			response.Result = nil
			response.Error = &browserai.Error{Code: "E_LIMIT", Message: "Workflow AI response exceeds native frame budget."}
			data = MustEncode(response)
		}
		_ = h.sendChrome(data)
	}()
	return nil
}
