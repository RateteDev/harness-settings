package vm

import (
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"
	"unicode"

	hakofiles "github.com/RateteDev/harness-settings/environments/hako"
	"github.com/RateteDev/harness-settings/environments/hako/app/internal/layout"
)

const workerUsage = "使い方: hako-worker [ハーネス] <プロンプト>（プロンプトを別の会話として切り離して動かし、記録の場所を出力する。ハーネスを省くと、呼んだ側と同じハーネスで動かす）"

// Worker は、VMの中のエージェントが、長い作業を別の会話（作業役）として切り離して動かす。
// 作業役が動いている間は、VMを止めない。
func Worker(v layout.VM, args []string) error {
	h, p, err := ParseWorkerArgs(args, os.Getenv("HAKO_HARNESS"))
	if err != nil {
		return err
	}
	if p == "" {
		fmt.Println(workerUsage)
		return nil
	}
	if err := os.MkdirAll(v.Workers(), 0o755); err != nil {
		return err
	}
	id := fmt.Sprintf("%s-%d", time.Now().Format("20060102-150405"), os.Getpid())
	logPath := filepath.Join(v.Workers(), id+".log")
	cmd, err := harnessCmd(v, h, layout.ModeWorker, nil, "worker", p)
	if err != nil {
		return err
	}
	pid, err := spawnCommand(logPath, cmd)
	if err != nil {
		return err
	}
	if err := os.WriteFile(filepath.Join(v.Workers(), id+".pid"), []byte(strconv.Itoa(pid)+"\n"), 0o644); err != nil {
		return err
	}
	fmt.Printf("作業役を %s で起動しました。記録は %s にあります。\n", h, logPath)
	return nil
}

// ParseWorkerArgs は、hako-worker の引数からハーネスとプロンプトを決める。
// ハーネスを省いたときは、呼んだ側のハーネス（caller）を使う。使い方を出すだけのときは、プロンプトを空で返す。
func ParseWorkerArgs(args []string, caller string) (harness, prompt string, err error) {
	switch len(args) {
	case 1:
		harness, prompt = caller, args[0]
	case 2:
		harness, prompt = args[0], args[1]
	default:
		return "", "", exitError{2, workerUsage}
	}
	if len(args) == 1 && (prompt == "-h" || prompt == "--help") {
		return "", "", nil
	}
	// 有無や版を確かめるつもりの呼び出しで、作業役を起動しないようにする。空白を含む「- 〜」のような頼みごとは通す。
	if prompt == "" || (strings.HasPrefix(prompt, "-") && !strings.ContainsFunc(prompt, unicode.IsSpace)) {
		return "", "", exitError{2, "オプションはありません。" + workerUsage}
	}
	if harness == "" {
		return "", "", exitError{2, "呼んだ側のハーネスが分かりません。ハーネスを指定してください。" + workerUsage}
	}
	if !hakofiles.IsHarness(harness) {
		return "", "", exitError{2, fmt.Sprintf("知らないハーネスです: %s（%s）", harness, strings.Join(hakofiles.Harnesses(), "|"))}
	}
	return harness, prompt, nil
}
