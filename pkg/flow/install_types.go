package flow

import "time"

type InstallState string

const (
	InstallStateReady           InstallState = "ready"
	InstallStateNeedsActivation InstallState = "needs-activation"
)

type TrustScope string

const (
	TrustScopeFlow      TrustScope = "flow"
	TrustScopePublisher TrustScope = "publisher"
)

type TrustStatus string

const (
	TrustStatusTrusted  TrustStatus = "trusted"
	TrustStatusRejected TrustStatus = "rejected"
)

type TrustApproval string

const (
	TrustApprovalNone      TrustApproval = ""
	TrustApprovalFlow      TrustApproval = "flow"
	TrustApprovalPublisher TrustApproval = "publisher"
)

type PendingUpdate struct {
	Version       string       `json:"version"`
	PackageDigest string       `json:"packageDigest"`
	State         InstallState `json:"state"`
	StagedAt      time.Time    `json:"stagedAt"`
}

type CatalogEntry struct {
	SchemaVersion        int            `json:"schemaVersion"`
	InstallID            string         `json:"installId"`
	FlowID               string         `json:"flowId"`
	Name                 string         `json:"name"`
	Version              string         `json:"version"`
	PublisherID          string         `json:"publisherId"`
	PublisherKeyID       string         `json:"publisherKeyId"`
	PublisherFingerprint string         `json:"publisherFingerprint"`
	PackageDigest        string         `json:"packageDigest"`
	Entry                string         `json:"entry"`
	State                InstallState   `json:"state"`
	TrustScope           TrustScope     `json:"trustScope"`
	ProductID            string         `json:"productId,omitempty"`
	InstalledAt          time.Time      `json:"installedAt"`
	UpdatedAt            time.Time      `json:"updatedAt"`
	Pending              *PendingUpdate `json:"pending,omitempty"`
}

type TrustRecord struct {
	SchemaVersion        int         `json:"schemaVersion"`
	PublisherID          string      `json:"publisherId"`
	PublisherKeyID       string      `json:"publisherKeyId"`
	PublisherFingerprint string      `json:"publisherFingerprint"`
	Scope                TrustScope  `json:"scope"`
	FlowID               string      `json:"flowId,omitempty"`
	Status               TrustStatus `json:"status"`
	Source               string      `json:"source"`
	CreatedAt            time.Time   `json:"createdAt"`
}

type InstallOptions struct {
	Approval TrustApproval
	Now      func() time.Time
}

type InstallResult struct {
	Entry           CatalogEntry `json:"entry"`
	Idempotent      bool         `json:"idempotent"`
	PendingUpdate   bool         `json:"pendingUpdate"`
	SignatureStatus string       `json:"signatureStatus"`
	TrustStatus     string       `json:"trustStatus"`
}

type UninstallOptions struct {
	PurgeData bool
}
