import { render } from "@testing-library/react";
import { describe, expect, test } from "bun:test";

import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

describe("Card", () => {
  test("全サブコンポーネントを描画できる", () => {
    const { getByText, container } = render(
      <Card className="custom-card">
        <CardHeader>
          <CardTitle>タイトル</CardTitle>
          <CardDescription>説明文</CardDescription>
        </CardHeader>
        <CardContent>本文</CardContent>
        <CardFooter>フッター</CardFooter>
      </Card>,
    );

    expect(getByText("タイトル").tagName).toBe("H3");
    expect(getByText("説明文").tagName).toBe("P");
    expect(getByText("本文")).toBeTruthy();
    expect(getByText("フッター")).toBeTruthy();
    expect(container.querySelector(".custom-card")).not.toBeNull();
  });
});
