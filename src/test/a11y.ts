import axe from "axe-core";
import { expect } from "bun:test";

/**
 * #1088: `bun test`（`src/**\/*.test.tsx`）のコンポーネント単体テストからaxe-core
 * を直接実行するためのヘルパー。既存の2系統の自動アクセシビリティチェック
 * （`.github/workflows/_a11y.yml`のStorybookスナップショット、
 * `e2e/fixtures/a11y.ts`の`expectNoA11yViolations()`によるE2Eの3ダイアログ限定
 * チェック）はいずれも「Storyとして書かれたコンポーネント」または「E2Eでルー
 * ティングして辿り着ける手動選定済みの状態」のみが対象で、それ以外の内部
 * コンポーネント状態（条件分岐で出し分けられる特定のprops組み合わせ等）は
 * カバーされていなかった（docs/specs/accessibility.md の Known gaps）。
 *
 * `e2e/fixtures/a11y.ts`と同名の`expectNoA11yViolations`をあえて踏襲しているが、
 * axe-core本体を@testing-library/reactがレンダリングしたDOM（happy-dom）に対して
 * 直接実行する点が異なり、Playwrightの実ブラウザ・実ルーティングは介さない。
 * 全コンポーネントへの一括導入はせず、新規・変更したmolecules/organismsの
 * テストから段階的に追加する運用を想定している（Issue #1088）。
 */
export const expectNoA11yViolations = async (container: Element): Promise<void> => {
  const results = await axe.run(container);
  expect(results.violations, formatViolations(results.violations)).toEqual([]);
};

const formatViolations = (violations: axe.Result[]): string => {
  if (violations.length === 0) return "";
  return violations
    .map(
      (v) =>
        `- [${v.id}] ${v.help} (${v.nodes.length} node(s): ${v.nodes
          .map((n) => n.html)
          .join(", ")})`,
    )
    .join("\n");
};
