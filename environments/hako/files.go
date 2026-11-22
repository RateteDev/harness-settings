// Package hakofiles は、hako の実行ファイルに埋め込んで配るファイルを持つ。
// テンプレートの定義（Containerfile）、VMのエージェントに知らせること（hako_instructions.md）、
// ハーネスごとの起動方法（<ハーネス>/run など）は、このディレクトリに置いたものをそのまま埋め込む。
package hakofiles

import (
	"crypto/sha256"
	"embed"
	"encoding/hex"
	"fmt"
	"io/fs"
	"sort"
	"strings"
)

//go:embed Containerfile
var Containerfile []byte

//go:embed hako_instructions.md
var Instructions []byte

// ハーネスへ反映する設定（setup.sh など）は埋め込まず、VMがクローンした最新を使う。
// ここに埋め込むのは、hako の版と揃っていないと動かないものだけにする。
//
//go:embed */run */install */log.jq */credentials
var harnessFiles embed.FS

// HarnessFS は、埋め込んだファイルを <ハーネス>/<ファイル> の形で返す。
func HarnessFS() fs.FS { return harnessFiles }

// Harnesses は、run を持つディレクトリの名前をハーネスとして並べて返す。
func Harnesses() []string {
	entries, err := fs.ReadDir(harnessFiles, ".")
	if err != nil {
		panic(err)
	}
	var names []string
	for _, e := range entries {
		if e.IsDir() && HarnessFile(e.Name(), "run") != nil {
			names = append(names, e.Name())
		}
	}
	sort.Strings(names)
	return names
}

// IsHarness は、名前がハーネスかを返す。
func IsHarness(name string) bool {
	for _, n := range Harnesses() {
		if n == name {
			return true
		}
	}
	return false
}

// HarnessFile は、ハーネスの1つのファイルを返す。ないときは nil を返す。
func HarnessFile(harness, name string) []byte {
	b, err := fs.ReadFile(harnessFiles, harness+"/"+name)
	if err != nil {
		return nil
	}
	return b
}

// Credentials は、ハーネスがサインインの結果を置くファイルを、ホームからの相対で返す。
// hako は、ホストのこのファイルをVMの同じ場所へ写す。
func Credentials(harness string) []string {
	return ParseCredentials(HarnessFile(harness, "credentials"))
}

// ParseCredentials は、1行に1つのパスを読む。空行と # で始まる行は飛ばす。
func ParseCredentials(b []byte) []string {
	var paths []string
	for _, line := range strings.Split(string(b), "\n") {
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		paths = append(paths, line)
	}
	return paths
}

// TemplateSum は、テンプレートの中身を決めるファイル（Containerfile と各ハーネスの install）の要約。
// 作ったときの値と比べ、テンプレートを作り直すべきかを知る。
func TemplateSum() string {
	h := sha256.New()
	h.Write(Containerfile)
	for _, name := range Harnesses() {
		fmt.Fprintf(h, "\x00%s\x00", name)
		h.Write(HarnessFile(name, "install"))
	}
	return hex.EncodeToString(h.Sum(nil))
}
