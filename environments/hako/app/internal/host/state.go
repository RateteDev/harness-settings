package host

import (
	"os"
	"path/filepath"
)

// Paths は、ホストの中で hako が読み書きする場所。
type Paths struct {
	State string
}

func DefaultPaths() (Paths, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return Paths{}, err
	}
	st := os.Getenv("XDG_STATE_HOME")
	if st == "" {
		st = filepath.Join(home, ".local", "state")
	}
	return Paths{State: filepath.Join(st, "hako")}, nil
}

func (p Paths) TemplateSumFile() string { return filepath.Join(p.State, "template.sum") }

func writeAtomic(path string, b []byte, mode os.FileMode) error {
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return err
	}
	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, b, mode); err != nil {
		return err
	}
	return os.Rename(tmp, path)
}
