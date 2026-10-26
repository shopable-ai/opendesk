package browserbridge

import (
	"regexp"
)

const (
	LocalDevSourceVersion = 1
	localSourceFormat     = "opendesk.local-source.v1"
	// Match the existing Page frame capsule's bounded UTF-8 expansion budget.
	// Native messages remain 60 KiB and source is still read in 24 KiB chunks.
	localSourceMaxBytes      = 6*6*1024*1024 + 512*1024 + 8192
	localSourceChunkBytes    = 24 * 1024
	localSourceMaxBase64Size = 32 * 1024
)

var (
	sourceIDPattern = regexp.MustCompile("^[a-zA-Z0-9._:-]{1,240}$")
	hashPattern     = regexp.MustCompile("^[a-f0-9]{64}$")
)

func sourceIDValid(id string) bool      { return sourceIDPattern.MatchString(id) }
func sourceHashValid(value string) bool { return hashPattern.MatchString(value) }
