package flowinstall

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"opendesk/pkg/appdata"
)

const ProductPackageID = "com.opendesk.desktop"

// NewProductService is the single product-owned Flow installation service.
// App Mode and the flow CLI both resolve the same persistent app-data owner
// before constructing this service; callers must not derive Flow paths from
// cwd, an executable path, or a package-provided string.
func NewProductService(environment map[string]string) (*Service, error) {
	root, err := appdata.Root(ProductPackageID, environment)
	if err != nil {
		return nil, err
	}
	return NewService(RootsFromAppData(root))
}

type Roots struct {
	FlowRoot  string
	DataRoot  string
	StateRoot string
	TrustRoot string
}

func RootsFromAppData(appDataRoot string) Roots {
	root := filepath.Clean(appDataRoot)
	state := filepath.Join(root, "flow-state")
	return Roots{
		FlowRoot: filepath.Join(root, "flows"), DataRoot: filepath.Join(root, "flow-data"),
		StateRoot: state, TrustRoot: filepath.Join(state, "trust"),
	}
}

func (r Roots) Validate() error {
	values := map[string]string{
		"FlowRoot": r.FlowRoot, "DataRoot": r.DataRoot, "StateRoot": r.StateRoot, "TrustRoot": r.TrustRoot,
	}
	for name, value := range values {
		clean := filepath.Clean(strings.TrimSpace(value))
		volumeRoot := filepath.VolumeName(clean) + string(filepath.Separator)
		if !filepath.IsAbs(clean) || clean == volumeRoot {
			return newError(CodeInvalidRoot, fmt.Sprintf("%s must be an absolute non-root path", name), nil)
		}
	}
	return nil
}

func (r Roots) Ensure() error {
	if err := r.Validate(); err != nil {
		return err
	}
	for _, root := range []string{r.FlowRoot, r.DataRoot, r.StateRoot, r.TrustRoot, r.recordsRoot(), r.locksRoot(), r.transactionsRoot()} {
		if info, err := os.Lstat(root); err == nil {
			if info.Mode()&os.ModeSymlink != 0 || !info.IsDir() {
				return newError(CodeInvalidRoot, "Flow root path is not a real directory", nil)
			}
			continue
		} else if !os.IsNotExist(err) {
			return newError(CodeInvalidRoot, "cannot inspect Flow root", err)
		}
		if err := os.MkdirAll(root, 0o700); err != nil {
			return newError(CodeInvalidRoot, "cannot create Flow root", err)
		}
	}
	return nil
}

func (r Roots) recordsRoot() string      { return filepath.Join(r.StateRoot, "records") }
func (r Roots) locksRoot() string        { return filepath.Join(r.StateRoot, "locks") }
func (r Roots) transactionsRoot() string { return filepath.Join(r.StateRoot, "transactions") }
