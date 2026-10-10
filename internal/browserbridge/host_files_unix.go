//go:build darwin || linux

package browserbridge

// Only the authenticated Chrome port reaches this dispatcher. Local socket
// clients retain the original ten Browser RPCs and cannot grant workspaces or
// call these methods. The extension keeps this port behind its trusted UI.
func (h *Host) handleFiles(raw []byte) error {
	request, err := decodeFilesRequest(raw)
	if err != nil {
		return ErrSchema
	}
	h.mu.Lock()
	if !h.ready || !h.localFiles || h.closed {
		h.mu.Unlock()
		return ErrClosed
	}
	if h.filesPending >= 4 {
		h.mu.Unlock()
		response := newFilesResponse(request)
		response.Error = filesFailure("E_FILES_BUSY")
		return h.sendChrome(MustEncode(response))
	}
	h.filesPending++
	manager := h.files
	h.mu.Unlock()
	go func() {
		response := manager.Handle(request)
		h.mu.Lock()
		h.filesPending--
		live := !h.closed && h.ready && h.localFiles
		h.mu.Unlock()
		if live {
			_ = h.sendChrome(MustEncode(response))
		}
	}()
	return nil
}
