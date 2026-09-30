export interface SendTestEmailParams {
  apiKey: string;
  from: string;
  to: string;
  subject: string;
  text: string;
}

export interface SendTestEmailResult {
  sent: boolean;
  error: string | null;
}

// #1135: fetch が throw（ネットワーク障害・DNS失敗等）しても呼び出し側のハンドラが
// 例外終了しないよう、成功/失敗を値として返す。
export const sendTestEmail = async (
  params: SendTestEmailParams,
  fetchFn: typeof fetch = fetch,
): Promise<SendTestEmailResult> => {
  try {
    const res = await fetchFn("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${params.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: params.from,
        to: params.to,
        subject: params.subject,
        text: params.text,
      }),
    });
    if (res.ok) return { sent: true, error: null };
    console.error("Test email send failed:", await res.text());
    return { sent: false, error: "Failed to send test email" };
  } catch (err) {
    console.error("Test email send threw:", err);
    return { sent: false, error: "Failed to send test email" };
  }
};
