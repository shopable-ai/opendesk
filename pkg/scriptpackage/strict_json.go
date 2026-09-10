package scriptpackage

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
)

// UnmarshalJSON keeps manifest parsing strict even though encoding/json normally
// accepts duplicate object keys. Duplicate keys are rejected recursively before
// decoding into the typed v1 manifest.
func (m *Manifest) UnmarshalJSON(data []byte) error {
	if err := rejectDuplicateObjectKeys(data); err != nil {
		return err
	}
	if err := requireManifestFields(data); err != nil {
		return err
	}
	type manifestAlias Manifest
	var decoded manifestAlias
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&decoded); err != nil {
		return fmt.Errorf("strict manifest decode: %w", err)
	}
	var trailing any
	if err := decoder.Decode(&trailing); err != io.EOF {
		return fmt.Errorf("strict manifest decode: trailing JSON data")
	}
	*m = Manifest(decoded)
	return nil
}

func requireManifestFields(data []byte) error {
	var root map[string]json.RawMessage
	if err := json.Unmarshal(data, &root); err != nil {
		return fmt.Errorf("manifest must be a JSON object: %w", err)
	}
	if err := requireFields(root, []string{
		"format", "formatVersion", "packageId", "productId", "publisherId",
		"publisherKeyId", "entrypoint", "payloadType", "minimumRuntimeVersion",
		"encryption", "license",
	}); err != nil {
		return err
	}
	var encryption map[string]json.RawMessage
	if err := json.Unmarshal(root["encryption"], &encryption); err != nil || encryption == nil {
		return fmt.Errorf("manifest encryption must be an object")
	}
	if err := requireFields(encryption, []string{"algorithm", "keyId", "nonce"}); err != nil {
		return fmt.Errorf("manifest encryption: %w", err)
	}
	var license map[string]json.RawMessage
	if err := json.Unmarshal(root["license"], &license); err != nil || license == nil {
		return fmt.Errorf("manifest license must be an object")
	}
	if err := requireFields(license, []string{"required", "productId"}); err != nil {
		return fmt.Errorf("manifest license: %w", err)
	}
	return nil
}

func requireFields(object map[string]json.RawMessage, fields []string) error {
	for _, field := range fields {
		if _, ok := object[field]; !ok {
			return fmt.Errorf("required field %q is missing", field)
		}
	}
	return nil
}

func rejectDuplicateObjectKeys(data []byte) error {
	decoder := json.NewDecoder(bytes.NewReader(data))
	var readValue func() error
	readValue = func() error {
		token, err := decoder.Token()
		if err != nil {
			return err
		}
		delim, isDelim := token.(json.Delim)
		if !isDelim {
			return nil
		}
		switch delim {
		case '{':
			seen := map[string]struct{}{}
			for decoder.More() {
				keyToken, err := decoder.Token()
				if err != nil {
					return err
				}
				key, ok := keyToken.(string)
				if !ok {
					return fmt.Errorf("object key is not a string")
				}
				if _, exists := seen[key]; exists {
					return fmt.Errorf("duplicate manifest key %q", key)
				}
				seen[key] = struct{}{}
				if err := readValue(); err != nil {
					return err
				}
			}
			_, err = decoder.Token()
			return err
		case '[':
			for decoder.More() {
				if err := readValue(); err != nil {
					return err
				}
			}
			_, err = decoder.Token()
			return err
		default:
			return fmt.Errorf("unexpected JSON delimiter %q", delim)
		}
	}
	if err := readValue(); err != nil {
		return err
	}
	var trailing any
	if err := decoder.Decode(&trailing); err != io.EOF {
		return fmt.Errorf("manifest contains trailing JSON data")
	}
	return nil
}
