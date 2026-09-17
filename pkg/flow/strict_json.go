package flow

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
)

func (m *Manifest) UnmarshalJSON(data []byte) error {
	if err := rejectDuplicateObjectKeys(data); err != nil {
		return err
	}
	if err := requireManifestFields(data); err != nil {
		return err
	}
	type alias Manifest
	var decoded alias
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&decoded); err != nil {
		return fmt.Errorf("strict flow manifest decode: %w", err)
	}
	var trailing any
	if err := decoder.Decode(&trailing); err != io.EOF {
		return fmt.Errorf("strict flow manifest decode: trailing JSON data")
	}
	*m = Manifest(decoded)
	return nil
}

func requireManifestFields(data []byte) error {
	var root map[string]json.RawMessage
	if err := json.Unmarshal(data, &root); err != nil || root == nil {
		return fmt.Errorf("flow manifest must be a JSON object")
	}
	required := []string{"schemaVersion", "flowId", "name", "version", "publisherId", "publisherKeyId", "entry", "minimumRuntimeVersion", "platforms", "files"}
	if err := requireFields(root, required); err != nil {
		return err
	}
	var files []map[string]json.RawMessage
	if err := json.Unmarshal(root["files"], &files); err != nil {
		return fmt.Errorf("flow manifest files must be an array")
	}
	for index, file := range files {
		if file == nil {
			return fmt.Errorf("flow manifest files[%d] must be an object", index)
		}
		if err := requireFields(file, []string{"path", "sha256", "size"}); err != nil {
			return fmt.Errorf("flow manifest files[%d]: %w", index, err)
		}
	}
	if commercialRaw, ok := root["commercial"]; ok {
		var commercial map[string]json.RawMessage
		if err := json.Unmarshal(commercialRaw, &commercial); err != nil || commercial == nil {
			return fmt.Errorf("flow manifest commercial must be an object")
		}
		if err := requireFields(commercial, []string{"productId", "licenseIssuerKeyId", "purposes"}); err != nil {
			return fmt.Errorf("flow manifest commercial: %w", err)
		}
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
					return fmt.Errorf("duplicate flow manifest key %q", key)
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
		return fmt.Errorf("flow manifest contains trailing JSON data")
	}
	return nil
}
