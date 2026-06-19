export const canShare = () => "share" in navigator;

export const shareText = async (title: string, text: string): Promise<void> => {
  await navigator.share({ title, text });
};
