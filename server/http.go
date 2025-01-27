// server/http.go
package server

import (
	"io"
	"net/http"

	"../automation"
)

type Server struct {
	runner *automation.Runner
}

func NewServer() *Server {
	return &Server{
		runner: automation.NewRunner(),
	}
}

func (s *Server) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	body, err := io.ReadAll(r.Body)
	if err != nil {
		http.Error(w, "Failed to read request body", http.StatusBadRequest)
		return
	}

	if err := s.runner.ExecuteScript(string(body)); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	w.WriteHeader(http.StatusOK)
}
