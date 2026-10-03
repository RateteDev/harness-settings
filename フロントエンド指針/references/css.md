# CSS ガイド

## 基本方針

CSS はデザイントークンを定義し、それを参照する形で記述する。
値のハードコードを避け、トークン経由で一貫性を保つ。

## デザイントークン

色・余白・タイポグラフィ・影・角丸などの値は CSS Custom Properties でトークンとして定義し、コンポーネントやユーティリティから参照する。

### トークンの階層

トークンは 2 階層で管理する。

1. **Primitive Token** — 値そのものに名前を付ける。直接参照しない。
2. **Semantic Token** — 用途に名前を付け、Primitive Token を参照する。コンポーネントが参照するのはこの階層のみ。

```css
/* Primitive: what the value IS */
:root {
  --space-1: 0.25rem;
  --space-2: 0.5rem;
  --space-4: 1rem;
  --space-8: 2rem;

  --font-size-sm: 0.875rem;
  --font-size-base: 1rem;
  --font-size-lg: 1.25rem;
  --font-size-xl: 1.5rem;

  --radius-sm: 2px;
  --radius-md: 4px;
  --radius-lg: 8px;

  --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.05);
  --shadow-md: 0 2px 4px rgba(0, 0, 0, 0.1);
}

/* Semantic: what the value DOES */
:root {
  --gap-inline: var(--space-4);
  --gap-block: var(--space-4);
  --gap-component: var(--space-2);

  --font-size-body: var(--font-size-base);
  --font-size-heading: var(--font-size-xl);
  --font-size-caption: var(--font-size-sm);

  --radius-button: var(--radius-md);
  --radius-card: var(--radius-lg);

  --shadow-card: var(--shadow-md);
}
```

### カラートークン

カラートークンはテーマ切り替えの軸になるため、Semantic 階層で定義し `data-theme` 属性で切り替える。
具体的なパレット定義はプロジェクトごとに用意する。

```css
[data-theme="light"] {
  --color-bg: #ffffff;
  --color-text: #1c1c1c;
  --color-primary: #4a4a4a;
  --color-border: #e0e0e0;
}

[data-theme="dark"] {
  --color-bg: #121214;
  --color-text: #e2e0dd;
  --color-primary: #a8a4a0;
  --color-border: #333338;
}
```

### トークンの命名規則

| 種別 | Primitive の命名 | Semantic の命名 |
|------|-----------------|----------------|
| 色 | `--color-{hue}-{shade}` | `--color-{role}` (`bg`, `text`, `primary`, `border`, `error` …) |
| 余白 | `--space-{scale}` (1, 2, 4, 8 …) | `--gap-{context}` (`inline`, `block`, `component` …) |
| 文字 | `--font-size-{size}` (sm, base, lg …) | `--font-size-{role}` (`body`, `heading`, `caption` …) |
| 角丸 | `--radius-{size}` (sm, md, lg) | `--radius-{element}` (`button`, `card`, `input` …) |
| 影 | `--shadow-{size}` (sm, md, lg) | `--shadow-{element}` (`card`, `dropdown` …) |

## 禁止事項

- Semantic Token を経由せずに Primitive Token やマジックナンバーを直接使用しない。
- `!important` の使用は原則禁止。詳細度の設計で解決する。
- コンポーネント内でグローバルなセレクタ（`body`, `*`, タグセレクタ）を使用しない。
