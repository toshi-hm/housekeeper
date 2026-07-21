import { render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "bun:test";
import { useState } from "react";

import { TotpCodeInput } from "./TotpCodeInput";

// TotpCodeInput is a controlled component, so exercising it through real
// keystrokes (userEvent) requires a small stateful wrapper — a plain mock
// onChange never feeds the new value back into the `value` prop, and this
// project's test env (happy-dom + React 19) does not reliably fire
// onChange for a single fireEvent.change on a controlled <input>.
const TotpCodeInputHarness = ({ initial = "" }: { initial?: string }) => {
  const [value, setValue] = useState(initial);
  return <TotpCodeInput value={value} onChange={setValue} />;
};

describe("TotpCodeInput", () => {
  it("strips non-digit characters as the user types", async () => {
    const user = userEvent.setup();
    const { getByRole } = render(<TotpCodeInputHarness />);

    await user.type(getByRole("textbox"), "12a3b4");

    expect((getByRole("textbox") as HTMLInputElement).value).toBe("1234");
  });

  it("truncates input to 6 digits", async () => {
    const user = userEvent.setup();
    const { getByRole } = render(<TotpCodeInputHarness />);

    await user.type(getByRole("textbox"), "12345678");

    expect((getByRole("textbox") as HTMLInputElement).value).toBe("123456");
  });

  it("renders the current value", () => {
    const { getByRole } = render(<TotpCodeInput value="654321" onChange={() => {}} />);

    expect((getByRole("textbox") as HTMLInputElement).value).toBe("654321");
  });

  it("respects the disabled prop", () => {
    const { getByRole } = render(
      <TotpCodeInput value="" onChange={() => {}} disabled autoFocus={false} />,
    );

    expect((getByRole("textbox") as HTMLInputElement).disabled).toBe(true);
  });
});
