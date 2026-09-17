package flow

const (
	MaxPackageSize       int64 = 64 << 20
	MaxManifestSize      int64 = 256 << 10
	MaxSignatureSize     int64 = 128
	MaxFileSize          int64 = 32 << 20
	MaxUncompressedSize  int64 = 64 << 20
	MaxArchiveEntryCount       = MaxFileCount + 2
)

type InputFile struct {
	Path string
	Data []byte
}

type BuildResult struct {
	Data          []byte
	Manifest      Manifest
	RawManifest   []byte
	Signature     []byte
	PackageDigest string
}

type Package struct {
	Manifest      Manifest
	RawManifest   []byte
	Signature     []byte
	Files         map[string][]byte
	PackageDigest string
}
