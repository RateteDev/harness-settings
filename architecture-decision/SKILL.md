---
name: architecture-decision
description: |
  重要な設計判断を Architecture Decision Record（ADR）として記録・参照するための規約スキル。ADR の成立条件、置き場、命名、章構成、書き方、監査方法を定める。
  TRIGGER when: 設計判断を ADR として記録・参照する場合、`docs/adr/` 配下を作成・編集する場合。
  DO NOT TRIGGER when: 実装プランや作業手順を書く場合、仕様書を書く場合、選択を伴わない調査結果や修正を記録する場合。
---

# Architecture Decision Record

ADR の規約本文は `references/adr.md` にある。ADR を新規作成・参照・監査する前に読むこと。

ADR は「なぜそう決めたか」を恒久的に残す。分岐があり、採らなかった選択肢を挙げられることが ADR の成立条件である。ほかに採りようのない修正や、判断を伴わない調査結果には ADR を作らない。

ADR は決定時点の記録として書き換えない。記述が現状と食い違う場合は、コードを直すか新しい ADR で判断を更新する。
